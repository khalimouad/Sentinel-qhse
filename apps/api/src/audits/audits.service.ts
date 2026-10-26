import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { AuditFinding, AuditTemplate, QualityAudit, QualityAuditDetail, QualityAuditList, ReportEvent } from '@sentinelle/contracts';
import type { Principal } from '../auth.js';
import { Database, type TenantSession } from '../database.js';
import { ApplyAuditTemplateDto } from './templates.dto.js';
import { templateColumns, templateUses } from './templates.service.js';
import { AuditFindingDto, AuditQuery, CreateAuditDto, DecideAuditDto, SaveChecklistDto, UpdateAuditPlanDto } from './dto.js';
const columns=`a.id,a.title,a.standard,a.scope,a.site_id AS "siteId",s.name AS "siteName",a.starts_on::text AS "startsOn",a.ends_on::text AS "endsOn",
  a.lead_id AS "leadId",a.auditee_id AS "auditeeId",a.created_by AS "createdBy",a.status,a.checklist,a.conclusion,a.replan_reason AS "replanReason",a.revision,
  a.report_snapshot AS "reportSnapshot",a.completed_at AS "completedAt",a.created_at AS "createdAt",a.updated_at AS "updatedAt"`;
const joins='FROM app.audits a JOIN app.sites s ON s.id=a.site_id';
@Injectable()
export class AuditsService {
  constructor(private readonly database:Database) {}
  private access(session:TenantSession) {
    if(!session.canWrite) throw new ForbiddenException('Les audits opérationnels sont réservés aux responsables habilités du site.');
  }
  private async detailIn(session:TenantSession,id:string):Promise<QualityAuditDetail> {
    this.access(session);
    const {rows}=await session.db.query<QualityAudit>(`SELECT ${columns} ${joins} WHERE a.tenant_id=$1 AND a.id=$2`,[session.tenant.id,id]);
    if(!rows[0])throw new NotFoundException('Audit introuvable.');
    const findings=await session.db.query<AuditFinding>(`SELECT f.id,f.item_id AS "itemId",f.report_id AS "reportId",f.created_by AS "createdBy",f.created_at AS "createdAt",r.status AS "reportStatus"
      FROM app.audit_findings f JOIN app.reports r ON r.id=f.report_id AND r.tenant_id=f.tenant_id WHERE f.tenant_id=$1 AND f.audit_id=$2 ORDER BY f.created_at,f.id`,[session.tenant.id,id]);
    return {audit:rows[0],findings:findings.rows,templateUses:await templateUses(session,id)};
  }
  private async lock(session:TenantSession,id:string,revision:number,leadOnly=true) {
    this.access(session);
    const locked=await session.db.query('SELECT id FROM app.audits WHERE tenant_id=$1 AND id=$2 FOR UPDATE',[session.tenant.id,id]);
    if(!locked.rowCount)throw new NotFoundException('Audit introuvable.');
    const detail=await this.detailIn(session,id);
    if(detail.audit.revision!==revision)throw new ConflictException('L’audit a changé. Actualisez avant de recommencer.');
    if(leadOnly&&detail.audit.leadId!==session.actor.id)throw new ForbiddenException('Cette étape est réservée au responsable d’audit désigné.');
    return detail;
  }
  list(principal:Principal,tenant:string|undefined,query:AuditQuery):Promise<QualityAuditList> {
    return this.database.withTenant(principal,tenant,async session=>{
      this.access(session);
      const where=`WHERE a.tenant_id=$1 AND ($2::uuid IS NULL OR a.site_id=$2) AND ($3::text IS NULL OR a.status=$3) AND ($4::text='' OR strpos(lower(a.title||' '||a.standard),lower($4))>0)`;
      const args=[session.tenant.id,query.siteId||null,query.status||null,query.search||''];
      const count=await session.db.query(`SELECT count(*)::int AS total FROM app.audits a ${where}`,args);
      const {rows}=await session.db.query<QualityAudit>(`SELECT ${columns} ${joins} ${where} ORDER BY a.starts_on DESC,a.id LIMIT $5 OFFSET $6`,[...args,query.limit,query.offset]);
      return {items:rows,total:count.rows[0].total};
    });
  }
  detail(principal:Principal,tenant:string|undefined,id:string) { return this.database.withTenant(principal,tenant,session=>this.detailIn(session,id)); }
  create(principal:Principal,tenant:string|undefined,input:CreateAuditDto) {
    return this.database.withTenant(principal,tenant,async session=>{
      this.access(session);
      if(input.endsOn<input.startsOn)throw new BadRequestException('La fin de l’audit doit suivre son début.');
      if(input.leadId.toLowerCase()===input.auditeeId.toLowerCase())throw new BadRequestException('Le responsable d’audit et le responsable audité doivent être différents.');
      const eligible=await session.db.query('SELECT identity.can_review_site($1,$2,$3) AND identity.can_review_site($1,$2,$4) AS allowed',[session.tenant.id,input.siteId,input.leadId,input.auditeeId]);
      if(!eligible.rows[0].allowed)throw new BadRequestException('Les participants doivent être responsables habilités sur ce site.');
      const id=randomUUID();
      await session.db.query(`INSERT INTO app.audits(id,tenant_id,site_id,title,standard,scope,starts_on,ends_on,lead_id,auditee_id,created_by)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,[id,session.tenant.id,input.siteId,input.title,input.standard,input.scope,input.startsOn,input.endsOn,input.leadId,input.auditeeId,session.actor.id]);
      return this.detailIn(session,id);
    });
  }
  replan(principal:Principal,tenant:string|undefined,id:string,input:UpdateAuditPlanDto) {
    return this.database.withTenant(principal,tenant,async session=>{
      const {audit}=await this.lock(session,id,input.revision,false);
      if(audit.status!=='planned')throw new ConflictException('La planification est figée dès le démarrage de l’audit.');
      if(input.endsOn<input.startsOn)throw new BadRequestException('La fin de l’audit doit suivre son début.');
      const leadId=input.leadId.toLowerCase(),auditeeId=input.auditeeId.toLowerCase();
      if(leadId===auditeeId)throw new BadRequestException('Le responsable d’audit et le responsable audité doivent être différents.');
      const eligible=await session.db.query('SELECT identity.can_review_site($1,$2,$3) AND identity.can_review_site($1,$2,$4) AS allowed',[session.tenant.id,audit.siteId,leadId,auditeeId]);
      if(!eligible.rows[0].allowed)throw new BadRequestException('Les participants doivent être responsables habilités sur ce site.');
      if(input.title===audit.title&&input.standard===audit.standard&&input.scope===audit.scope&&input.startsOn===audit.startsOn&&input.endsOn===audit.endsOn&&leadId===audit.leadId&&auditeeId===audit.auditeeId)
        throw new BadRequestException('Modifiez au moins un élément du plan avant d’enregistrer.');
      await session.db.query(`UPDATE app.audits SET title=$3,standard=$4,scope=$5,starts_on=$6,ends_on=$7,lead_id=$8,auditee_id=$9,replan_reason=$10
        WHERE tenant_id=$1 AND id=$2`,[session.tenant.id,id,input.title,input.standard,input.scope,input.startsOn,input.endsOn,leadId,auditeeId,input.reason]);
      return this.detailIn(session,id);
    });
  }
  checklist(principal:Principal,tenant:string|undefined,id:string,input:SaveChecklistDto) {
    return this.database.withTenant(principal,tenant,async session=>{
      const {audit,findings}=await this.lock(session,id,input.revision);
      if(!['planned','in_progress'].includes(audit.status))throw new ConflictException('Cet audit est figé.');
      if(audit.status==='planned'&&input.checklist.some(item=>item.result!=='pending'||item.evidence))throw new BadRequestException('Démarrez l’audit avant de saisir des résultats.');
      if(audit.status==='in_progress'){
        if(input.checklist.length!==audit.checklist.length||audit.checklist.some(old=>!input.checklist.some(item=>item.id===old.id&&item.clause===old.clause&&item.question===old.question)))
          throw new ConflictException('Les questions et clauses sont figées après le démarrage.');
        if(findings.some(f=>!input.checklist.some(item=>item.id===f.itemId&&item.result==='nonconform')))
          throw new ConflictException('Un constat lié à une non-conformité ne peut pas être reclassé.');
      }
      await session.db.query('UPDATE app.audits SET checklist=$3 WHERE tenant_id=$1 AND id=$2',[session.tenant.id,id,JSON.stringify(input.checklist)]);
      return this.detailIn(session,id);
    });
  }
  applyTemplate(principal:Principal,tenant:string|undefined,id:string,input:ApplyAuditTemplateDto) {
    return this.database.withTenant(principal,tenant,async session=>{
      const {audit}=await this.lock(session,id,input.revision);
      if(audit.status!=='planned')throw new ConflictException('La checklist ne peut plus être remplacée après le démarrage.');
      if(audit.checklist.length&&!input.replace)throw new ConflictException('Confirmez le remplacement de la checklist existante.');
      const {rows}=await session.db.query<AuditTemplate>(`SELECT ${templateColumns} FROM app.audit_templates WHERE tenant_id=$1 AND id=$2 AND site_id=$3`,[session.tenant.id,input.templateId,audit.siteId]);
      const template=rows[0];
      if(!template)throw new NotFoundException('Modèle introuvable pour ce site.');
      if(template.standard!==audit.standard)throw new BadRequestException('Le référentiel et son édition doivent correspondre exactement à ceux de l’audit.');
      const checklist=template.checklist.map(item=>({...item,id:randomUUID(),result:'pending',evidence:''}));
      const updated=await session.db.query<{revision:number}>('UPDATE app.audits SET checklist=$3 WHERE tenant_id=$1 AND id=$2 RETURNING revision',[session.tenant.id,id,JSON.stringify(checklist)]);
      await session.db.query(`INSERT INTO app.audit_template_uses(id,tenant_id,site_id,audit_id,template_id,applied_revision,applied_by) VALUES($1,$2,$3,$4,$5,$6,$7)`,
        [randomUUID(),session.tenant.id,audit.siteId,id,template.id,updated.rows[0].revision,session.actor.id]);
      return this.detailIn(session,id);
    });
  }
  decide(principal:Principal,tenant:string|undefined,id:string,input:DecideAuditDto) {
    return this.database.withTenant(principal,tenant,async session=>{
      const {audit,findings}=await this.lock(session,id,input.revision,input.command!=='cancel');
      const status=input.command==='start'?'in_progress':input.command==='complete'?'completed':'cancelled';
      if((input.command==='complete'&&audit.status!=='in_progress')||(input.command!=='complete'&&audit.status!=='planned'))throw new ConflictException('Le statut ne permet plus cette opération.');
      if(input.command==='start'&&!audit.checklist.length)throw new BadRequestException('Ajoutez au moins une question au préalable.');
      if(input.command==='start'){
        const eligible=await session.db.query('SELECT identity.can_review_site($1,$2,$3) AND identity.can_review_site($1,$2,$4) AS allowed',[session.tenant.id,audit.siteId,audit.leadId,audit.auditeeId]);
        if(!eligible.rows[0].allowed)throw new ConflictException('Un participant n’est plus habilité. Replanifiez avant de démarrer.');
      }
      const conclusion=input.conclusion?.trim()||'';
      if(input.command!=='start'&&!conclusion)throw new BadRequestException('Une conclusion ou un motif d’annulation est obligatoire.');
      if(input.command==='complete'&&audit.checklist.some(item=>item.result==='pending'||!item.evidence.trim()||(item.result==='nonconform'&&!findings.some(f=>f.itemId===item.id))))
        throw new BadRequestException('Renseignez chaque résultat et sa preuve, puis créez une non-conformité pour chaque écart.');
      await session.db.query('UPDATE app.audits SET status=$3,conclusion=$4 WHERE tenant_id=$1 AND id=$2',[session.tenant.id,id,status,conclusion]);
      return this.detailIn(session,id);
    });
  }
  finding(principal:Principal,tenant:string|undefined,id:string,input:AuditFindingDto) {
    return this.database.withTenant(principal,tenant,async session=>{
      const {audit,findings}=await this.lock(session,id,input.revision);
      if(audit.status!=='in_progress')throw new ConflictException('Les constats sont enregistrés pendant la réalisation de l’audit.');
      const item=audit.checklist.find(item=>item.id===input.itemId.toLowerCase());
      if(!item||item.result!=='nonconform'||!item.evidence.trim())throw new BadRequestException('Enregistrez un écart et sa preuve avant de créer la non-conformité.');
      if(findings.some(f=>f.itemId===item.id))throw new ConflictException('Une non-conformité existe déjà pour ce constat.');
      const reportId=randomUUID();
      const title=`${audit.standard} · ${item.clause} · ${item.question}`.slice(0,300);
      const description=`Audit : ${audit.title}\nRéférentiel : ${audit.standard}\nClause : ${item.clause}\nQuestion : ${item.question}\nPreuve : ${item.evidence}\nAudit ID : ${audit.id}`;
      await session.db.query(`INSERT INTO app.reports(id,tenant_id,site_id,title,description,kind,severity,occurred_at,reported_by,currency)
        VALUES($1,$2,$3,$4,$5,'nonconformity',$6,clock_timestamp(),$7,$8)`,[reportId,session.tenant.id,audit.siteId,title,description,input.severity,session.actor.id,input.currency]);
      await session.db.query(`INSERT INTO app.audit_findings(id,tenant_id,site_id,audit_id,item_id,report_id,created_by) VALUES($1,$2,$3,$4,$5,$6,$7)`,[randomUUID(),session.tenant.id,audit.siteId,id,item.id,reportId,session.actor.id]);
      return this.detailIn(session,id);
    });
  }
  history(principal:Principal,tenant:string|undefined,id:string):Promise<ReportEvent[]> {
    return this.database.withTenant(principal,tenant,async session=>{
      await this.detailIn(session,id);
      const {rows}=await session.db.query<ReportEvent>(`SELECT id,actor_id AS "actorId",operation,occurred_at AS "occurredAt",before_data AS "before",after_data AS "after"
        FROM app.audit_session_events WHERE tenant_id=$1 AND audit_id=$2 ORDER BY occurred_at DESC,id LIMIT 100`,[session.tenant.id,id]);
      return rows;
    });
  }
}
