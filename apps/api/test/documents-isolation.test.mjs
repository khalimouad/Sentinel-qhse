import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createHash } from 'node:crypto';
import pg from 'pg';

if (!process.env.DATABASE_URL) throw new Error('Migrate and seed the local database before running document isolation tests.');
const pool=new pg.Pool({ connectionString:process.env.DATABASE_URL,max:1 });
const tenant='10000000-0000-4000-8000-000000000001';
const otherTenant='10000000-0000-4000-8000-000000000002';
const site='30000000-0000-4000-8000-000000000001';
const author='20000000-0000-4000-8000-000000000001';
const reader='20000000-0000-4000-8000-000000000002';
const reviewer='20000000-0000-4000-8000-000000000003';
const approver='20000000-0000-4000-8000-000000000005';
after(()=>pool.end());
async function actor(db,user,scope=tenant) {
  await db.query("SELECT set_config('app.actor_id',$1,true),set_config('app.tenant_id',$2,true)",[user,scope]);
}
async function transaction(fn) {
  const db=await pool.connect();
  try { await db.query('BEGIN'); await actor(db,author); return await fn(db); }
  finally { await db.query('ROLLBACK'); db.release(); }
}
async function draft(db) {
  const id=randomUUID(),version=randomUUID();
  await db.query('INSERT INTO app.documents(id,tenant_id,site_id,code,title) VALUES($1,$2,$3,$4,$5)',[id,tenant,site,`TEST-${id.slice(0,8).toUpperCase()}`,'Procédure de test']);
  await db.query(`INSERT INTO app.document_versions(id,tenant_id,site_id,document_id,number,content,author_id,reviewer_id,approver_id)
    VALUES($1,$2,$3,$4,1,$5,$6,$7,$8)`,[version,tenant,site,id,'Contenu maîtrisé',author,reviewer,approver]);
  return { id,version };
}
test('draft is hidden from readers; published version supports an immutable, idempotent receipt',()=>transaction(async db=>{
  const { id,version }=await draft(db);
  const hash=await db.query('SELECT content_sha256 FROM app.document_versions WHERE id=$1',[version]);
  assert.equal(hash.rows[0].content_sha256,createHash('sha256').update('Contenu maîtrisé').digest('hex'));
  await actor(db,reader);
  assert.equal((await db.query('SELECT id FROM app.documents WHERE id=$1',[id])).rowCount,0);
  assert.equal((await db.query('SELECT id FROM app.document_versions WHERE id=$1',[version])).rowCount,0);
  assert.equal((await db.query('SELECT id FROM app.document_events WHERE version_id=$1',[version])).rowCount,0);
  await actor(db,author);
  await db.query("UPDATE app.document_versions SET status='in_review',revision=revision+1 WHERE id=$1",[version]);
  await actor(db,reviewer);
  await db.query("UPDATE app.document_versions SET status='pending_approval',revision=revision+1,reviewed_at=clock_timestamp() WHERE id=$1",[version]);
  await actor(db,approver);
  await db.query("UPDATE app.document_versions SET status='published',revision=revision+1,approved_at=clock_timestamp() WHERE id=$1",[version]);
  await actor(db,reader);
  assert.equal((await db.query('SELECT id FROM app.documents WHERE id=$1',[id])).rowCount,1);
  for(let i=0;i<2;i++) await db.query('INSERT INTO app.document_receipts(tenant_id,site_id,version_id,user_id) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING',[tenant,site,version,reader]);
  assert.equal((await db.query('SELECT * FROM app.document_receipts WHERE version_id=$1',[version])).rowCount,1);
  await actor(db,author,otherTenant);
  for(const table of ['documents','document_versions','document_receipts','document_events']) assert.equal((await db.query(`SELECT * FROM app.${table}`)).rowCount,0);
}));
test('submitted content cannot be rewritten, even through SQL',async()=>{
  await assert.rejects(transaction(async db=>{
    const { version }=await draft(db);
    await db.query("UPDATE app.document_versions SET status='in_review',revision=revision+1 WHERE id=$1",[version]);
    await db.query("UPDATE app.document_versions SET content='Changed after submission' WHERE id=$1",[version]);
  }),{ code:'23514' });
});
test('author cannot bypass the named reviewer through SQL',async()=>{
  await assert.rejects(transaction(async db=>{
    const { version }=await draft(db);
    await db.query("UPDATE app.document_versions SET status='in_review',revision=revision+1 WHERE id=$1",[version]);
    await db.query("UPDATE app.document_versions SET status='pending_approval',revision=revision+1 WHERE id=$1",[version]);
  }),{ code:'42501' });
});
test('a replacement archives the prior publication atomically and preserves its content',()=>transaction(async db=>{
  const { id,version }=await draft(db);
  async function publish(versionId) {
    await actor(db,author); await db.query("UPDATE app.document_versions SET status='in_review',revision=revision+1 WHERE id=$1",[versionId]);
    await actor(db,reviewer); await db.query("UPDATE app.document_versions SET status='pending_approval',revision=revision+1 WHERE id=$1",[versionId]);
    await actor(db,approver);
    await db.query("UPDATE app.document_versions SET status='archived',revision=revision+1 WHERE document_id=$1 AND status='published'",[id]);
    await db.query("UPDATE app.document_versions SET status='published',revision=revision+1 WHERE id=$1",[versionId]);
  }
  await publish(version); await actor(db,author);
  const replacement=randomUUID();
  await db.query('UPDATE app.documents SET last_version=2 WHERE id=$1',[id]);
  await db.query(`INSERT INTO app.document_versions(id,tenant_id,site_id,document_id,number,content,author_id,reviewer_id,approver_id)
    VALUES($1,$2,$3,$4,2,$5,$6,$7,$8)`,[replacement,tenant,site,id,'Version révisée',author,reviewer,approver]);
  await publish(replacement);
  const versions=await db.query('SELECT number,status,content FROM app.document_versions WHERE document_id=$1 ORDER BY number',[id]);
  assert.deepEqual(versions.rows,[{ number:1,status:'archived',content:'Contenu maîtrisé' },{ number:2,status:'published',content:'Version révisée' }]);
}));
