import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
if(!process.env.DATABASE_URL)throw new Error('Migrate and seed a disposable database before testing attachment isolation.');
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL,max:1});
const tenant='10000000-0000-4000-8000-000000000001',otherTenant='10000000-0000-4000-8000-000000000002',site='30000000-0000-4000-8000-000000000001';
const author='20000000-0000-4000-8000-000000000001',reader='20000000-0000-4000-8000-000000000002',reviewer='20000000-0000-4000-8000-000000000003',approver='20000000-0000-4000-8000-000000000005';
const empty='4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945';
after(()=>pool.end());
async function actor(db,user,scope=tenant){await db.query("SELECT set_config('app.actor_id',$1,true),set_config('app.tenant_id',$2,true)",[user,scope]);}
async function tx(fn){const db=await pool.connect();try{await db.query('BEGIN');await actor(db,author);return await fn(db);}finally{await db.query('ROLLBACK');db.release();}}
async function document(db){const id=randomUUID(),version=randomUUID();await db.query('INSERT INTO app.documents(id,tenant_id,site_id,code,title) VALUES($1,$2,$3,$4,$5)',[id,tenant,site,`FILE-${id.slice(0,8).toUpperCase()}`,'Document avec fichier']);await db.query('INSERT INTO app.document_versions(id,tenant_id,site_id,document_id,number,content,author_id,reviewer_id,approver_id) VALUES($1,$2,$3,$4,1,$5,$6,$7,$8)',[version,tenant,site,id,'Contenu',author,reviewer,approver]);return version;}
async function report(db,user){const id=randomUUID();await db.query("INSERT INTO app.reports(id,tenant_id,site_id,title,description,kind,severity,occurred_at,reported_by) VALUES($1,$2,$3,'Rapport avec pièce','Description','incident','low',now(),$4)",[id,tenant,site,user]);return id;}
async function file(db,{version=null,reportId=null,user=author}){const id=randomUUID();await db.query('INSERT INTO app.attachments(id,tenant_id,site_id,document_version_id,report_id,filename,mime_type,size,sha256,staging_key,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,5,$8,$9,$10)',[id,tenant,site,version,reportId,'preuve.txt','text/plain','a'.repeat(64),`staging/${tenant}/${id}`,user]);return id;}
async function ready(db,id){await db.query("UPDATE app.attachments SET status='ready',object_key=$2,ready_at=now() WHERE id=$1",[id,`tenants/${tenant}/objects/${id}/${randomUUID()}`]);}
test('pending uploads block submission; verified attachment manifests freeze with the version',()=>tx(async db=>{
  const version=await document(db),id=await file(db,{version});
  const pending=(await db.query('SELECT revision,attachments_sha256 FROM app.document_versions WHERE id=$1',[version])).rows[0];assert.equal(pending.revision,2);assert.equal(pending.attachments_sha256,empty);
  await db.query('SAVEPOINT pending_submit');await assert.rejects(db.query("UPDATE app.document_versions SET status='in_review',revision=revision+1 WHERE id=$1",[version]),{code:'23514'});await db.query('ROLLBACK TO SAVEPOINT pending_submit');
  await ready(db,id);const manifest=(await db.query('SELECT attachments_sha256 FROM app.document_versions WHERE id=$1',[version])).rows[0].attachments_sha256;assert.notEqual(manifest,empty);
  await actor(db,reader);assert.equal((await db.query('SELECT id FROM app.attachments WHERE id=$1',[id])).rowCount,0);assert.equal((await db.query('SELECT id FROM app.attachment_events WHERE attachment_id=$1',[id])).rowCount,0);
  await db.query('SAVEPOINT private_parent_lock');await assert.rejects(db.query('SELECT app.lock_file_parent($1,$2,NULL)',[tenant,version]),{code:'42501'});await db.query('ROLLBACK TO SAVEPOINT private_parent_lock');
  await actor(db,author);await db.query("UPDATE app.document_versions SET status='in_review',revision=revision+1 WHERE id=$1",[version]);
  assert.equal((await db.query("UPDATE app.attachments SET status='deleted' WHERE id=$1 RETURNING id",[id])).rowCount,0);
  await actor(db,reviewer);await db.query("UPDATE app.document_versions SET status='pending_approval',revision=revision+1 WHERE id=$1",[version]);await actor(db,approver);await db.query("UPDATE app.document_versions SET status='published',revision=revision+1 WHERE id=$1",[version]);
  await actor(db,reader);assert.equal((await db.query('SELECT id FROM app.attachments WHERE id=$1',[id])).rowCount,1);assert.equal((await db.query('SELECT attachments_sha256 FROM app.document_versions WHERE id=$1',[version])).rows[0].attachments_sha256,manifest);
  await actor(db,author,otherTenant);assert.equal((await db.query('SELECT * FROM app.attachments')).rowCount,0);assert.equal((await db.query('SELECT * FROM app.attachment_events')).rowCount,0);
}));
test('staff can attach to their own report without gaining analysis update privileges',()=>tx(async db=>{
  await actor(db,reader);const parent=await report(db,reader),id=await file(db,{reportId:parent,user:reader});await ready(db,id);
  const row=(await db.query('SELECT attachments_sha256,revision FROM app.reports WHERE id=$1',[parent])).rows[0];assert.notEqual(row.attachments_sha256,empty);assert.equal(row.revision,3);
  assert.equal((await db.query("UPDATE app.reports SET root_cause='Unauthorized' WHERE id=$1 RETURNING id",[parent])).rowCount,0);
  await actor(db,author);const privateParent=await report(db,author),privateFile=await file(db,{reportId:privateParent});await ready(db,privateFile);await actor(db,reader);assert.equal((await db.query('SELECT id FROM app.attachments WHERE id=$1',[privateFile])).rowCount,0);
}));
test('a verified object key cannot be replaced and history cannot be removed',async()=>{
  await assert.rejects(tx(async db=>{const version=await document(db),id=await file(db,{version});await ready(db,id);await db.query('UPDATE app.attachments SET object_key=$2 WHERE id=$1',[id,`tenants/${tenant}/objects/${id}/${randomUUID()}`]);}),{code:'23514'});
  await assert.rejects(tx(db=>db.query('DELETE FROM app.attachment_events')),{code:'42501'});
});
test('cancelling an incomplete upload unblocks document submission',()=>tx(async db=>{
  const version=await document(db),id=await file(db,{version});await db.query("UPDATE app.attachments SET status='deleted' WHERE id=$1",[id]);await db.query("UPDATE app.document_versions SET status='in_review',revision=revision+1 WHERE id=$1",[version]);assert.equal((await db.query('SELECT status FROM app.document_versions WHERE id=$1',[version])).rows[0].status,'in_review');
}));
