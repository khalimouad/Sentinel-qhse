import {BadRequestException,ConflictException,ForbiddenException,Injectable,NotFoundException} from '@nestjs/common';
import {randomUUID} from 'node:crypto';
import {Database} from '../database.js';
import {actionColumns,actionJoins} from '../actions/action-query.js';
import type {Principal} from '../auth.js';
import {ControlTestQuery,CreateControlTestDto,CompleteControlTestDto,ControlTestActionDto} from './control-tests.dto.js';
import {CreateEthicsDto,EthicsQuery,UpdateEthicsDto,EthicsDecisionDto} from './dto.js';
const columns=`e.id,e.kind,e.title,e.description,e.country,e.site_id AS "siteId",s.name AS "siteName",e.party_id AS "partyId",p.title AS "partyName",e.risk_id AS "riskId",r.title AS "linkedRiskTitle",e.risk,e.status,e.amount::text AS amount,e.currency,e.occurred_on::text AS "occurredOn",e.review_on::text AS "reviewOn",e.owner_id AS "ownerId",e.questionnaire,e.questionnaire_version AS "questionnaireVersion",e.decision,e.decision_note AS "decisionNote",e.decided_by AS "decidedBy",e.decided_at AS "decidedAt",e.revision,e.created_at AS "createdAt",e.updated_at AS "updatedAt"`;
const joins='FROM app.ethics_records e JOIN app.sites s ON s.id=e.site_id LEFT JOIN app.ethics_records p ON p.id=e.party_id AND p.tenant_id=e.tenant_id LEFT JOIN app.risks r ON r.id=e.risk_id AND r.tenant_id=e.tenant_id';
@Injectable() export class EthicsService {
 constructor(private readonly database:Database){}
 list(principal:Principal,tenant:string|undefined,query:EthicsQuery){return this.database.withTenant(principal,tenant,async session=>{
  if(!session.canWrite)throw new ForbiddenException('Registre réservé aux responsables habilités.');
  const args=[session.tenant.id,query.kind,query.siteId||null,query.search||''];const where="WHERE e.tenant_id=$1 AND e.kind=$2 AND ($3::uuid IS NULL OR e.site_id=$3) AND ($4::text='' OR strpos(lower(e.title),lower($4))>0)";
  const count=await session.db.query(`SELECT count(*)::int AS total FROM app.ethics_records e ${where}`,args);
  const {rows}=await session.db.query(`SELECT ${columns} ${joins} ${where} ORDER BY e.created_at DESC,e.id DESC LIMIT $5 OFFSET $6`,[...args,query.limit,query.offset]);return {items:rows,total:count.rows[0].total};
 });}
 create(principal:Principal,tenant:string|undefined,input:CreateEthicsDto){return this.database.withTenant(principal,tenant,async session=>{
  if(!session.canWrite)throw new ForbiddenException('Registre réservé aux responsables habilités.');
  if((input.kind==='assessment')!==Boolean(input.partyId))throw new BadRequestException('Une évaluation doit être liée à un tiers du même site.');
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
  if(input.questionnaire){const record=await session.db.query('SELECT kind FROM app.ethics_records WHERE tenant_id=$1 AND id=$2',[session.tenant.id,id]);if(!record.rowCount)throw new NotFoundException('Dossier introuvable.');if(record.rows[0].kind!=='assessment')throw new BadRequestException('Le questionnaire concerne une évaluation de tiers.');}
  const updated=await session.db.query('UPDATE app.ethics_records SET status=$3,risk=$4,description=$5,review_on=$6,questionnaire=coalesce($8::jsonb,questionnaire) WHERE tenant_id=$1 AND id=$2 AND revision=$7 RETURNING id',[session.tenant.id,id,input.status,input.risk,input.description,input.reviewOn||null,input.revision,input.questionnaire?JSON.stringify(input.questionnaire):null]);
  if(!updated.rowCount){const existing=await session.db.query('SELECT id FROM app.ethics_records WHERE tenant_id=$1 AND id=$2',[session.tenant.id,id]);if(!existing.rowCount)throw new NotFoundException('Dossier introuvable.');throw new ConflictException('Ce dossier a changé. Actualisez.');}
  const {rows}=await session.db.query(`SELECT ${columns} ${joins} WHERE e.tenant_id=$1 AND e.id=$2`,[session.tenant.id,id]);return rows[0];
 });}
 decide(principal:Principal,tenant:string|undefined,id:string,input:EthicsDecisionDto){return this.database.withTenant(principal,tenant,async session=>{
  if(!session.canWrite)throw new ForbiddenException('Registre réservé aux responsables habilités.');
  const updated=await session.db.query("UPDATE app.ethics_records SET decision=$3,decision_note=$4,decided_by=$5,decided_at=clock_timestamp(),status='reviewed' WHERE tenant_id=$1 AND id=$2 AND revision=$6 AND kind<>'third_party' RETURNING id",[session.tenant.id,id,input.decision,input.note,session.actor.id,input.revision]);
  if(!updated.rowCount){const existing=await session.db.query('SELECT kind FROM app.ethics_records WHERE tenant_id=$1 AND id=$2',[session.tenant.id,id]);if(!existing.rowCount)throw new NotFoundException('Dossier introuvable.');if(existing.rows[0].kind==='third_party')throw new BadRequestException('Créez une évaluation avant de prendre une décision sur un tiers.');throw new ConflictException('Ce dossier a changé. Actualisez.');}
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
 history(principal:Principal,tenant:string|undefined,id:string){return this.database.withTenant(principal,tenant,async session=>{
  if(!session.canWrite)throw new ForbiddenException('Registre réservé aux responsables habilités.');const exists=await session.db.query('SELECT id FROM app.ethics_records WHERE tenant_id=$1 AND id=$2',[session.tenant.id,id]);if(!exists.rowCount)throw new NotFoundException('Dossier introuvable.');
  const {rows}=await session.db.query('SELECT id,actor_id AS "actorId",operation,occurred_at AS "occurredAt",before_data AS "before",after_data AS "after" FROM app.ethics_events WHERE tenant_id=$1 AND record_id=$2 ORDER BY occurred_at DESC,id DESC LIMIT 100',[session.tenant.id,id]);return rows;
 });}
}
