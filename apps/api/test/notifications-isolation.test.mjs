import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import pg from 'pg';

test('assignment creates a notification while runtime readers remain recipient-scoped',async()=>{
 if(!process.env.DATABASE_URL)throw new Error('A migrated and seeded disposable database is required.');
 const db=new pg.Client({connectionString:process.env.DATABASE_URL});await db.connect();
 const tenant='10000000-0000-4000-8000-000000000001',admin='20000000-0000-4000-8000-000000000001',reader='20000000-0000-4000-8000-000000000002',site='30000000-0000-4000-8000-000000000001',id=randomUUID();
 try{
  await db.query('BEGIN');await db.query("SELECT set_config('app.actor_id',$1,true),set_config('app.tenant_id',$2,true)",[admin,tenant]);
  await db.query('INSERT INTO app.actions(id,tenant_id,site_id,owner_id,title) VALUES($1,$2,$3,$4,$5)',[id,tenant,site,reader,'Notification de recette']);
  const author=await db.query('SELECT id FROM app.notifications WHERE action_id=$1',[id]);assert.equal(author.rowCount,0);
  await db.query("SELECT set_config('app.actor_id',$1,true)",[reader]);
  const recipient=await db.query('SELECT id,recipient_id FROM app.notifications WHERE action_id=$1',[id]);assert.equal(recipient.rowCount,1);assert.equal(recipient.rows[0].recipient_id,reader);
  await assert.rejects(db.query('INSERT INTO app.notifications(tenant_id,site_id,recipient_id,actor_id,action_id,kind) VALUES($1,$2,$3,$4,$5,$6)',[tenant,site,reader,admin,id,'action_assigned']),{code:'42501'});
 }finally{await db.query('ROLLBACK').catch(()=>{});await db.end();}
});
