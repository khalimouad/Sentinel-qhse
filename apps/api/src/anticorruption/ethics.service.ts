import {BadRequestException,ConflictException,ForbiddenException,Injectable,NotFoundException} from '@nestjs/common';
import {randomUUID} from 'node:crypto';
import {Database} from '../database.js';
import {actionColumns,actionJoins} from '../actions/action-query.js';
import type {EthicsSummary} from '@sentinelle/contracts';
import type {Principal} from '../auth.js';
import {CreateThresholdDto,ThresholdQuery} from './threshold.dto.js';
import {ControlTestQuery,CreateControlTestDto,CompleteControlTestDto,ControlTestActionDto} from './control-tests.dto.js';
import {CreateEthicsDto,EthicsQuery,UpdateEthicsDto,EthicsDecisionDto,EthicsSummaryQuery,PartyRelationsQuery} from './dto.js';
const columns=`e.id,e.kind,e.title,e.description,e.country,e.site_id AS "siteId",s.name AS "siteName",e.party_id AS "partyId",p.title AS "partyName",e.risk_id AS "riskId",r.title AS "linkedRiskTitle",e.risk,e.status,e.amount::text AS amount,e.currency,e.occurred_on::text AS "occurredOn",e.review_on::text AS "reviewOn",e.owner_id AS "ownerId",e.questionnaire,e.questionnaire_version AS "questionnaireVersion",e.decision,e.decision_note AS "decisionNote",e.decided_by AS "decidedBy",e.decided_at AS "decidedAt",e.decision_threshold_id AS "decisionThresholdId",e.decision_threshold_amount::text AS "decisionThresholdAmount",e.decision_escalated AS "decisionEscalated",e.revision,e.created_at AS "createdAt",e.updated_at AS "updatedAt"`;
const joins='FROM app.ethics_records e JOIN app.sites s ON s.id=e.site_id LEFT JOIN app.ethics_records p ON p.id=e.party_id AND p.tenant_id=e.tenant_id LEFT JOIN app.risks r ON r.id=e.risk_id AND r.tenant_id=e.tenant_id';
@Injectable() export class EthicsService {
 constructor(private readonly database:Database){}
 summary(principal:Principal,tenant:string|undefined,query:EthicsSummaryQuery):Promise<EthicsSummary>{return this.database.withTenant(principal,tenant,async session=>{
  if(!session.canWrite)throw new ForbiddenException('Registre réservé aux responsables habilités.');
  if(query.siteId){const site=await session.db.query('SELECT id FROM app.sites WHERE tenant_id=$1 AND id=$2',[session.tenant.id,query.siteId]);if(!site.rowCount)throw new NotFoundException('Site introuvable.');}
  const {rows}=await session.db.query<EthicsSummary>(`WITH today AS (SELECT (statement_timestamp() AT TIME ZONE 'UTC')::date AS day),
   records AS (SELECT e.* FROM app.ethics_records e WHERE e.tenant_id=$1 AND ($2::uuid IS NULL OR e.site_id=$2)),
   tests AS (SELECT t.* FROM app.control_tests t JOIN records c ON c.id=t.control_id AND c.kind='control' WHERE t.tenant_id=$1),
   actions AS (SELECT a.* FROM app.actions a JOIN tests t ON t.id=a.control_test_id WHERE a.tenant_id=$1)
   SELECT statement_timestamp() AS "asOf",(SELECT day::text FROM today) AS "asOfDate",
    (SELECT jsonb_build_object('total',count(*)::int,'withAssessment',count(*) FILTER(WHERE EXISTS(SELECT 1 FROM records a WHERE a.kind='assessment' AND a.party_id=p.id))::int,
      'withoutAssessment',count(*) FILTER(WHERE NOT EXISTS(SELECT 1 FROM records a WHERE a.kind='assessment' AND a.party_id=p.id))::int,'highRisk',count(*) FILTER(WHERE p.risk='high')::int) FROM records p WHERE p.kind='third_party') AS "thirdParties",
    (SELECT jsonb_build_object('total',count(*)::int,'awaitingDecision',count(*) FILTER(WHERE e.decision IS NULL)::int,'overdueReview',count(*) FILTER(WHERE e.status<>'closed' AND e.review_on<today.day)::int) FROM records e CROSS JOIN today WHERE e.kind='assessment') AS assessments,
    (SELECT jsonb_build_object('gifts',count(*) FILTER(WHERE e.kind='gift')::int,'conflicts',count(*) FILTER(WHERE e.kind='conflict')::int,'donations',count(*) FILTER(WHERE e.kind='donation')::int,'awaitingDecision',count(*) FILTER(WHERE e.decision IS NULL AND e.status<>'closed')::int) FROM records e WHERE e.kind IN ('gift','conflict','donation')) AS declarations,
    jsonb_build_object('total',(SELECT count(*)::int FROM records WHERE kind='control'),'plannedTests',(SELECT count(*)::int FROM tests WHERE status='planned'),
      'overdueTests',(SELECT count(*)::int FROM tests t CROSS JOIN today WHERE t.status='planned' AND t.planned_on<today.day),
      'completedTests',(SELECT count(*)::int FROM tests WHERE status='completed'),'nonEffectiveTests',(SELECT count(*)::int FROM tests WHERE status='completed' AND result IN ('partial','ineffective')),
      'openActions',(SELECT count(*)::int FROM actions WHERE status='open')) AS controls`,[session.tenant.id,query.siteId||null]);return rows[0];
 });}
 thresholds(principal:Principal,tenant:string|undefined,query:ThresholdQuery){return this.database.withTenant(principal,tenant,async session=>{
  if(!session.canWrite)throw new ForbiddenException('Registre réservé aux responsables habilités.');
  const allowed=await session.db.query('SELECT identity.can_write_site($1,$2) AS allowed',[session.tenant.id,query.siteId]);if(!allowed.rows[0].allowed)throw new ForbiddenException('Site non autorisé.');
  const {rows}=await session.db.query(`SELECT DISTINCT ON(kind,currency) id,kind,currency,amount::text AS amount,version,created_by AS "createdBy",created_at AS "createdAt" FROM app.ethics_thresholds WHERE tenant_id=$1 AND site_id=$2 ORDER BY kind,currency,version DESC`,[session.tenant.id,query.siteId]);return {items:rows};
 });}
 createThreshold(principal:Principal,tenant:string|undefined,input:CreateThresholdDto){return this.database.withTenant(principal,tenant,async session=>{
  if(session.tenant.role!=='admin')throw new ForbiddenException('Seul un administrateur peut configurer les seuils.');
  const allowed=await session.db.query('SELECT identity.can_write_site($1,$2) AS allowed',[session.tenant.id,input.siteId]);if(!allowed.rows[0].allowed)throw new ForbiddenException('Site non autorisé.');
  await session.db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[`${session.tenant.id}:${input.siteId}:ethics-threshold`]);
  const previous=await session.db.query('SELECT id,kind,currency,amount::text AS amount FROM app.ethics_thresholds WHERE tenant_id=$1 AND site_id=$2 AND created_by=$3 AND request_key=$4',[session.tenant.id,input.siteId,session.actor.id,input.idempotencyKey]);
  if(previous.rows[0]){const p=previous.rows[0];const equal=await session.db.query('SELECT $1::numeric=$2::numeric AS equal',[p.amount,input.amount]);if(p.kind!==input.kind||p.currency!==input.currency||!equal.rows[0].equal)throw new ConflictException('Cette clé correspond à un autre seuil.');return {id:p.id};}
  const id=randomUUID();await session.db.query(`INSERT INTO app.ethics_thresholds(id,tenant_id,site_id,kind,currency,amount,version,created_by,request_key)
   SELECT $1,$2,$3,$4,$5,$6,coalesce(max(version),0)+1,$7,$8 FROM app.ethics_thresholds WHERE tenant_id=$2 AND site_id=$3 AND kind=$4 AND currency=$5`,[id,session.tenant.id,input.siteId,input.kind,input.currency,input.amount,session.actor.id,input.idempotencyKey]);return {id};
 });}
 list(principal:Principal,tenant:string|undefined,query:EthicsQuery){return this.database.withTenant(principal,tenant,async session=>{
  if(!session.canWrite)throw new ForbiddenException('Registre réservé aux responsables habilités.');
  const args=[session.tenant.id,query.kind,query.siteId||null,query.search||''];const where="WHERE e.tenant_id=$1 AND e.kind=$2 AND ($3::uuid IS NULL OR e.site_id=$3) AND ($4::text='' OR strpos(lower(e.title),lower($4))>0)";
  const count=await session.db.query(`SELECT count(*)::int AS total FROM app.ethics_records e ${where}`,args);
  const {rows}=await session.db.query(`SELECT ${columns} ${joins} ${where} ORDER BY e.created_at DESC,e.id DESC LIMIT $5 OFFSET $6`,[...args,query.limit,query.offset]);return {items:rows,total:count.rows[0].total};
 });}
 create(principal:Principal,tenant:string|undefined,input:CreateEthicsDto){return this.database.withTenant(principal,tenant,async session=>{
  if(!session.canWrite)throw new ForbiddenException('Registre réservé aux responsables habilités.');
  if(input.kind==='assessment'&&!input.partyId)throw new BadRequestException('Une évaluation doit être liée à un tiers du même site.');
  if(input.partyId&&!['assessment','gift','conflict','donation'].includes(input.kind))throw new BadRequestException('Ce type de fiche ne peut pas être associé à un tiers.');
  if(input.riskId&&input.kind!=='control')throw new BadRequestException('Seul un contrôle peut être lié à un risque.');
  if(input.riskId){const risk=await session.db.query("SELECT id FROM app.risks WHERE tenant_id=$1 AND site_id=$2 AND id=$3 AND category='corruption'",[session.tenant.id,input.siteId,input.riskId]);if(!risk.rowCount)throw new BadRequestException('Risque de corruption introuvable sur ce site.');}
  if(input.amount&&!input.currency)throw new BadRequestException('La devise est obligatoire pour un montant.');
  const allowed=await session.db.query('SELECT identity.can_review_site($1,$2,$3) AS allowed',[session.tenant.id,input.siteId,input.ownerId]);if(!allowed.rows[0].allowed)throw new BadRequestException('Responsable ou site non habilité.');
  if(input.partyId){const party=await session.db.query("SELECT id FROM app.ethics_records WHERE tenant_id=$1 AND site_id=$2 AND id=$3 AND kind='third_party'",[session.tenant.id,input.siteId,input.partyId]);if(!party.rowCount)throw new BadRequestException('Tiers introuvable sur ce site.');}
  const id=randomUUID();await session.db.query(`INSERT INTO app.ethics_records(id,tenant_id,site_id,kind,title,description,country,party_id,risk,amount,currency,occurred_on,review_on,owner_id,created_by,risk_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,[id,session.tenant.id,input.siteId,input.kind,input.title,input.description||'',input.country||'',input.partyId||null,input.risk||'unassessed',input.amount||null,input.currency||null,input.occurredOn||null,input.reviewOn||null,input.ownerId,session.actor.id,input.riskId||null]);
  const {rows}=await session.db.query(`SELECT ${columns} ${joins} WHERE e.tenant_id=$1 AND e.id=$2`,[session.tenant.id,id]);return rows[0];
 });}
 update(principal:Principal,tenant:string|undefined,id:string,input:UpdateEthicsDto){return this.database.withTenant(principal,tenant,async session=>{
  if(!session.canWrite)throw new ForbiddenException('Registre réservé aux responsables habilités.');
  if(input.amount!==undefined&&!input.currency)throw new BadRequestException('La devise est obligatoire pour un montant.');
  if(input.amount!==undefined){const item=await session.db.query('SELECT kind FROM app.ethics_records WHERE tenant_id=$1 AND id=$2',[session.tenant.id,id]);if(!item.rowCount)throw new NotFoundException('Dossier introuvable.');if(!['gift','donation'].includes(item.rows[0].kind))throw new BadRequestException('Le montant concerne un cadeau ou un don.');}
  if(input.questionnaire){const record=await session.db.query('SELECT kind FROM app.ethics_records WHERE tenant_id=$1 AND id=$2',[session.tenant.id,id]);if(!record.rowCount)throw new NotFoundException('Dossier introuvable.');if(record.rows[0].kind!=='assessment')throw new BadRequestException('Le questionnaire concerne une évaluation de tiers.');}
  const changed="($9::numeric IS NOT NULL AND (amount IS DISTINCT FROM $9::numeric OR currency IS DISTINCT FROM $10::text))";
  const updated=await session.db.query(`UPDATE app.ethics_records SET status=CASE WHEN ${changed} THEN 'open' ELSE $3 END,risk=$4,description=$5,review_on=$6,questionnaire=coalesce($8::jsonb,questionnaire),
   decision=CASE WHEN ${changed} THEN NULL ELSE decision END,decision_note=CASE WHEN ${changed} THEN NULL ELSE decision_note END,decided_by=CASE WHEN ${changed} THEN NULL ELSE decided_by END,decided_at=CASE WHEN ${changed} THEN NULL ELSE decided_at END,
   decision_threshold_id=CASE WHEN ${changed} THEN NULL ELSE decision_threshold_id END,decision_threshold_amount=CASE WHEN ${changed} THEN NULL ELSE decision_threshold_amount END,decision_escalated=CASE WHEN ${changed} THEN false ELSE decision_escalated END,amount=coalesce($9::numeric,amount),currency=CASE WHEN $9::numeric IS NULL THEN currency ELSE $10 END
   WHERE tenant_id=$1 AND id=$2 AND revision=$7 RETURNING id`,[session.tenant.id,id,input.status,input.risk,input.description,input.reviewOn||null,input.revision,input.questionnaire?JSON.stringify(input.questionnaire):null,input.amount??null,input.currency??null]);
  if(!updated.rowCount){const existing=await session.db.query('SELECT id FROM app.ethics_records WHERE tenant_id=$1 AND id=$2',[session.tenant.id,id]);if(!existing.rowCount)throw new NotFoundException('Dossier introuvable.');throw new ConflictException('Ce dossier a changé. Actualisez.');}
  const {rows}=await session.db.query(`SELECT ${columns} ${joins} WHERE e.tenant_id=$1 AND e.id=$2`,[session.tenant.id,id]);return rows[0];
 });}
 decide(principal:Principal,tenant:string|undefined,id:string,input:EthicsDecisionDto){return this.database.withTenant(principal,tenant,async session=>{
  if(!session.canWrite)throw new ForbiddenException('Registre réservé aux responsables habilités.');
  const record=await session.db.query<{kind:string;site_id:string;amount:string|null;currency:string|null;revision:number}>('SELECT kind,site_id,amount::text AS amount,currency,revision FROM app.ethics_records WHERE tenant_id=$1 AND id=$2 FOR UPDATE',[session.tenant.id,id]);
  if(!record.rows[0])throw new NotFoundException('Dossier introuvable.');const item=record.rows[0];if(item.kind==='third_party')throw new BadRequestException('Créez une évaluation avant de prendre une décision sur un tiers.');if(item.revision!==input.revision)throw new ConflictException('Ce dossier a changé. Actualisez.');
  if(['gift','donation'].includes(item.kind)&&(item.amount===null||!item.currency))throw new BadRequestException('Enregistrez le montant et la devise avant la décision.');
  let thresholdId:string|null=null,thresholdAmount:string|null=null,escalated=false;
  if(['gift','donation'].includes(item.kind)&&item.amount!==null&&item.currency){
   await session.db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[`${session.tenant.id}:${item.site_id}:ethics-threshold`]);
   const threshold=await session.db.query<{id:string;amount:string;escalated:boolean}>(`SELECT id,amount::text AS amount,$5::numeric>amount AS escalated FROM app.ethics_thresholds WHERE tenant_id=$1 AND site_id=$2 AND kind=$3 AND currency=$4 ORDER BY version DESC LIMIT 1`,[session.tenant.id,item.site_id,item.kind,item.currency,item.amount]);
   if(threshold.rows[0]){thresholdId=threshold.rows[0].id;thresholdAmount=threshold.rows[0].amount;escalated=threshold.rows[0].escalated;if(escalated&&session.tenant.role!=='admin')throw new ForbiddenException('Cette déclaration dépasse le seuil et nécessite une décision administrateur.');}
  }
  await session.db.query("UPDATE app.ethics_records SET decision=$3,decision_note=$4,decided_by=$5,decided_at=clock_timestamp(),status='reviewed',decision_threshold_id=$6,decision_threshold_amount=$7,decision_escalated=$8 WHERE tenant_id=$1 AND id=$2",[session.tenant.id,id,input.decision,input.note,session.actor.id,thresholdId,thresholdAmount,escalated]);
  const {rows}=await session.db.query(`SELECT ${columns} ${joins} WHERE e.tenant_id=$1 AND e.id=$2`,[session.tenant.id,id]);return rows[0];
 });}
 tests(principal:Principal,tenant:string|undefined,id:string,query:ControlTestQuery){return this.database.withTenant(principal,tenant,async session=>{
  if(!session.canWrite)throw new ForbiddenException('Registre réservé aux responsables habilités.');
  const parent=await session.db.query("SELECT id FROM app.ethics_records WHERE tenant_id=$1 AND id=$2 AND kind='control'",[session.tenant.id,id]);if(!parent.rowCount)throw new NotFoundException('Contrôle introuvable.');
  const count=await session.db.query('SELECT count(*)::int AS total FROM app.control_tests WHERE tenant_id=$1 AND control_id=$2',[session.tenant.id,id]);
  const {rows}=await session.db.query(`SELECT t.id,t.title,t.planned_on::text AS "plannedOn",t.tester_id AS "testerId",u.name AS "testerName",t.status,t.result,t.evidence_reference AS "evidenceReference",t.conclusion,t.tested_on::text AS "testedOn",t.completed_at AS "completedAt",t.revision FROM app.control_tests t LEFT JOIN identity.list_members($1) u ON u.id=t.tester_id WHERE t.tenant_id=$1 AND t.control_id=$2 ORDER BY t.planned_on DESC,t.id DESC LIMIT $3 OFFSET $4`,[session.tenant.id,id,query.limit,query.offset]);return {items:rows,total:count.rows[0].total};
 });}
 planTest(principal:Principal,tenant:string|undefined,id:string,input:CreateControlTestDto){return this.database.withTenant(principal,tenant,async session=>{
  if(!session.canWrite)throw new ForbiddenException('Registre réservé aux responsables habilités.');
  const parent=await session.db.query<{site_id:string}>("SELECT site_id FROM app.ethics_records WHERE tenant_id=$1 AND id=$2 AND kind='control' FOR UPDATE",[session.tenant.id,id]);if(!parent.rows[0])throw new NotFoundException('Contrôle introuvable.');
  const prior=await session.db.query('SELECT id,title,planned_on::text AS planned_on,tester_id FROM app.control_tests WHERE tenant_id=$1 AND control_id=$2 AND created_by=$3 AND request_key=$4',[session.tenant.id,id,session.actor.id,input.idempotencyKey]);if(prior.rows[0]){const p=prior.rows[0];if(p.title!==input.title||p.planned_on!==input.plannedOn||p.tester_id!==input.testerId)throw new ConflictException('Cette clé correspond à un autre essai.');return {id:p.id};}
  const allowed=await session.db.query('SELECT identity.can_review_site($1,$2,$3) AS allowed',[session.tenant.id,parent.rows[0].site_id,input.testerId]);if(!allowed.rows[0].allowed)throw new BadRequestException('Vérificateur non habilité sur ce site.');
  const testId=randomUUID();await session.db.query('INSERT INTO app.control_tests(id,tenant_id,site_id,control_id,title,planned_on,tester_id,created_by,request_key) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',[testId,session.tenant.id,parent.rows[0].site_id,id,input.title,input.plannedOn,input.testerId,session.actor.id,input.idempotencyKey]);return {id:testId};
 });}
 completeTest(principal:Principal,tenant:string|undefined,id:string,testId:string,input:CompleteControlTestDto){return this.database.withTenant(principal,tenant,async session=>{
  if(!session.canWrite)throw new ForbiddenException('Registre réservé aux responsables habilités.');
  const current=await session.db.query<{status:string;revision:number;tester_id:string}>('SELECT status,revision,tester_id FROM app.control_tests WHERE tenant_id=$1 AND control_id=$2 AND id=$3 FOR UPDATE',[session.tenant.id,id,testId]);if(!current.rows[0])throw new NotFoundException('Essai introuvable.');
  if(current.rows[0].tester_id!==session.actor.id)throw new ForbiddenException('Seul le vérificateur désigné peut réaliser cet essai.');
  if(current.rows[0].status!=='planned'||current.rows[0].revision!==input.revision)throw new ConflictException('Cet essai a déjà changé. Actualisez.');
  await session.db.query("UPDATE app.control_tests SET status='completed',result=$4,tested_on=$5,evidence_reference=$6,conclusion=$7 WHERE tenant_id=$1 AND control_id=$2 AND id=$3",[session.tenant.id,id,testId,input.result,input.testedOn,input.evidenceReference,input.conclusion]);return {id:testId};
 });}
 testActions(principal:Principal,tenant:string|undefined,id:string,testId:string,query:ControlTestQuery){return this.database.withTenant(principal,tenant,async session=>{
  if(!session.canWrite)throw new ForbiddenException('Registre réservé aux responsables habilités.');
  const test=await session.db.query('SELECT id FROM app.control_tests WHERE tenant_id=$1 AND control_id=$2 AND id=$3',[session.tenant.id,id,testId]);if(!test.rowCount)throw new NotFoundException('Essai introuvable.');
  const count=await session.db.query("SELECT count(*)::int AS total,count(*) FILTER(WHERE status='open')::int AS open FROM app.actions WHERE tenant_id=$1 AND control_test_id=$2",[session.tenant.id,testId]);
  const {rows}=await session.db.query(`SELECT ${actionColumns} ${actionJoins} WHERE a.tenant_id=$1 AND a.control_test_id=$2 ORDER BY a.created_at DESC,a.id DESC LIMIT $3 OFFSET $4`,[session.tenant.id,testId,query.limit,query.offset]);return {items:rows,...count.rows[0]};
 });}
 addTestAction(principal:Principal,tenant:string|undefined,id:string,testId:string,input:ControlTestActionDto){return this.database.withTenant(principal,tenant,async session=>{
  if(!session.canWrite)throw new ForbiddenException('Registre réservé aux responsables habilités.');
  const test=await session.db.query<{site_id:string;status:string;result:string|null}>('SELECT site_id,status,result FROM app.control_tests WHERE tenant_id=$1 AND control_id=$2 AND id=$3 FOR UPDATE',[session.tenant.id,id,testId]);if(!test.rows[0])throw new NotFoundException('Essai introuvable.');
  const existing=await session.db.query('SELECT id,title,owner_id,priority,due_date::text AS due_date FROM app.actions WHERE tenant_id=$1 AND control_test_id=$2 AND control_test_actor_id=$3 AND control_test_request_key=$4',[session.tenant.id,testId,session.actor.id,input.idempotencyKey]);
  if(existing.rows[0]){const a=existing.rows[0];if(a.title!==input.title||a.owner_id!==input.ownerId||a.priority!==input.priority||a.due_date!==(input.dueDate||null))throw new ConflictException('Cette clé correspond à une autre action.');return {id:a.id};}
  if(test.rows[0].status!=='completed'||!['partial','ineffective'].includes(test.rows[0].result||''))throw new ConflictException('Une action corrective nécessite un essai partiellement efficace ou non efficace.');
  const allowed=await session.db.query('SELECT identity.can_review_site($1,$2,$3) AS allowed',[session.tenant.id,test.rows[0].site_id,input.ownerId]);if(!allowed.rows[0].allowed)throw new BadRequestException('Responsable non habilité sur ce site.');
  const actionId=randomUUID();await session.db.query(`INSERT INTO app.actions(id,tenant_id,site_id,owner_id,title,origin,priority,due_date,control_test_id,control_test_request_key,control_test_actor_id) VALUES($1,$2,$3,$4,$5,'Essai de contrôle',$6,$7,$8,$9,$10)`,[actionId,session.tenant.id,test.rows[0].site_id,input.ownerId,input.title,input.priority,input.dueDate||null,testId,input.idempotencyKey,session.actor.id]);return {id:actionId};
 });}
 relations(principal:Principal,tenant:string|undefined,id:string,query:PartyRelationsQuery){return this.database.withTenant(principal,tenant,async session=>{
  if(!session.canWrite)throw new ForbiddenException('Registre réservé aux responsables habilités.');
  const party=await session.db.query("SELECT id FROM app.ethics_records WHERE tenant_id=$1 AND id=$2 AND kind='third_party'",[session.tenant.id,id]);if(!party.rowCount)throw new NotFoundException('Tiers introuvable.');
  const args=[session.tenant.id,id,query.kind||null];
  const count=await session.db.query(`SELECT count(*) FILTER(WHERE $3::text IS NULL OR kind=$3)::int AS total,
    count(*) FILTER(WHERE kind='assessment')::int AS assessments,count(*) FILTER(WHERE kind='gift')::int AS gifts,
    count(*) FILTER(WHERE kind='conflict')::int AS conflicts,count(*) FILTER(WHERE kind='donation')::int AS donations
    FROM app.ethics_records WHERE tenant_id=$1 AND party_id=$2`,args);
  const {rows}=await session.db.query(`SELECT ${columns} ${joins} WHERE e.tenant_id=$1 AND e.party_id=$2 AND ($3::text IS NULL OR e.kind=$3) ORDER BY e.created_at DESC,e.id DESC LIMIT $4 OFFSET $5`,[...args,query.limit,query.offset]);
  return {items:rows,...count.rows[0]};
 });}
 history(principal:Principal,tenant:string|undefined,id:string){return this.database.withTenant(principal,tenant,async session=>{
  if(!session.canWrite)throw new ForbiddenException('Registre réservé aux responsables habilités.');const exists=await session.db.query('SELECT id FROM app.ethics_records WHERE tenant_id=$1 AND id=$2',[session.tenant.id,id]);if(!exists.rowCount)throw new NotFoundException('Dossier introuvable.');
  const {rows}=await session.db.query('SELECT id,actor_id AS "actorId",operation,occurred_at AS "occurredAt",before_data AS "before",after_data AS "after" FROM app.ethics_events WHERE tenant_id=$1 AND record_id=$2 ORDER BY occurred_at DESC,id DESC LIMIT 100',[session.tenant.id,id]);return rows;
 });}
}
