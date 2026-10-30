import { BadRequestException,ConflictException,ForbiddenException,Injectable,NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Action,Risk,RiskDetail,RiskList,ReportEvent } from '@sentinelle/contracts';
import type { Principal } from '../auth.js';
import { Database,type TenantSession } from '../database.js';
import { actionColumns,actionJoins } from '../actions/action-query.js';
import { AssessRiskDto,CreateRiskDto,DecideRiskDto,RiskActionDto,RiskExportQuery,RiskQuery } from './dto.js';
const columns=`r.id,r.site_id AS "siteId",s.name AS "siteName",r.title,r.description,r.category,r.process_name AS "processName",r.function_name AS "functionName",r.country,r.owner_id AS "ownerId",r.created_by AS "createdBy",
  r.inherent_likelihood AS "inherentLikelihood",r.inherent_severity AS "inherentSeverity",r.residual_likelihood AS "residualLikelihood",r.residual_severity AS "residualSeverity",
  r.inherent_score AS "inherentScore",r.residual_score AS "residualScore",r.controls,r.next_review_on::text AS "nextReviewOn",
  (r.status<>'archived' AND r.next_review_on<(statement_timestamp() AT TIME ZONE 'UTC')::date) AS "reviewOverdue",
  r.status,r.acceptance_note AS "acceptanceNote",r.accepted_by AS "acceptedBy",r.accepted_at AS "acceptedAt",r.last_change_note AS "lastChangeNote",r.revision,
  r.created_at AS "createdAt",r.updated_at AS "updatedAt"`;
const joins='FROM app.risks r JOIN app.sites s ON s.id=r.site_id';
@Injectable()
export class RisksService {
  constructor(private readonly database:Database) {}
  private access(session:TenantSession){if(!session.canWrite)throw new ForbiddenException('Le registre des risques est réservé aux responsables habilités du site.');}
  private async detailIn(session:TenantSession,id:string):Promise<RiskDetail>{
    this.access(session);
    const {rows}=await session.db.query<Risk>(`SELECT ${columns} ${joins} WHERE r.tenant_id=$1 AND r.id=$2`,[session.tenant.id,id]);
    if(!rows[0])throw new NotFoundException('Risque introuvable.');
    const actions=await session.db.query<Action>(`SELECT ${actionColumns} ${actionJoins} WHERE a.tenant_id=$1 AND a.risk_id=$2 ORDER BY a.created_at,a.id`,[session.tenant.id,id]);
    return {risk:rows[0],actions:actions.rows};
  }
  private async lock(session:TenantSession,id:string,revision:number){
    this.access(session);
    const result=await session.db.query('SELECT id FROM app.risks WHERE tenant_id=$1 AND id=$2 FOR UPDATE',[session.tenant.id,id]);
    if(!result.rowCount)throw new NotFoundException('Risque introuvable.');
    const detail=await this.detailIn(session,id);
    if(detail.risk.revision!==revision)throw new ConflictException('Le risque a changé. Actualisez avant de recommencer.');
    return detail;
  }
  private async owner(session:TenantSession,siteId:string,ownerId:string){
    const result=await session.db.query('SELECT identity.can_review_site($1,$2,$3) AS allowed',[session.tenant.id,siteId,ownerId]);
    if(!result.rows[0].allowed)throw new BadRequestException('Le responsable doit être habilité sur ce site.');
  }
  list(principal:Principal,tenant:string|undefined,query:RiskQuery):Promise<RiskList>{
    return this.database.withTenant(principal,tenant,async session=>{
      this.access(session);
      const base=`WHERE r.tenant_id=$1 AND ($2::uuid IS NULL OR r.site_id=$2) AND ($3::text IS NULL OR r.status=$3)
        AND ($4::text IS NULL OR r.category=$4) AND ($5::text='' OR strpos(lower(r.title||' '||r.description),lower($5))>0)`;
      const args=[session.tenant.id,query.siteId||null,query.status||null,query.category||null,query.search||'',query.likelihood||null,query.severity||null];
      const counts=await session.db.query<Pick<RiskList,'total'|'scopeTotal'|'overdue'|'matrix'>>(`WITH filtered AS (
        SELECT r.residual_likelihood,r.residual_severity,r.next_review_on,r.status FROM app.risks r ${base}
      ) SELECT count(*) FILTER(WHERE ($6::int IS NULL OR f.residual_likelihood=$6) AND ($7::int IS NULL OR f.residual_severity=$7))::int AS total,
        count(*)::int AS "scopeTotal",count(*) FILTER(WHERE f.status<>'archived' AND f.next_review_on<(statement_timestamp() AT TIME ZONE 'UTC')::date)::int AS overdue,
        (SELECT coalesce(jsonb_agg(cell ORDER BY likelihood,severity),'[]'::jsonb) FROM (
          SELECT residual_likelihood AS likelihood,residual_severity AS severity,count(*)::int AS count FROM filtered GROUP BY residual_likelihood,residual_severity
        ) cell) AS matrix FROM filtered f`,args);
      const {rows}=await session.db.query<Risk>(`SELECT ${columns} ${joins} ${base} AND ($6::int IS NULL OR r.residual_likelihood=$6)
        AND ($7::int IS NULL OR r.residual_severity=$7) ORDER BY r.updated_at DESC,r.id LIMIT $8 OFFSET $9`,[...args,query.limit,query.offset]);
      return {items:rows,...counts.rows[0]};
    });
  }
  export(principal:Principal,tenant:string|undefined,query:RiskExportQuery):Promise<{items:Risk[];total:number}>{
    return this.database.withTenant(principal,tenant,async session=>{
      this.access(session);
      const {rows}=await session.db.query<Risk>(`SELECT ${columns} ${joins} WHERE r.tenant_id=$1 AND ($2::uuid IS NULL OR r.site_id=$2) AND ($3::text IS NULL OR r.status=$3)
        AND ($4::text IS NULL OR r.category=$4) AND ($5::text='' OR strpos(lower(r.title||' '||r.description),lower($5))>0)
        AND ($6::int IS NULL OR r.residual_likelihood=$6) AND ($7::int IS NULL OR r.residual_severity=$7) ORDER BY r.updated_at DESC,r.id LIMIT 10001`,[session.tenant.id,query.siteId||null,query.status||null,query.category||null,query.search||'',query.likelihood||null,query.severity||null]);
      if(rows.length>10000)throw new BadRequestException('L’export dépasse 10 000 résultats. Affinez les filtres.');
      return {items:rows,total:rows.length};
    });
  }
  detail(principal:Principal,tenant:string|undefined,id:string){return this.database.withTenant(principal,tenant,session=>this.detailIn(session,id));}
  create(principal:Principal,tenant:string|undefined,input:CreateRiskDto){
    return this.database.withTenant(principal,tenant,async session=>{
      this.access(session);
      const site=await session.db.query('SELECT id FROM app.sites WHERE tenant_id=$1 AND id=$2',[session.tenant.id,input.siteId]);
      if(!site.rowCount)throw new BadRequestException('Site non accessible.');
      await this.owner(session,input.siteId,input.ownerId);
      const id=randomUUID();
      await session.db.query(`INSERT INTO app.risks(id,tenant_id,site_id,title,description,category,owner_id,created_by,inherent_likelihood,inherent_severity,residual_likelihood,residual_severity,controls,next_review_on,last_change_note,process_name,function_name,country)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'Risque enregistré',$15,$16,$17)`,
        [id,session.tenant.id,input.siteId,input.title,input.description,input.category,input.ownerId,session.actor.id,input.inherentLikelihood,input.inherentSeverity,input.residualLikelihood,input.residualSeverity,input.controls,input.nextReviewOn,input.processName||'',input.functionName||'',input.country||'']);
      return this.detailIn(session,id);
    });
  }
  assess(principal:Principal,tenant:string|undefined,id:string,input:AssessRiskDto){
    return this.database.withTenant(principal,tenant,async session=>{
      const {risk}=await this.lock(session,id,input.revision);
      if(risk.status!=='active')throw new ConflictException('Rouvrez le risque avant de modifier son évaluation.');
      await this.owner(session,risk.siteId,input.ownerId);
      await session.db.query(`UPDATE app.risks SET title=$3,description=$4,category=$5,owner_id=$6,inherent_likelihood=$7,inherent_severity=$8,
        residual_likelihood=$9,residual_severity=$10,controls=$11,next_review_on=$12,last_change_note=$13,process_name=coalesce($14,process_name),function_name=coalesce($15,function_name),country=coalesce($16,country) WHERE tenant_id=$1 AND id=$2`,
        [session.tenant.id,id,input.title,input.description,input.category,input.ownerId,input.inherentLikelihood,input.inherentSeverity,input.residualLikelihood,input.residualSeverity,input.controls,input.nextReviewOn,input.reason,input.processName??null,input.functionName??null,input.country??null]);
      return this.detailIn(session,id);
    });
  }
  decide(principal:Principal,tenant:string|undefined,id:string,input:DecideRiskDto){
    return this.database.withTenant(principal,tenant,async session=>{
      const {risk,actions}=await this.lock(session,id,input.revision);
      if((input.command==='accept'&&risk.status!=='active')||(input.command==='reopen'&&risk.status==='active')||(input.command==='archive'&&risk.status==='archived'))throw new ConflictException('Le statut ne permet plus cette décision.');
      if(input.command!=='reopen'&&actions.some(action=>action.status!=='closed'))throw new BadRequestException('Terminez les actions liées avant d’accepter ou d’archiver le risque.');
      if(input.command==='accept'){
        if(session.actor.id===risk.ownerId)throw new ForbiddenException('L’acceptation doit être décidée par une personne distincte du responsable du risque.');
        await this.owner(session,risk.siteId,risk.ownerId);
        if(risk.reviewOverdue)throw new BadRequestException('Actualisez la date de revue avant d’accepter le risque.');
      }
      const status=input.command==='accept'?'accepted':input.command==='archive'?'archived':'active';
      await session.db.query('UPDATE app.risks SET status=$3,acceptance_note=$4,last_change_note=$5 WHERE tenant_id=$1 AND id=$2',
        [session.tenant.id,id,status,input.command==='accept'?input.note:null,input.note]);
      return this.detailIn(session,id);
    });
  }
  addAction(principal:Principal,tenant:string|undefined,id:string,input:RiskActionDto){
    return this.database.withTenant(principal,tenant,async session=>{
      const {risk}=await this.lock(session,id,input.revision);
      if(risk.status!=='active')throw new ConflictException('Le risque doit être en traitement pour ajouter une action.');
      await this.owner(session,risk.siteId,input.ownerId);
      await session.db.query(`INSERT INTO app.actions(id,tenant_id,site_id,owner_id,title,origin,priority,due_date,risk_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [randomUUID(),session.tenant.id,risk.siteId,input.ownerId,input.title,`Risque · ${id.slice(0,8)}`,input.priority,input.dueDate||null,id]);
      return this.detailIn(session,id);
    });
  }
  history(principal:Principal,tenant:string|undefined,id:string):Promise<ReportEvent[]>{
    return this.database.withTenant(principal,tenant,async session=>{
      await this.detailIn(session,id);
      const {rows}=await session.db.query<ReportEvent>(`SELECT id,actor_id AS "actorId",operation,occurred_at AS "occurredAt",before_data AS "before",after_data AS "after"
        FROM app.risk_events WHERE tenant_id=$1 AND risk_id=$2 ORDER BY occurred_at DESC,id LIMIT 100`,[session.tenant.id,id]);
      return rows;
    });
  }
}
