import test,{ after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
if(!process.env.DATABASE_URL)throw new Error('Migrate and seed a local test database before running report tests.');
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL,max:1});
const tenant='10000000-0000-4000-8000-000000000001',otherTenant='10000000-0000-4000-8000-000000000002';
const site='30000000-0000-4000-8000-000000000001',otherSite='30000000-0000-4000-8000-000000000002';
const manager='20000000-0000-4000-8000-000000000001',reader='20000000-0000-4000-8000-000000000002',verifier='20000000-0000-4000-8000-000000000003';
after(()=>pool.end());
async function actor(db,user,scope=tenant){await db.query("SELECT set_config('app.actor_id',$1,true),set_config('app.tenant_id',$2,true)",[user,scope]);}
async function transaction(fn){const db=await pool.connect();try{await db.query('BEGIN');await actor(db,reader);return await fn(db);}finally{await db.query('ROLLBACK');db.release();}}
async function declare(db,reporter=reader,location=site){const id=randomUUID();await db.query(`INSERT INTO app.reports(id,tenant_id,site_id,title,description,kind,severity,occurred_at,reported_by,currency)
  VALUES($1,$2,$3,'Signalement de test','Écart constaté pendant le contrôle','nonconformity','high',now(),$4,'EUR')`,[id,tenant,location,reporter]);return id;}
async function plan(db,id){await actor(db,manager);await db.query(`UPDATE app.reports SET owner_id=$2,verifier_id=$3,root_cause='Procédure incomplète',correction='Lot isolé',cost_amount=120.50 WHERE id=$1`,[id,manager,verifier]);await db.query("UPDATE app.reports SET status='in_analysis' WHERE id=$1",[id]);await db.query("UPDATE app.reports SET status='action_plan' WHERE id=$1",[id]);}
async function action(db,id){const action=randomUUID();await db.query('INSERT INTO app.actions(id,tenant_id,site_id,owner_id,title,report_id) VALUES($1,$2,$3,$4,$5,$6)',[action,tenant,site,manager,'Corriger la procédure',id]);return action;}
test('staff can report and see their own reports but not another reporter’s details or linked histories',()=>transaction(async db=>{
  const own=await declare(db);await actor(db,manager);const privateReport=await declare(db,manager);await plan(db,privateReport);const privateAction=await action(db,privateReport);
  await actor(db,reader);
  assert.equal((await db.query('SELECT id FROM app.reports WHERE id=$1',[own])).rowCount,1);
  assert.equal((await db.query('SELECT id FROM app.reports WHERE id=$1',[privateReport])).rowCount,0);
  assert.equal((await db.query('SELECT id FROM app.actions WHERE id=$1',[privateAction])).rowCount,0);
  assert.equal((await db.query('SELECT id FROM app.audit_events WHERE action_id=$1',[privateAction])).rowCount,0);
  assert.equal((await db.query('SELECT id FROM app.report_events WHERE report_id=$1',[privateReport])).rowCount,0);
  await actor(db,manager,otherTenant);assert.equal((await db.query('SELECT * FROM app.reports')).rowCount,0);
}));
test('staff cannot spoof a reporter or declare on an unauthorized site',async()=>{
  await assert.rejects(transaction(db=>declare(db,manager)),{code:'42501'});
  await assert.rejects(transaction(db=>declare(db,reader,otherSite)),{code:'42501'});
});
test('report cannot enter effectiveness review with unfinished corrective actions',async()=>{
  await assert.rejects(transaction(async db=>{const id=await declare(db);await plan(db,id);await action(db,id);await db.query("UPDATE app.reports SET status='effectiveness_review' WHERE id=$1",[id]);}),{code:'23514'});
});
test('corrective action cannot reference a report from a different site',async()=>{
  await assert.rejects(transaction(async db=>{const id=await declare(db);await plan(db,id);await db.query('INSERT INTO app.actions(id,tenant_id,site_id,owner_id,title,report_id) VALUES($1,$2,$3,$4,$5,$6)',[randomUUID(),tenant,otherSite,manager,'Invalid site link',id]);}),{code:'23503'});
});
test('verification is independent and reopening an action invalidates report closure atomically',()=>transaction(async db=>{
  const id=await declare(db);await plan(db,id);const linked=await action(db,id);
  await db.query("UPDATE app.actions SET status='closed',version=version+1 WHERE id=$1",[linked]);
  await db.query("UPDATE app.reports SET status='effectiveness_review' WHERE id=$1",[id]);
  await db.query('SAVEPOINT unauthorized_review');
  await assert.rejects(db.query("UPDATE app.reports SET status='closed',effectiveness='effective',effectiveness_note='Vérification',reviewed_by=$2 WHERE id=$1",[id,manager]),{code:'42501'});
  await db.query('ROLLBACK TO SAVEPOINT unauthorized_review');
  await actor(db,verifier);await db.query("UPDATE app.reports SET status='closed',effectiveness='effective',effectiveness_note='Contrôles satisfaisants',reviewed_by=$2 WHERE id=$1",[id,verifier]);
  const closed=(await db.query('SELECT status,closed_at,effectiveness,reviewed_by FROM app.reports WHERE id=$1',[id])).rows[0];
  assert.equal(closed.status,'closed');assert.ok(closed.closed_at);assert.equal(closed.reviewed_by,verifier);
  await actor(db,manager);await db.query("UPDATE app.actions SET status='open',version=version+1 WHERE id=$1",[linked]);
  const reopened=(await db.query('SELECT status,closed_at,effectiveness,reviewed_by FROM app.reports WHERE id=$1',[id])).rows[0];
  assert.deepEqual(reopened,{status:'action_plan',closed_at:null,effectiveness:'not_evaluated',reviewed_by:null});
  const latest=(await db.query('SELECT actor_id,before_data,after_data FROM app.report_events WHERE report_id=$1 ORDER BY occurred_at DESC LIMIT 1',[id])).rows[0];
  assert.equal(latest.actor_id,manager);assert.equal(latest.after_data.status,'action_plan');
  assert.equal(latest.before_data.effectiveness,'effective');assert.equal(latest.before_data.effectiveness_note,'Contrôles satisfaisants');
}));
test('history is immutable to the application role',async()=>{
  await assert.rejects(transaction(db=>db.query('DELETE FROM app.report_events')),{code:'42501'});
});
