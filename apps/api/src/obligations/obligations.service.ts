import { BadRequestException,ConflictException,ForbiddenException,Injectable,NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Obligation,ObligationList,ReportEvent } from '@sentinelle/contracts';
import type { Principal } from '../auth.js';
import { Database,type TenantSession } from '../database.js';
import { AssessObligationDto,CreateObligationDto,ObligationDecisionDto,ObligationQuery } from './dto.js';
const columns=`o.id,o.site_id AS "siteId",s.name AS "siteName",o.title,o.jurisdiction,o.source_title AS "sourceTitle",o.source_version AS "sourceVersion",
  o.article,o.source_url AS "sourceUrl",o.excerpt,o.source_sha256 AS "sourceSha256",o.owner_id AS "ownerId",o.created_by AS "createdBy",o.next_review_on::text AS "nextReviewOn",
  (o.lifecycle='active' AND o.next_review_on<(statement_timestamp() AT TIME ZONE 'UTC')::date) AS "reviewOverdue",o.lifecycle,o.source_status AS "sourceStatus",
  o.verification_note AS "verificationNote",o.verified_by AS "verifiedBy",o.verified_at AS "verifiedAt",o.assessment_status AS "assessmentStatus",o.assessment_note AS "assessmentNote",
  o.evidence_reference AS "evidenceReference",o.assessed_by AS "assessedBy",o.assessed_at AS "assessedAt",o.last_change_note AS "lastChangeNote",o.revision,o.created_at AS "createdAt",o.updated_at AS "updatedAt"`;
const joins='FROM app.obligations o JOIN app.sites s ON s.id=o.site_id';
@Injectable()
export class ObligationsService {
  constructor(private readonly database:Database){}
  private access(session:TenantSession){if(!session.canWrite)throw new ForbiddenException('Le registre des obligations est réservé aux responsables habilités du site.');}
  private async get(session:TenantSession,id:string):Promise<Obligation>{
    this.access(session);
    const {rows}=await session.db.query<Obligation>(`SELECT ${columns} ${joins} WHERE o.tenant_id=$1 AND o.id=$2`,[session.tenant.id,id]);
    if(!rows[0])throw new NotFoundException('Obligation introuvable.');
    return rows[0];
  }
  private async lock(session:TenantSession,id:string,revision:number){
    this.access(session);
    const result=await session.db.query('SELECT id FROM app.obligations WHERE tenant_id=$1 AND id=$2 FOR UPDATE',[session.tenant.id,id]);
    if(!result.rowCount)throw new NotFoundException('Obligation introuvable.');
    const obligation=await this.get(session,id);
    if(obligation.revision!==revision)throw new ConflictException('L’obligation a changé. Actualisez avant de recommencer.');
    return obligation;
  }
  private async owner(session:TenantSession,siteId:string,ownerId:string){
    const result=await session.db.query('SELECT identity.can_review_site($1,$2,$3) AS allowed',[session.tenant.id,siteId,ownerId]);
    if(!result.rows[0].allowed)throw new BadRequestException('Le responsable doit être habilité sur ce site.');
  }
  list(principal:Principal,tenant:string|undefined,query:ObligationQuery):Promise<ObligationList>{
    return this.database.withTenant(principal,tenant,async session=>{
      this.access(session);
      const where=`WHERE o.tenant_id=$1 AND ($2::uuid IS NULL OR o.site_id=$2) AND o.lifecycle=$3 AND ($4::text IS NULL OR o.assessment_status=$4)
        AND ($5::text='' OR strpos(lower(o.title||' '||o.source_title||' '||o.jurisdiction),lower($5))>0)`;
      const args=[session.tenant.id,query.siteId||null,query.lifecycle,query.status||null,query.search||''];
      const counts=await session.db.query<{total:number;unverified:number;overdue:number}>(`SELECT count(*)::int AS total,
        count(*) FILTER(WHERE o.source_status='unverified')::int AS unverified,
        count(*) FILTER(WHERE o.lifecycle='active' AND o.next_review_on<(statement_timestamp() AT TIME ZONE 'UTC')::date)::int AS overdue FROM app.obligations o ${where}`,args);
      const {rows}=await session.db.query<Obligation>(`SELECT ${columns} ${joins} ${where} ORDER BY o.updated_at DESC,o.id LIMIT $6 OFFSET $7`,[...args,query.limit,query.offset]);
      return {items:rows,...counts.rows[0]};
    });
  }
  detail(principal:Principal,tenant:string|undefined,id:string){return this.database.withTenant(principal,tenant,session=>this.get(session,id));}
  create(principal:Principal,tenant:string|undefined,input:CreateObligationDto){
    return this.database.withTenant(principal,tenant,async session=>{
      this.access(session);
      const site=await session.db.query('SELECT id FROM app.sites WHERE tenant_id=$1 AND id=$2',[session.tenant.id,input.siteId]);
      if(!site.rowCount)throw new BadRequestException('Site non accessible.');
      await this.owner(session,input.siteId,input.ownerId);
      const url=new URL(input.sourceUrl);
      if(url.protocol!=='https:'||url.username||url.password||url.href.length>2000)throw new BadRequestException('Un lien HTTPS sans identifiants est requis.');
      const id=randomUUID();
      await session.db.query(`INSERT INTO app.obligations(id,tenant_id,site_id,title,jurisdiction,source_title,source_version,article,source_url,excerpt,owner_id,created_by,next_review_on,last_change_note)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'Référence enregistrée, à vérifier')`,
        [id,session.tenant.id,input.siteId,input.title,input.jurisdiction,input.sourceTitle,input.sourceVersion,input.article,url.href,input.excerpt,input.ownerId,session.actor.id,input.nextReviewOn]);
      return this.get(session,id);
    });
  }
  decide(principal:Principal,tenant:string|undefined,id:string,input:ObligationDecisionDto){
    return this.database.withTenant(principal,tenant,async session=>{
      const obligation=await this.lock(session,id,input.revision);
      if(input.command==='verify_source'){
        if(obligation.lifecycle!=='active'||obligation.sourceStatus!=='unverified')throw new ConflictException('Cette référence ne peut plus être vérifiée dans cet état.');
        if(obligation.createdBy===session.actor.id)throw new ForbiddenException('La référence doit être vérifiée par une autre personne que son créateur.');
        await session.db.query("UPDATE app.obligations SET source_status='verified',verification_note=$3,last_change_note=$3 WHERE tenant_id=$1 AND id=$2",[session.tenant.id,id,input.note]);
      }else{
        const lifecycle=input.command==='archive'?'archived':'active';
        if(obligation.lifecycle===lifecycle)throw new ConflictException('Ce changement d’état a déjà été effectué.');
        await session.db.query('UPDATE app.obligations SET lifecycle=$3,last_change_note=$4 WHERE tenant_id=$1 AND id=$2',[session.tenant.id,id,lifecycle,input.note]);
      }
      return this.get(session,id);
    });
  }
  assess(principal:Principal,tenant:string|undefined,id:string,input:AssessObligationDto){
    return this.database.withTenant(principal,tenant,async session=>{
      const obligation=await this.lock(session,id,input.revision);
      if(obligation.lifecycle!=='active'||obligation.sourceStatus!=='verified')throw new ConflictException('Vérifiez la référence et rouvrez l’obligation avant de l’évaluer.');
      await this.owner(session,obligation.siteId,input.ownerId);
      const date=await session.db.query('SELECT $1::date>=(statement_timestamp() AT TIME ZONE \'UTC\')::date AS valid',[input.nextReviewOn]);
      if(!date.rows[0].valid)throw new BadRequestException('La prochaine revue ne peut pas être déjà dépassée.');
      await session.db.query(`UPDATE app.obligations SET assessment_status=$3,assessment_note=$4,evidence_reference=$5,owner_id=$6,next_review_on=$7,last_change_note=$4
        WHERE tenant_id=$1 AND id=$2`,[session.tenant.id,id,input.status,input.note,input.evidenceReference,input.ownerId,input.nextReviewOn]);
      return this.get(session,id);
    });
  }
  history(principal:Principal,tenant:string|undefined,id:string):Promise<ReportEvent[]>{
    return this.database.withTenant(principal,tenant,async session=>{
      await this.get(session,id);
      const {rows}=await session.db.query<ReportEvent>(`SELECT id,actor_id AS "actorId",operation,occurred_at AS "occurredAt",before_data AS "before",after_data AS "after"
        FROM app.obligation_events WHERE tenant_id=$1 AND obligation_id=$2 ORDER BY occurred_at DESC,id LIMIT 100`,[session.tenant.id,id]);
      return rows;
    });
  }
}
