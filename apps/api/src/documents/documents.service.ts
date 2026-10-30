import { BadRequestException, ConflictException, ForbiddenException, HttpException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { DocumentDetail, DocumentEvent, DocumentList, DocumentSummary, DocumentVersion } from '@sentinelle/contracts';
import { Database, type TenantSession } from '../database.js';
import type { Principal } from '../auth.js';
import { CreateDocumentDto, DecideVersionDto, DocumentQuery, EditVersionDto, NewVersionDto, ReceiptQuery, DocumentDistributionDto, CancelDistributionDto, DocumentReminderDto, VersionInput } from './dto.js';
import { decideDocument, DocumentWorkflowError, validateParticipants } from './workflow.mjs';

const documentColumns = `d.id,d.code,d.title,d.site_id AS "siteId",s.name AS "siteName",d.last_version AS "lastVersion",v.status,d.updated_at AS "updatedAt"`;
const visibleLatest = `JOIN LATERAL (SELECT status FROM app.document_versions WHERE document_id=d.id ORDER BY number DESC LIMIT 1) v ON true`;
const versionColumns = `v.id,v.number,v.content,v.content_sha256 AS "contentSha256",v.status,v.author_id AS "authorId",
  v.reviewer_id AS "reviewerId",v.approver_id AS "approverId",v.revision,v.reviewed_at AS "reviewedAt",v.approved_at AS "approvedAt",
  v.decision_note AS "decisionNote",v.created_at AS "createdAt",v.attachments_sha256 AS "attachmentsSha256",EXISTS(SELECT 1 FROM app.document_receipts r WHERE r.version_id=v.id AND r.user_id=identity.actor_id()) AS acknowledged`;

@Injectable()
export class DocumentsService {
  constructor(private readonly database: Database) {}
  private write(session: TenantSession) { if (!session.canWrite) throw new ForbiddenException('Accès en lecture seule.'); }
  private async lock(session: TenantSession,id: string) {
    await session.db.query('SELECT pg_advisory_xact_lock(hashtextextended($1::uuid::text,0))',[id]);
    const result=await session.db.query<{ id: string; siteId: string; lastVersion: number }>(`SELECT id,site_id AS "siteId",last_version AS "lastVersion"
      FROM app.documents WHERE tenant_id=$1 AND id=$2`,[session.tenant.id,id]);
    if (!result.rows[0]) throw new NotFoundException('Document introuvable.');
    return result.rows[0];
  }
  private async version(session: TenantSession,documentId: string,id: string,revision: number) {
    const result=await session.db.query<DocumentVersion>(`SELECT ${versionColumns} FROM app.document_versions v
      WHERE tenant_id=$1 AND document_id=$2 AND id=$3`,[session.tenant.id,documentId,id]);
    if (!result.rows[0]) throw new NotFoundException('Version introuvable.');
    if (result.rows[0].revision!==revision) throw new ConflictException('Cette version a changé. Actualisez avant de recommencer.');
    return result.rows[0];
  }
  private async participants(session: TenantSession,site: string,input: VersionInput) {
    try { validateParticipants(session.actor.id,input.reviewerId,input.approverId); }
    catch (error) { if (error instanceof DocumentWorkflowError) throw new HttpException(error.message,error.status); throw error; }
    const { rows }=await session.db.query(`SELECT identity.can_review_site($1,$2,$3) AND identity.can_review_site($1,$2,$4) AS allowed`,
      [session.tenant.id,site,input.reviewerId,input.approverId]);
    if (!rows[0].allowed) throw new BadRequestException('Vérificateur ou approbateur non habilité pour ce site.');
  }
  private async insertVersion(session: TenantSession,document: string,site: string,number: number,input: VersionInput) {
    const id=randomUUID();
    await session.db.query(`INSERT INTO app.document_versions(id,tenant_id,site_id,document_id,number,content,author_id,reviewer_id,approver_id)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,[id,session.tenant.id,site,document,number,input.content,session.actor.id,input.reviewerId,input.approverId]);
    return id;
  }
  private async detailIn(session: TenantSession,id: string): Promise<DocumentDetail> {
    const { db,tenant }=session;
    const document=await db.query<DocumentSummary>(`SELECT ${documentColumns} FROM app.documents d JOIN app.sites s ON s.id=d.site_id
      ${visibleLatest} WHERE d.tenant_id=$1 AND d.id=$2`,[tenant.id,id]);
    if (!document.rows[0]) throw new NotFoundException('Document introuvable.');
    const versions=await db.query<DocumentVersion>(`SELECT ${versionColumns} FROM app.document_versions v WHERE tenant_id=$1 AND document_id=$2 ORDER BY number DESC`,[tenant.id,id]);
    return { document: document.rows[0],versions: versions.rows };
  }
  async list(principal: Principal,tenant: string|undefined,query: DocumentQuery): Promise<DocumentList> {
    return this.database.withTenant(principal,tenant,async session=>{
      const params=[session.tenant.id,query.siteId||null,query.search||''];
      const where=`WHERE d.tenant_id=$1 AND ($2::uuid IS NULL OR d.site_id=$2) AND ($3::text='' OR strpos(lower(d.title||' '||d.code),lower($3))>0)`;
      const count=await session.db.query(`SELECT count(*)::integer AS total FROM app.documents d ${where}`,params);
      const result=await session.db.query<DocumentSummary>(`SELECT ${documentColumns} FROM app.documents d JOIN app.sites s ON s.id=d.site_id ${visibleLatest}
        ${where} ORDER BY d.updated_at DESC,d.id LIMIT $4 OFFSET $5`,[...params,query.limit,query.offset]);
      return { items: result.rows,total: count.rows[0].total };
    });
  }
  detail(principal: Principal,tenant: string|undefined,id: string) { return this.database.withTenant(principal,tenant,session=>this.detailIn(session,id)); }
  async create(principal: Principal,tenant: string|undefined,input: CreateDocumentDto) {
    try {
      return await this.database.withTenant(principal,tenant,async session=>{
        this.write(session); await this.participants(session,input.siteId,input);
        const id=randomUUID();
        await session.db.query('INSERT INTO app.documents(id,tenant_id,site_id,code,title) VALUES($1,$2,$3,$4,$5)',[id,session.tenant.id,input.siteId,input.code,input.title]);
        await this.insertVersion(session,id,input.siteId,1,input);
        return this.detailIn(session,id);
      });
    } catch (error) { if ((error as { code?: string }).code==='23505') throw new ConflictException('Ce code documentaire existe déjà.'); throw error; }
  }
  newVersion(principal: Principal,tenant: string|undefined,id: string,input: NewVersionDto) {
    return this.database.withTenant(principal,tenant,async session=>{
      this.write(session); const document=await this.lock(session,id);
      if (document.lastVersion!==input.expectedLastVersion) throw new ConflictException('Une autre version a été créée.');
      const latest=await session.db.query<{ number: number; status: string }>('SELECT number,status FROM app.document_versions WHERE document_id=$1 ORDER BY number DESC LIMIT 1',[id]);
      if (!latest.rows[0] || latest.rows[0].number!==document.lastVersion || !['published','rejected'].includes(latest.rows[0].status)) throw new ConflictException('Une version est déjà en cours de traitement.');
      await this.participants(session,document.siteId,input);
      await session.db.query('UPDATE app.documents SET last_version=last_version+1,updated_at=clock_timestamp() WHERE id=$1',[id]);
      await this.insertVersion(session,id,document.siteId,document.lastVersion+1,input);
      return this.detailIn(session,id);
    });
  }
  edit(principal: Principal,tenant: string|undefined,id: string,versionId: string,input: EditVersionDto) {
    return this.database.withTenant(principal,tenant,async session=>{
      this.write(session); await this.lock(session,id); const version=await this.version(session,id,versionId,input.revision);
      if (version.status!=='draft') throw new ConflictException('Le contenu soumis est figé. Créez une nouvelle version.');
      if (version.authorId!==session.actor.id) throw new ForbiddenException('Seul l’auteur peut modifier le brouillon.');
      await session.db.query('UPDATE app.document_versions SET content=$2,revision=revision+1 WHERE id=$1',[versionId,input.content]);
      await session.db.query('UPDATE app.documents SET updated_at=clock_timestamp() WHERE id=$1',[id]);
      return this.detailIn(session,id);
    });
  }
  decide(principal: Principal,tenant: string|undefined,id: string,versionId: string,input: DecideVersionDto) {
    return this.database.withTenant(principal,tenant,async session=>{
      this.write(session); await this.lock(session,id); const version=await this.version(session,id,versionId,input.revision);
      let status: string;
      try { status=decideDocument(version,input.command,session.actor.id,session.canWrite); }
      catch (error) { if (error instanceof DocumentWorkflowError) throw new HttpException(error.message,error.status); throw error; }
      if (input.command==='reject' && !input.note?.trim()) throw new BadRequestException('Un motif est obligatoire pour retourner un document.');
      if(input.command==='submit'){
        const pending=await session.db.query("SELECT id FROM app.attachments WHERE tenant_id=$1 AND document_version_id=$2 AND status='pending' LIMIT 1",[session.tenant.id,versionId]);
        if(pending.rowCount)throw new ConflictException('Terminez ou annulez les envois de fichiers avant de soumettre cette version.');
      }
      if (status==='published') await session.db.query("UPDATE app.document_versions SET status='archived',revision=revision+1 WHERE document_id=$1 AND status='published'",[id]);
      await session.db.query(`UPDATE app.document_versions SET status=$2,revision=revision+1,decision_note=$3,
        reviewed_at=CASE WHEN $2='pending_approval' THEN clock_timestamp() ELSE reviewed_at END,
        approved_at=CASE WHEN $2='published' THEN clock_timestamp() ELSE approved_at END WHERE id=$1`,[versionId,status,input.note?.trim()||null]);
      await session.db.query('UPDATE app.documents SET updated_at=clock_timestamp() WHERE id=$1',[id]);
      return this.detailIn(session,id);
    });
  }
  acknowledge(principal: Principal,tenant: string|undefined,id: string,versionId: string) {
    return this.database.withTenant(principal,tenant,async session=>{
      // Publication and replacement also lock the document first: no acknowledgement of a just-archived version.
      await this.lock(session,id);
      const result=await session.db.query<{ site_id: string; status: string }>('SELECT site_id,status FROM app.document_versions WHERE document_id=$1 AND id=$2',[id,versionId]);
      if (!result.rows[0]) throw new NotFoundException('Version introuvable.');
      if (result.rows[0].status!=='published') throw new ConflictException('Seule la version publiée peut être accusée de lecture.');
      await session.db.query(`INSERT INTO app.document_receipts(tenant_id,site_id,version_id,user_id) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING`,[session.tenant.id,result.rows[0].site_id,versionId,session.actor.id]);
      return this.detailIn(session,id);
    });
  }
  receipts(principal: Principal,tenant: string|undefined,id: string,versionId: string,query: ReceiptQuery) {
    return this.database.withTenant(principal,tenant,async session=>{
      this.write(session);
      const version=await session.db.query<{siteId:string;status:string}>(`SELECT site_id AS "siteId",status FROM app.document_versions
        WHERE tenant_id=$1 AND document_id=$2 AND id=$3`,[session.tenant.id,id,versionId]);
      if(!version.rows[0])throw new NotFoundException('Version introuvable.');
      const allowed=await session.db.query('SELECT identity.can_write_site($1,$2) AS allowed',[session.tenant.id,version.rows[0].siteId]);
      if(!allowed.rows[0].allowed)throw new ForbiddenException('Vous ne pouvez pas consulter les lectures de ce site.');
      if(!['published','archived'].includes(version.rows[0].status))throw new ConflictException('Cette version n’a pas été publiée.');
      const args=[session.tenant.id,versionId];
      const count=await session.db.query('SELECT count(*)::int AS total FROM app.document_receipts WHERE tenant_id=$1 AND version_id=$2',args);
      const result=await session.db.query(`SELECT r.user_id AS "userId",u.name AS "userName",r.acknowledged_at AS "acknowledgedAt"
        FROM app.document_receipts r LEFT JOIN identity.list_members($1) u ON u.id=r.user_id
        WHERE r.tenant_id=$1 AND r.version_id=$2 ORDER BY r.acknowledged_at DESC,r.user_id LIMIT $3 OFFSET $4`,[...args,query.limit,query.offset]);
      return {items:result.rows,total:count.rows[0].total};
    });
  }
  distribution(principal:Principal,tenant:string|undefined,id:string,versionId:string,query:ReceiptQuery) {
    return this.database.withTenant(principal,tenant,async session=>{
      this.write(session);const version=await session.db.query<{site_id:string;status:string}>('SELECT site_id,status FROM app.document_versions WHERE tenant_id=$1 AND document_id=$2 AND id=$3',[session.tenant.id,id,versionId]);
      if(!version.rows[0])throw new NotFoundException('Version introuvable.');
      const permission=await session.db.query('SELECT identity.can_write_site($1,$2) AS allowed',[session.tenant.id,version.rows[0].site_id]);if(!permission.rows[0].allowed)throw new ForbiddenException('Site non autorisé.');
      if(!['published','archived'].includes(version.rows[0].status))throw new ConflictException('Cette version n’a pas été publiée.');
      const args=[session.tenant.id,versionId];const count=await session.db.query(`SELECT count(*)::int AS total,count(*) FILTER(WHERE c.recipient_id IS NULL)::int AS active,count(*) FILTER(WHERE c.recipient_id IS NULL AND r.user_id IS NOT NULL)::int AS acknowledged
        FROM app.document_distribution d LEFT JOIN app.document_receipts r ON r.tenant_id=d.tenant_id AND r.version_id=d.version_id AND r.user_id=d.recipient_id LEFT JOIN app.document_distribution_cancellations c ON c.tenant_id=d.tenant_id AND c.version_id=d.version_id AND c.recipient_id=d.recipient_id WHERE d.tenant_id=$1 AND d.version_id=$2`,args);
      const {rows}=await session.db.query(`SELECT d.recipient_id AS "recipientId",u.name AS "recipientName",d.assigned_by AS "assignedBy",d.assigned_at AS "assignedAt",r.acknowledged_at AS "acknowledgedAt",c.cancelled_at AS "cancelledAt",c.cancelled_by AS "cancelledBy",c.reason AS "cancellationReason",(SELECT max(rem.created_at) FROM app.document_reminders rem WHERE rem.tenant_id=d.tenant_id AND rem.version_id=d.version_id AND rem.recipient_id=d.recipient_id) AS "lastReminderAt"
        FROM app.document_distribution d LEFT JOIN identity.list_members($1) u ON u.id=d.recipient_id LEFT JOIN app.document_receipts r ON r.tenant_id=d.tenant_id AND r.version_id=d.version_id AND r.user_id=d.recipient_id LEFT JOIN app.document_distribution_cancellations c ON c.tenant_id=d.tenant_id AND c.version_id=d.version_id AND c.recipient_id=d.recipient_id
        WHERE d.tenant_id=$1 AND d.version_id=$2 ORDER BY d.assigned_at DESC,d.recipient_id LIMIT $3 OFFSET $4`,[...args,query.limit,query.offset]);
      return {items:rows,...count.rows[0]};
    });
  }
  assignDistribution(principal:Principal,tenant:string|undefined,id:string,versionId:string,input:DocumentDistributionDto) {
    return this.database.withTenant(principal,tenant,async session=>{
      this.write(session);const document=await this.lock(session,id);
      const version=await session.db.query<{status:string}>('SELECT status FROM app.document_versions WHERE tenant_id=$1 AND document_id=$2 AND id=$3',[session.tenant.id,id,versionId]);
      if(!version.rows[0])throw new NotFoundException('Version introuvable.');
      if(version.rows[0].status!=='published')throw new ConflictException('Seule une version publiée peut être diffusée.');
      const valid=await session.db.query<{allowed:boolean}>('SELECT bool_and(identity.can_assign_site($1,$2,recipient)) AS allowed FROM unnest($3::uuid[]) recipient',[session.tenant.id,document.siteId,input.recipientIds]);
      if(!valid.rows[0].allowed)throw new BadRequestException('Chaque destinataire doit être actif et habilité sur le site du document.');
      const cancelled=await session.db.query('SELECT 1 FROM app.document_distribution_cancellations WHERE tenant_id=$1 AND version_id=$2 AND recipient_id=ANY($3::uuid[]) LIMIT 1',[session.tenant.id,versionId,input.recipientIds]);
      if(cancelled.rowCount)throw new ConflictException('Une affectation annulée ne peut pas être réactivée sur cette version.');
      for(const recipient of input.recipientIds)await session.db.query(`INSERT INTO app.document_distribution(tenant_id,site_id,version_id,recipient_id,assigned_by) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING`,[session.tenant.id,document.siteId,versionId,recipient,session.actor.id]);
      return {processed:input.recipientIds.length};
    });
  }
  cancelDistribution(principal:Principal,tenant:string|undefined,id:string,versionId:string,recipientId:string,input:CancelDistributionDto) {
    return this.database.withTenant(principal,tenant,async session=>{
      this.write(session);const document=await this.lock(session,id);
      const version=await session.db.query<{status:string}>('SELECT status FROM app.document_versions WHERE tenant_id=$1 AND document_id=$2 AND id=$3',[session.tenant.id,id,versionId]);
      if(!version.rows[0])throw new NotFoundException('Version introuvable.');
      const existing=await session.db.query('SELECT cancelled_by,reason,request_key FROM app.document_distribution_cancellations WHERE tenant_id=$1 AND version_id=$2 AND recipient_id=$3',[session.tenant.id,versionId,recipientId]);
      if(existing.rows[0]){const item=existing.rows[0];if(item.cancelled_by===session.actor.id&&item.request_key===input.idempotencyKey&&item.reason===input.reason)return {cancelled:true};throw new ConflictException('Cette affectation a déjà été annulée.');}
      if(version.rows[0].status!=='published')throw new ConflictException('Seule une diffusion active peut être annulée.');
      const target=await session.db.query('SELECT 1 FROM app.document_distribution WHERE tenant_id=$1 AND version_id=$2 AND recipient_id=$3',[session.tenant.id,versionId,recipientId]);
      if(!target.rowCount)throw new NotFoundException('Destinataire introuvable.');
      const reused=await session.db.query('SELECT 1 FROM app.document_distribution_cancellations WHERE tenant_id=$1 AND version_id=$2 AND cancelled_by=$3 AND request_key=$4',[session.tenant.id,versionId,session.actor.id,input.idempotencyKey]);
      if(reused.rowCount)throw new ConflictException('Cette clé correspond à une autre annulation.');
      await session.db.query('INSERT INTO app.document_distribution_cancellations(tenant_id,site_id,version_id,recipient_id,cancelled_by,reason,request_key) VALUES($1,$2,$3,$4,$5,$6,$7)',[session.tenant.id,document.siteId,versionId,recipientId,session.actor.id,input.reason,input.idempotencyKey]);
      return {cancelled:true};
    });
  }
  remind(principal:Principal,tenant:string|undefined,id:string,versionId:string,recipientId:string,input:DocumentReminderDto) {
    return this.database.withTenant(principal,tenant,async session=>{
      this.write(session);const document=await this.lock(session,id);const {db,actor}=session;
      const previous=await db.query('SELECT id,recipient_id FROM app.document_reminders WHERE tenant_id=$1 AND version_id=$2 AND actor_id=$3 AND request_key=$4',[session.tenant.id,versionId,actor.id,input.idempotencyKey]);
      if(previous.rows[0]){if(previous.rows[0].recipient_id!==recipientId)throw new ConflictException('Cette clé correspond à une autre relance.');return {id:previous.rows[0].id};}
      const target=await db.query(`SELECT v.status,identity.can_assign_site($1,$2,$4) AS allowed,c.recipient_id IS NOT NULL AS cancelled,r.user_id IS NOT NULL AS acknowledged
        FROM app.document_versions v JOIN app.document_distribution d ON d.tenant_id=v.tenant_id AND d.version_id=v.id AND d.recipient_id=$4
        LEFT JOIN app.document_distribution_cancellations c ON c.tenant_id=d.tenant_id AND c.version_id=d.version_id AND c.recipient_id=d.recipient_id
        LEFT JOIN app.document_receipts r ON r.tenant_id=d.tenant_id AND r.version_id=d.version_id AND r.user_id=d.recipient_id
        WHERE v.tenant_id=$1 AND v.site_id=$2 AND v.document_id=$3 AND v.id=$5`,[session.tenant.id,document.siteId,id,recipientId,versionId]);
      if(!target.rows[0])throw new NotFoundException('Affectation introuvable.');
      if(recipientId===actor.id||!target.rows[0].allowed||target.rows[0].cancelled||target.rows[0].acknowledged||target.rows[0].status!=='published')throw new ConflictException('Cette affectation ne peut pas être relancée.');
      const last=await db.query("SELECT created_at FROM app.document_reminders WHERE tenant_id=$1 AND version_id=$2 AND recipient_id=$3 AND created_at>clock_timestamp()-interval '24 hours'",[session.tenant.id,versionId,recipientId]);
      if(last.rowCount)throw new ConflictException('Une relance a déjà été enregistrée au cours des dernières 24 heures.');
      const reminderId=randomUUID();await db.query('INSERT INTO app.document_reminders(id,tenant_id,site_id,version_id,recipient_id,actor_id,request_key) VALUES($1,$2,$3,$4,$5,$6,$7)',[reminderId,session.tenant.id,document.siteId,versionId,recipientId,actor.id,input.idempotencyKey]);return {id:reminderId};
    });
  }
  history(principal: Principal,tenant: string|undefined,id: string): Promise<DocumentEvent[]> {
    return this.database.withTenant(principal,tenant,async session=>{
      await this.detailIn(session,id);
      const result=await session.db.query<DocumentEvent>(`SELECT e.id,e.version_id AS "versionId",e.actor_id AS "actorId",e.operation,e.occurred_at AS "occurredAt",e.before_data AS "before",e.after_data AS "after"
        FROM app.document_events e JOIN app.document_versions v ON v.id=e.version_id WHERE v.document_id=$1 ORDER BY e.occurred_at DESC,e.id LIMIT 100`,[id]);
      return result.rows;
    });
  }
}
