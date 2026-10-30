import { BadRequestException, ConflictException, ForbiddenException, HttpException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Action, Report, ReportDetail, ReportEvent, ReportList } from '@sentinelle/contracts';
import { Database, type TenantSession } from '../database.js';
import type { Principal } from '../auth.js';
import { actionColumns,actionJoins } from '../actions/action-query.js';
import { AnalyzeReportDto,CreateReportDto,DecideReportDto,ReportActionDto,ReportExportQuery, ReportQuery } from './dto.js';
import { decideReport,ReportWorkflowError,validateCost } from './workflow.mjs';

const columns=`r.id,r.title,r.description,r.kind,r.severity,r.site_id AS "siteId",s.name AS "siteName",r.occurred_at AS "occurredAt",r.reported_by AS "reportedBy",r.status,
  r.owner_id AS "ownerId",r.verifier_id AS "verifierId",r.correction,r.root_cause AS "rootCause",r.five_whys AS "fiveWhys",r.ishikawa,r.cost_amount::text AS "costAmount",r.currency,r.revision,
  r.effectiveness,r.effectiveness_note AS "effectivenessNote",r.reviewed_by AS "reviewedBy",r.reviewed_at AS "reviewedAt",r.closed_at AS "closedAt",r.created_at AS "createdAt",r.updated_at AS "updatedAt",r.attachments_sha256 AS "attachmentsSha256"`;
const joins='FROM app.reports r JOIN app.sites s ON s.id=r.site_id';
const kinds={ incident:'Incident',near_miss:'Presque-accident',nonconformity:'Non-conformité',complaint:'Réclamation' };

@Injectable()
export class ReportsService {
  constructor(private readonly database: Database) {}
  private write(session: TenantSession) { if(!session.canWrite) throw new ForbiddenException('Seuls les responsables habilités peuvent traiter les signalements.'); }
  private async lock(session: TenantSession,id: string,revision: number) {
    this.write(session);
    const { rows }=await session.db.query<Report>(`SELECT ${columns} ${joins} WHERE r.tenant_id=$1 AND r.id=$2 FOR UPDATE OF r`,[session.tenant.id,id]);
    if(!rows[0]) throw new NotFoundException('Signalement introuvable.');
    if(rows[0].revision!==revision) throw new ConflictException('Le signalement a changé. Actualisez avant de recommencer.');
    return rows[0];
  }
  private async detailIn(session: TenantSession,id: string): Promise<ReportDetail> {
    const report=await session.db.query<Report>(`SELECT ${columns} ${joins} WHERE r.tenant_id=$1 AND r.id=$2`,[session.tenant.id,id]);
    if(!report.rows[0]) throw new NotFoundException('Signalement introuvable.');
    const actions=await session.db.query<Action>(`SELECT ${actionColumns} ${actionJoins} WHERE a.tenant_id=$1 AND a.report_id=$2 ORDER BY a.created_at,a.id`,[session.tenant.id,id]);
    return { report:report.rows[0],actions:actions.rows };
  }
  list(principal: Principal,tenant: string|undefined,query: ReportQuery): Promise<ReportList> {
    return this.database.withTenant(principal,tenant,async session=>{
      const where=`WHERE r.tenant_id=$1 AND ($2::uuid IS NULL OR r.site_id=$2) AND ($3::text IS NULL OR r.status=$3) AND ($4::text='' OR strpos(lower(r.title),lower($4))>0)`;
      const params=[session.tenant.id,query.siteId||null,query.status||null,query.search||''];
      const count=await session.db.query(`SELECT count(*)::integer AS total FROM app.reports r ${where}`,params);
      const result=await session.db.query<Report>(`SELECT ${columns} ${joins} ${where} ORDER BY r.created_at DESC,r.id LIMIT $5 OFFSET $6`,[...params,query.limit,query.offset]);
      return { items:result.rows,total:count.rows[0].total };
    });
  }
  export(principal: Principal,tenant: string|undefined,query: ReportExportQuery):Promise<ReportList> {
    return this.database.withTenant(principal,tenant,async session=>{
      const args=[session.tenant.id,query.siteId||null,query.status||null,query.search||''];
      const {rows}=await session.db.query<Report>(`SELECT ${columns} ${joins}
        WHERE r.tenant_id=$1 AND ($2::uuid IS NULL OR r.site_id=$2) AND ($3::text IS NULL OR r.status=$3)
        AND ($4::text='' OR strpos(lower(r.title),lower($4))>0) ORDER BY r.created_at DESC,r.id LIMIT 10001`,args);
      if(rows.length>10000)throw new BadRequestException('L’export dépasse 10 000 signalements. Affinez les filtres.');
      return {items:rows,total:rows.length};
    });
  }
  detail(principal: Principal,tenant: string|undefined,id: string) { return this.database.withTenant(principal,tenant,session=>this.detailIn(session,id)); }
  create(principal: Principal,tenant: string|undefined,input: CreateReportDto) {
    return this.database.withTenant(principal,tenant,async session=>{
      if(new Date(input.occurredAt).getTime()>Date.now()+60000) throw new BadRequestException('La date de survenue ne peut pas être future.');
      const site=await session.db.query('SELECT id FROM app.sites WHERE tenant_id=$1 AND id=$2',[session.tenant.id,input.siteId]);
      if(!site.rowCount) throw new BadRequestException('Le site n’est pas accessible.');
      const id=randomUUID();
      await session.db.query(`INSERT INTO app.reports(id,tenant_id,site_id,title,description,kind,severity,occurred_at,reported_by,correction,currency)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,[id,session.tenant.id,input.siteId,input.title,input.description,input.kind,input.severity,input.occurredAt,session.actor.id,input.correction||'',input.currency]);
      return this.detailIn(session,id);
    });
  }
  analyze(principal: Principal,tenant: string|undefined,id: string,input: AnalyzeReportDto) {
    return this.database.withTenant(principal,tenant,async session=>{
      const report=await this.lock(session,id,input.revision);
      if(!['reported','in_analysis','action_plan'].includes(report.status)) throw new ConflictException('Retournez ou rouvrez le signalement avant de modifier son analyse.');
      if(input.ownerId===input.verifierId) throw new BadRequestException('Le responsable et le vérificateur doivent être différents.');
      try{ validateCost(input.costAmount,input.currency); }catch(e){ if(e instanceof ReportWorkflowError) throw new HttpException(e.message,e.status); throw e; }
      const eligible=await session.db.query('SELECT identity.can_review_site($1,$2,$3) AND identity.can_review_site($1,$2,$4) AS allowed',[session.tenant.id,report.siteId,input.ownerId,input.verifierId]);
      if(!eligible.rows[0].allowed) throw new BadRequestException('Le responsable ou le vérificateur n’est pas habilité pour ce site.');
      await session.db.query(`UPDATE app.reports SET owner_id=$2,verifier_id=$3,correction=$4,root_cause=$5,five_whys=$6,cost_amount=$7,currency=$8,ishikawa=coalesce($9::jsonb,ishikawa),last_change_note='Analyse mise à jour' WHERE id=$1`,
        [id,input.ownerId,input.verifierId,input.correction,input.rootCause,JSON.stringify(input.fiveWhys),input.costAmount,input.currency,input.ishikawa===undefined?null:JSON.stringify(input.ishikawa)]);
      return this.detailIn(session,id);
    });
  }
  decide(principal: Principal,tenant: string|undefined,id: string,input: DecideReportDto) {
    return this.database.withTenant(principal,tenant,async session=>{
      const report=await this.lock(session,id,input.revision);
      const detail=await this.detailIn(session,id);
      if(['start_analysis','request_review','close'].includes(input.command)){
        const pending=await session.db.query("SELECT id FROM app.attachments WHERE tenant_id=$1 AND report_id=$2 AND status='pending' LIMIT 1",[session.tenant.id,id]);
        if(pending.rowCount)throw new ConflictException('Terminez ou annulez les envois de fichiers avant de poursuivre.');
      }
      let status:string;
      try{ status=decideReport(report,input.command,session.actor.id,session.canWrite,detail.actions,input.note||''); }
      catch(e){ if(e instanceof ReportWorkflowError) throw new HttpException(e.message,e.status); throw e; }
      const review=['close','return_for_action'].includes(input.command);
      const effectiveness=input.command==='close' ? 'effective' : input.command==='return_for_action' ? 'ineffective' : 'not_evaluated';
      await session.db.query(`UPDATE app.reports SET status=$2,effectiveness=$3,effectiveness_note=$4,reviewed_by=$5,reviewed_at=NULL,last_change_note=$6 WHERE id=$1`,
        [id,status,effectiveness,review ? input.note?.trim() : null,review ? session.actor.id : null,input.note?.trim()||input.command]);
      return this.detailIn(session,id);
    });
  }
  addAction(principal: Principal,tenant: string|undefined,id: string,input: ReportActionDto) {
    return this.database.withTenant(principal,tenant,async session=>{
      const report=await this.lock(session,id,input.revision);
      if(report.status!=='action_plan') throw new ConflictException('Le signalement doit être au stade du plan d’actions.');
      const eligible=await session.db.query('SELECT identity.can_review_site($1,$2,$3) AS allowed',[session.tenant.id,report.siteId,input.ownerId]);
      if(!eligible.rows[0].allowed) throw new BadRequestException('Le responsable de l’action n’est pas habilité pour ce site.');
      await session.db.query(`INSERT INTO app.actions(id,tenant_id,site_id,owner_id,title,origin,priority,due_date,report_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [randomUUID(),session.tenant.id,report.siteId,input.ownerId,input.title,`${kinds[report.kind]} · ${id.slice(0,8)}`,input.priority,input.dueDate||null,id]);
      return this.detailIn(session,id);
    });
  }
  history(principal: Principal,tenant: string|undefined,id: string): Promise<ReportEvent[]> {
    return this.database.withTenant(principal,tenant,async session=>{
      await this.detailIn(session,id);
      const result=await session.db.query<ReportEvent>(`SELECT id,actor_id AS "actorId",operation,occurred_at AS "occurredAt",before_data AS "before",after_data AS "after" FROM app.report_events WHERE tenant_id=$1 AND report_id=$2 ORDER BY occurred_at DESC,id LIMIT 100`,[session.tenant.id,id]);
      return result.rows;
    });
  }
}
