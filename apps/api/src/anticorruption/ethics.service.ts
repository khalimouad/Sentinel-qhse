import {BadRequestException,ConflictException,ForbiddenException,Injectable,NotFoundException} from '@nestjs/common';
import {randomUUID} from 'node:crypto';
import {Database} from '../database.js';
import type {Principal} from '../auth.js';
import {CreateEthicsDto,EthicsQuery,UpdateEthicsDto} from './dto.js';
const columns=`e.id,e.kind,e.title,e.description,e.country,e.site_id AS "siteId",s.name AS "siteName",e.party_id AS "partyId",p.title AS "partyName",e.risk,e.status,e.amount::text AS amount,e.currency,e.occurred_on::text AS "occurredOn",e.review_on::text AS "reviewOn",e.owner_id AS "ownerId",e.revision,e.created_at AS "createdAt",e.updated_at AS "updatedAt"`;
const joins='FROM app.ethics_records e JOIN app.sites s ON s.id=e.site_id LEFT JOIN app.ethics_records p ON p.id=e.party_id AND p.tenant_id=e.tenant_id';
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
  if(input.amount&&!input.currency)throw new BadRequestException('La devise est obligatoire pour un montant.');
  const allowed=await session.db.query('SELECT identity.can_review_site($1,$2,$3) AS allowed',[session.tenant.id,input.siteId,input.ownerId]);if(!allowed.rows[0].allowed)throw new BadRequestException('Responsable ou site non habilité.');
  if(input.partyId){const party=await session.db.query("SELECT id FROM app.ethics_records WHERE tenant_id=$1 AND site_id=$2 AND id=$3 AND kind='third_party'",[session.tenant.id,input.siteId,input.partyId]);if(!party.rowCount)throw new BadRequestException('Tiers introuvable sur ce site.');}
  const id=randomUUID();await session.db.query(`INSERT INTO app.ethics_records(id,tenant_id,site_id,kind,title,description,country,party_id,risk,amount,currency,occurred_on,review_on,owner_id,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,[id,session.tenant.id,input.siteId,input.kind,input.title,input.description||'',input.country||'',input.partyId||null,input.risk||'unassessed',input.amount||null,input.currency||null,input.occurredOn||null,input.reviewOn||null,input.ownerId,session.actor.id]);
  const {rows}=await session.db.query(`SELECT ${columns} ${joins} WHERE e.tenant_id=$1 AND e.id=$2`,[session.tenant.id,id]);return rows[0];
 });}
 update(principal:Principal,tenant:string|undefined,id:string,input:UpdateEthicsDto){return this.database.withTenant(principal,tenant,async session=>{
  if(!session.canWrite)throw new ForbiddenException('Registre réservé aux responsables habilités.');
  const updated=await session.db.query('UPDATE app.ethics_records SET status=$3,risk=$4,description=$5,review_on=$6 WHERE tenant_id=$1 AND id=$2 AND revision=$7 RETURNING id',[session.tenant.id,id,input.status,input.risk,input.description,input.reviewOn||null,input.revision]);
  if(!updated.rowCount){const existing=await session.db.query('SELECT id FROM app.ethics_records WHERE tenant_id=$1 AND id=$2',[session.tenant.id,id]);if(!existing.rowCount)throw new NotFoundException('Dossier introuvable.');throw new ConflictException('Ce dossier a changé. Actualisez.');}
  const {rows}=await session.db.query(`SELECT ${columns} ${joins} WHERE e.tenant_id=$1 AND e.id=$2`,[session.tenant.id,id]);return rows[0];
 });}
 history(principal:Principal,tenant:string|undefined,id:string){return this.database.withTenant(principal,tenant,async session=>{
  if(!session.canWrite)throw new ForbiddenException('Registre réservé aux responsables habilités.');const exists=await session.db.query('SELECT id FROM app.ethics_records WHERE tenant_id=$1 AND id=$2',[session.tenant.id,id]);if(!exists.rowCount)throw new NotFoundException('Dossier introuvable.');
  const {rows}=await session.db.query('SELECT id,actor_id AS "actorId",operation,occurred_at AS "occurredAt",before_data AS "before",after_data AS "after" FROM app.ethics_events WHERE tenant_id=$1 AND record_id=$2 ORDER BY occurred_at DESC,id DESC LIMIT 100',[session.tenant.id,id]);return rows;
 });}
}
