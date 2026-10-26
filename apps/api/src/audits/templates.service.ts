import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { AuditTemplate, AuditTemplateList, AuditTemplateUse } from '@sentinelle/contracts';
import type { Principal } from '../auth.js';
import { Database, type TenantSession } from '../database.js';
import { AuditTemplateQuery, PublishAuditTemplateDto } from './templates.dto.js';
export const templateColumns=`id,site_id AS "siteId",code,number,title,standard,change_note AS "changeNote",checklist,
  content_sha256 AS "contentSha256",created_by AS "createdBy",created_at AS "createdAt"`;
export async function templateUses(session:TenantSession,auditId:string):Promise<AuditTemplateUse[]> {
  const {rows}=await session.db.query<AuditTemplateUse>(`SELECT u.id,u.template_id AS "templateId",t.code,t.number,t.title,t.content_sha256 AS "contentSha256",
    u.applied_revision AS "appliedRevision",u.applied_by AS "appliedBy",u.applied_at AS "appliedAt"
    FROM app.audit_template_uses u JOIN app.audit_templates t ON t.tenant_id=u.tenant_id AND t.id=u.template_id
    WHERE u.tenant_id=$1 AND u.audit_id=$2 ORDER BY u.applied_revision DESC`,[session.tenant.id,auditId]);
  return rows;
}
@Injectable()
export class AuditTemplatesService {
  constructor(private readonly database:Database) {}
  private access(session:TenantSession) {if(!session.canWrite)throw new ForbiddenException('Les modèles d’audit sont réservés aux responsables habilités.');}
  list(principal:Principal,tenant:string|undefined,query:AuditTemplateQuery):Promise<AuditTemplateList> {
    return this.database.withTenant(principal,tenant,async session=>{
      this.access(session);
      const latest=`WITH latest AS (SELECT DISTINCT ON (code) * FROM app.audit_templates WHERE tenant_id=$1 AND site_id=$2 ORDER BY code,number DESC)`;
      const where=`WHERE ($3::text='' OR standard=$3) AND ($4::text='' OR strpos(lower(code||' '||title),lower($4))>0)`;
      const args=[session.tenant.id,query.siteId,query.standard||'',query.search||''];
      const count=await session.db.query(`${latest} SELECT count(*)::int AS total FROM latest ${where}`,args);
      const {rows}=await session.db.query<AuditTemplate>(`${latest} SELECT ${templateColumns} FROM latest ${where} ORDER BY code LIMIT $5 OFFSET $6`,[...args,query.limit,query.offset]);
      return {items:rows,total:count.rows[0].total};
    });
  }
  versions(principal:Principal,tenant:string|undefined,id:string):Promise<AuditTemplate[]> {
    return this.database.withTenant(principal,tenant,async session=>{
      this.access(session);
      const source=await session.db.query('SELECT site_id,code FROM app.audit_templates WHERE tenant_id=$1 AND id=$2',[session.tenant.id,id]);
      if(!source.rows[0])throw new NotFoundException('Modèle introuvable.');
      const {rows}=await session.db.query<AuditTemplate>(`SELECT ${templateColumns} FROM app.audit_templates WHERE tenant_id=$1 AND site_id=$2 AND code=$3 ORDER BY number DESC LIMIT 100`,[session.tenant.id,source.rows[0].site_id,source.rows[0].code]);
      return rows;
    });
  }
  publish(principal:Principal,tenant:string|undefined,input:PublishAuditTemplateDto):Promise<AuditTemplate> {
    return this.database.withTenant(principal,tenant,async session=>{
      this.access(session);
      const site=await session.db.query('SELECT id FROM app.sites WHERE tenant_id=$1 AND id=$2',[session.tenant.id,input.siteId]);
      if(!site.rowCount)throw new BadRequestException('Site non disponible.');
      await session.db.query("SELECT pg_advisory_xact_lock(hashtextextended('audit-template:'||$1::uuid::text||':'||$2::uuid::text||':'||$3::text,0))",[session.tenant.id,input.siteId,input.code]);
      const current=await session.db.query('SELECT coalesce(max(number),0)::int AS number FROM app.audit_templates WHERE tenant_id=$1 AND site_id=$2 AND code=$3',[session.tenant.id,input.siteId,input.code]);
      if(current.rows[0].number!==input.expectedVersion)throw new ConflictException('Une autre version de ce modèle existe. Actualisez avant de publier.');
      const checklist=input.questions.map(question=>({id:randomUUID(),clause:question.clause,question:question.question,result:'pending',evidence:''}));
      const id=randomUUID();
      await session.db.query(`INSERT INTO app.audit_templates(id,tenant_id,site_id,code,number,title,standard,change_note,checklist,created_by)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,[id,session.tenant.id,input.siteId,input.code,input.expectedVersion+1,input.title,input.standard,input.changeNote,JSON.stringify(checklist),session.actor.id]);
      const {rows}=await session.db.query<AuditTemplate>(`SELECT ${templateColumns} FROM app.audit_templates WHERE tenant_id=$1 AND id=$2`,[session.tenant.id,id]);
      return rows[0];
    });
  }
}
