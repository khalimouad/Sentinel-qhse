import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { AuditorQualification, AuditorQualificationList, QualityAudit } from '@sentinelle/contracts';
import type { Principal } from '../auth.js';
import { Database, type TenantSession } from '../database.js';
import { AuditorQualificationQuery, IssueAuditorQualificationDto, RevokeAuditorQualificationDto } from './qualifications.dto.js';
const columns=`q.id,q.site_id AS "siteId",q.user_id AS "userId",q.standard,q.valid_from::text AS "validFrom",q.valid_until::text AS "validUntil",
  q.evidence_reference AS "evidenceReference",q.assessment,q.assessed_by AS "assessedBy",q.created_at AS "createdAt",
  r.reason AS "revocationReason",r.revoked_by AS "revokedBy",r.revoked_at AS "revokedAt",
  CASE WHEN r.id IS NOT NULL THEN 'revoked' WHEN q.valid_until<(statement_timestamp() AT TIME ZONE 'UTC')::date THEN 'expired'
    WHEN q.valid_from>(statement_timestamp() AT TIME ZONE 'UTC')::date THEN 'future' ELSE 'valid' END AS status`;
const joins='FROM app.auditor_qualifications q LEFT JOIN app.auditor_qualification_revocations r ON r.tenant_id=q.tenant_id AND r.qualification_id=q.id';
export async function qualifiedForAudit(session:TenantSession,audit:QualityAudit):Promise<boolean> {
  const {rows}=await session.db.query(`SELECT EXISTS(SELECT 1 FROM app.auditor_qualifications q WHERE q.tenant_id=$1 AND q.site_id=$2 AND q.user_id=$3 AND q.standard=$4
    AND q.valid_from<=least($5::date,(statement_timestamp() AT TIME ZONE 'UTC')::date)
    AND q.valid_until>=greatest($6::date,(statement_timestamp() AT TIME ZONE 'UTC')::date)
    AND NOT EXISTS(SELECT 1 FROM app.auditor_qualification_revocations r WHERE r.tenant_id=q.tenant_id AND r.qualification_id=q.id))
    AND identity.can_review_site($1,$2,$3) AS qualified`,[session.tenant.id,audit.siteId,audit.leadId,audit.standard,audit.startsOn,audit.endsOn]);
  return rows[0].qualified;
}
@Injectable()
export class AuditorQualificationsService {
  constructor(private readonly database:Database) {}
  private access(session:TenantSession) {if(!session.canWrite)throw new ForbiddenException('Registre réservé aux responsables habilités du site.');}
  private async get(session:TenantSession,id:string):Promise<AuditorQualification> {
    const {rows}=await session.db.query<AuditorQualification>(`SELECT ${columns} ${joins} WHERE q.tenant_id=$1 AND q.id=$2`,[session.tenant.id,id]);
    if(!rows[0])throw new NotFoundException('Qualification introuvable.');
    return rows[0];
  }
  list(principal:Principal,tenant:string|undefined,query:AuditorQualificationQuery):Promise<AuditorQualificationList> {
    return this.database.withTenant(principal,tenant,async session=>{
      this.access(session);
      const where=`WHERE q.tenant_id=$1 AND q.site_id=$2 AND ($3::text='' OR q.standard=$3) AND ($4::uuid IS NULL OR q.user_id=$4)`;
      const args=[session.tenant.id,query.siteId,query.standard||'',query.userId||null];
      const count=await session.db.query(`SELECT count(*)::int AS total FROM app.auditor_qualifications q ${where}`,args);
      const {rows}=await session.db.query<AuditorQualification>(`SELECT ${columns} ${joins} ${where} ORDER BY q.created_at DESC,q.id LIMIT $5 OFFSET $6`,[...args,query.limit,query.offset]);
      return {items:rows,total:count.rows[0].total};
    });
  }
  issue(principal:Principal,tenant:string|undefined,input:IssueAuditorQualificationDto):Promise<AuditorQualification> {
    return this.database.withTenant(principal,tenant,async session=>{
      this.access(session);
      if(input.userId.toLowerCase()===session.actor.id)throw new BadRequestException('Vous ne pouvez pas vous attribuer votre propre qualification.');
      if(input.validUntil<input.validFrom)throw new BadRequestException('La date de fin doit suivre la date de début.');
      const site=await session.db.query('SELECT id FROM app.sites WHERE tenant_id=$1 AND id=$2',[session.tenant.id,input.siteId]);
      if(!site.rowCount)throw new BadRequestException('Site non accessible.');
      const eligible=await session.db.query('SELECT identity.can_review_site($1,$2,$3) AS allowed',[session.tenant.id,input.siteId,input.userId]);
      if(!eligible.rows[0].allowed)throw new BadRequestException('L’auditeur doit être un responsable habilité du site.');
      const id=randomUUID();
      await session.db.query(`INSERT INTO app.auditor_qualifications(id,tenant_id,site_id,user_id,standard,valid_from,valid_until,evidence_reference,assessment,assessed_by)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,[id,session.tenant.id,input.siteId,input.userId,input.standard,input.validFrom,input.validUntil,input.evidenceReference,input.assessment,session.actor.id]);
      return this.get(session,id);
    });
  }
  revoke(principal:Principal,tenant:string|undefined,id:string,input:RevokeAuditorQualificationDto):Promise<AuditorQualification> {
    return this.database.withTenant(principal,tenant,async session=>{
      this.access(session);
      const qualification=await this.get(session,id);
      await session.db.query('SELECT app.lock_auditor_qualification($1,$2,$3,$4)',[session.tenant.id,qualification.siteId,qualification.userId,qualification.standard]);
      const current=await this.get(session,id);
      if(current.revokedAt)throw new ConflictException('Cette qualification a déjà été révoquée.');
      await session.db.query(`INSERT INTO app.auditor_qualification_revocations(id,tenant_id,site_id,qualification_id,reason,revoked_by) VALUES($1,$2,$3,$4,$5,$6)`,[randomUUID(),session.tenant.id,qualification.siteId,id,input.reason,session.actor.id]);
      return this.get(session,id);
    });
  }
}
