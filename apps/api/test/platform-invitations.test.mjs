import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';

const tenant='10000000-0000-4000-8000-000000000001';
const actor='20000000-0000-4000-8000-000000000001';
const reader='20000000-0000-4000-8000-000000000002';
const site='30000000-0000-4000-8000-000000000001';
const externalSite='30000000-0000-4000-8000-000000000004';
const owner=new pg.Client({connectionString:process.env.DATABASE_ADMIN_URL});
const app=new pg.Client({connectionString:process.env.DATABASE_URL});
let createdAdmin=false;

test('platform invitation scope, idempotency and cancellation',async()=>{
 if(!process.env.DATABASE_ADMIN_URL||!process.env.DATABASE_URL)throw new Error('A disposable migrated and seeded database is required.');
 await owner.connect();await app.connect();
 try{
  await owner.query('BEGIN');
  const inserted=await owner.query('INSERT INTO identity.platform_admins(user_id) VALUES($1) ON CONFLICT DO NOTHING',[actor]);createdAdmin=inserted.rowCount===1;
  await owner.query('COMMIT');
  await app.query('BEGIN');
  await app.query("SELECT set_config('app.actor_id',$1,true)",[actor]);
  const key=randomUUID(),input={email:'test@example.test',name:'Test',role:'reader',allSites:false,siteIds:[site]};
  const create=body=>app.query('SELECT identity.platform_invitation_create($1,$2,$3,$4) AS result',[tenant,body,key,'Recette locale']);
  const first=(await create(input)).rows[0].result,second=(await create(input)).rows[0].result;
  assert.equal(first.id,second.id);assert.equal(first.status,'pending');
  await app.query('SAVEPOINT duplicate_conflict');
  await assert.rejects(create({...input,name:'Autre'}),{code:'40001'});
  await app.query('ROLLBACK TO SAVEPOINT duplicate_conflict');
  await app.query('SAVEPOINT bad_site');
  await assert.rejects(app.query('SELECT identity.platform_invitation_create($1,$2,$3,$4)',[tenant,{...input,siteIds:[externalSite]},randomUUID(),'Recette']),{code:'23514'});
  await app.query('ROLLBACK TO SAVEPOINT bad_site');
  await app.query('SAVEPOINT direct_read');
  await assert.rejects(app.query('SELECT * FROM identity.platform_invitations'),{code:'42501'});
  await app.query('ROLLBACK TO SAVEPOINT direct_read');
  const result=(await app.query('SELECT identity.platform_invitation_cancel($1,$2,$3) AS result',[tenant,first.id,'Annulation de recette'])).rows[0].result;
  assert.equal(result.status,'cancelled');
  const events=(await app.query('SELECT identity.platform_history($1,$2,$3,$4,$5) AS result',[tenant,'','invitation_cancel',25,0])).rows[0].result;
  assert.ok(events.items.some(event=>event.operation==='invitation_cancel'&&event.note==='Annulation de recette'));
  await app.query("SELECT set_config('app.actor_id',$1,true)",[reader]);
  await app.query('SAVEPOINT no_admin');
  await assert.rejects(app.query('SELECT identity.platform_invitation_list($1,25,0)',[tenant]),{code:'42501'});
  await app.query('ROLLBACK TO SAVEPOINT no_admin');
 }finally{
  await app.query('ROLLBACK').catch(()=>{});await app.end();
  if(createdAdmin)await owner.query('DELETE FROM identity.platform_admins WHERE user_id=$1',[actor]).catch(()=>{});await owner.end();
 }
});

test('delivery state prevents duplicate reservation and stale outcomes',async()=>{
 const privileged=new pg.Client({connectionString:process.env.DATABASE_ADMIN_URL});
 const runtime=new pg.Client({connectionString:process.env.DATABASE_URL});
 await privileged.connect();await runtime.connect();
 try{
  await privileged.query('BEGIN');
  await privileged.query('INSERT INTO identity.platform_admins(user_id) VALUES($1) ON CONFLICT DO NOTHING',[actor]);
  await privileged.query("SELECT set_config('app.actor_id',$1,true)",[actor]);
  const body={email:'test@example.test',name:'Test',role:'reader',allSites:false,siteIds:[site]};
  const created=(await privileged.query('SELECT identity.platform_invitation_create($1,$2,$3,$4) AS result',[tenant,body,randomUUID(),'Recette'])).rows[0].result;
  const attempt=randomUUID();
  const reserved=(await privileged.query("SELECT identity.platform_invitation_reserve_v2($1,$2,$3,'https://example.supabase.co/auth/v1') AS result",[tenant,created.id,attempt])).rows[0].result;
  assert.equal(reserved.status,'sending');
  await privileged.query('SAVEPOINT repeat_attempt');
  await assert.rejects(privileged.query("SELECT identity.platform_invitation_reserve_v2($1,$2,$3,'https://example.supabase.co/auth/v1')",[tenant,created.id,randomUUID()]),{code:'40001'});
  await privileged.query('ROLLBACK TO SAVEPOINT repeat_attempt');
  await privileged.query('SAVEPOINT old_attempt');
  await assert.rejects(privileged.query('SELECT identity.platform_invitation_record_outcome($1,$2,$3,$4,$5)',[tenant,created.id,randomUUID(),'sent',randomUUID()]),{code:'40001'});
  await privileged.query('ROLLBACK TO SAVEPOINT old_attempt');
  const outcome=(await privileged.query('SELECT identity.platform_invitation_record_outcome($1,$2,$3,$4,$5) AS result',[tenant,created.id,attempt,'uncertain',null])).rows[0].result;
  assert.equal(outcome.status,'uncertain');
  await privileged.query('SAVEPOINT no_automatic_retry');
  await assert.rejects(privileged.query("SELECT identity.platform_invitation_reserve_v2($1,$2,$3,'https://example.supabase.co/auth/v1')",[tenant,created.id,randomUUID()]),{code:'40001'});
  await privileged.query('ROLLBACK TO SAVEPOINT no_automatic_retry');
  await runtime.query('BEGIN');await runtime.query("SELECT set_config('app.actor_id',$1,true)",[actor]);
  await assert.rejects(runtime.query("SELECT identity.platform_invitation_reserve_v2($1,$2,$3,'https://example.supabase.co/auth/v1')",[tenant,created.id,randomUUID()]),{code:'42501'});
 }finally{await privileged.query('ROLLBACK').catch(()=>{});await runtime.query('ROLLBACK').catch(()=>{});await privileged.end();await runtime.end();}
});

test('confirmed invitation creates scoped membership exactly once',async()=>{
 const db=new pg.Client({connectionString:process.env.DATABASE_ADMIN_URL});await db.connect();
 try{
  await db.query('BEGIN');await db.query('INSERT INTO identity.platform_admins(user_id) VALUES($1) ON CONFLICT DO NOTHING',[actor]);await db.query("SELECT set_config('app.actor_id',$1,true)",[actor]);
  const subject=randomUUID(),attempt=randomUUID(),input={email:'test@example.test',name:'Test invitation',role:'reader',allSites:false,siteIds:[site]};
  const id=(await db.query('SELECT identity.platform_invitation_create($1,$2,$3,$4) AS result',[tenant,input,randomUUID(),'Recette'])).rows[0].result.id;
  await db.query('SAVEPOINT unconfirmed');await assert.rejects(db.query('SELECT identity.platform_invitation_link($1,$2,$3)',[tenant,id,'https://example.supabase.co/auth/v1']),{code:'40001'});await db.query('ROLLBACK TO SAVEPOINT unconfirmed');
  await db.query("SELECT identity.platform_invitation_reserve_v2($1,$2,$3,'https://example.supabase.co/auth/v1')",[tenant,id,attempt]);
  await db.query('SELECT identity.platform_invitation_record_outcome($1,$2,$3,$4,$5)',[tenant,id,attempt,'sent',subject]);
  await db.query('SAVEPOINT wrong_issuer');await assert.rejects(db.query('SELECT identity.platform_invitation_link($1,$2,$3)',[tenant,id,'https://other.supabase.co/auth/v1']),{code:'40001'});await db.query('ROLLBACK TO SAVEPOINT wrong_issuer');
  const one=(await db.query('SELECT identity.platform_invitation_link($1,$2,$3) AS result',[tenant,id,'https://example.supabase.co/auth/v1'])).rows[0].result;
  const two=(await db.query('SELECT identity.platform_invitation_link($1,$2,$3) AS result',[tenant,id,'https://example.supabase.co/auth/v1'])).rows[0].result;
  assert.equal(one.userId,two.userId);
  const membership=await db.query('SELECT role,all_sites FROM identity.memberships WHERE tenant_id=$1 AND user_id=$2',[tenant,one.userId]);assert.deepEqual(membership.rows[0],{role:'reader',all_sites:false});
  const grants=await db.query('SELECT site_id FROM identity.site_grants WHERE tenant_id=$1 AND user_id=$2',[tenant,one.userId]);assert.deepEqual(grants.rows.map(row=>row.site_id),[site]);
 }finally{await db.query('ROLLBACK').catch(()=>{});await db.end();}
});
