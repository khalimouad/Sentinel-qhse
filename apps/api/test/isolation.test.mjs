import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';

if (!process.env.DATABASE_URL) throw new Error('Set DATABASE_URL to the local restricted runtime role, migrate and seed before running isolation tests.');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
const tenantA = '10000000-0000-4000-8000-000000000001';
const tenantB = '10000000-0000-4000-8000-000000000002';
const admin = '20000000-0000-4000-8000-000000000001';
const reader = '20000000-0000-4000-8000-000000000002';
const siteA = '30000000-0000-4000-8000-000000000001';
const siteB = '30000000-0000-4000-8000-000000000004';
async function asActor(actor,tenant,operation) {
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    await db.query("SELECT set_config('app.actor_id',$1,true),set_config('app.tenant_id',$2,true)",[actor,tenant]);
    return await operation(db);
  } finally { await db.query('ROLLBACK'); db.release(); }
}
test.after(async () => { await pool.end(); });
test('runtime role has no owner or RLS bypass privileges', async () => {
  const { rows } = await pool.query('SELECT current_user AS name,rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user');
  assert.equal(rows[0].name,'sentinelle_app');
  assert.equal(rows[0].rolsuper,false); assert.equal(rows[0].rolbypassrls,false);
});
test('changing tenant context does not grant another tenant membership', async () => {
  await asActor(admin,tenantA,async db => {
    const result = await db.query('SELECT DISTINCT tenant_id FROM app.actions');
    assert.ok(result.rowCount > 0);
    assert.deepEqual(result.rows.map(r => r.tenant_id),[tenantA]);
  });
  await asActor(admin,tenantB,async db => {
    assert.equal((await db.query('SELECT * FROM app.actions')).rowCount,0);
    assert.equal((await db.query('SELECT * FROM app.sites')).rowCount,0);
    assert.equal((await db.query('SELECT * FROM app.audit_events')).rowCount,0);
  });
});
test('site-scoped reader sees only explicitly assigned site', async () => {
  await asActor(reader,tenantA,async db => {
    assert.deepEqual((await db.query('SELECT id FROM app.sites')).rows.map(r=>r.id),[siteA]);
    const rows = (await db.query('SELECT site_id FROM app.actions')).rows;
    assert.ok(rows.length > 0); assert.ok(rows.every(row=>row.site_id===siteA));
  });
});
test('reader cannot insert even using the database directly', async () => {
  await assert.rejects(asActor(reader,tenantA,db => db.query(`INSERT INTO app.actions(id,tenant_id,site_id,owner_id,title)
    VALUES($1,$2,$3,$4,'Unauthorized')`,[randomUUID(),tenantA,siteA,reader])),{ code: '42501' });
});
test('cross-tenant site assignment is rejected by RLS', async () => {
  await assert.rejects(asActor(admin,tenantA,db => db.query(`INSERT INTO app.actions(id,tenant_id,site_id,owner_id,title)
    VALUES($1,$2,$3,$4,'Wrong tenant')`,[randomUUID(),tenantA,siteB,admin])), error => ['42501','23503'].includes(error.code));
});
test('mutation and immutable audit entries share a transaction; stale versions do not update', async () => {
  const id = randomUUID();
  await asActor(admin,tenantA,async db => {
    await db.query(`INSERT INTO app.actions(id,tenant_id,site_id,owner_id,title) VALUES($1,$2,$3,$4,'Audit test')`,[id,tenantA,siteA,admin]);
    const inserted = await db.query('SELECT * FROM app.audit_events WHERE action_id=$1',[id]);
    assert.equal(inserted.rowCount,1); assert.equal(inserted.rows[0].actor_id,admin);
    const update = await db.query("UPDATE app.actions SET status='closed',version=version+1,updated_at=now() WHERE id=$1 AND version=1 RETURNING id",[id]);
    assert.equal(update.rowCount,1);
    assert.equal((await db.query("UPDATE app.actions SET status='open',version=version+1 WHERE id=$1 AND version=1 RETURNING id",[id])).rowCount,0);
    const history = await db.query('SELECT * FROM app.audit_events WHERE action_id=$1 ORDER BY occurred_at',[id]);
    assert.equal(history.rowCount,2);
    assert.equal(history.rows[1].before_data.status,'open'); assert.equal(history.rows[1].after_data.status,'closed');
  });
  assert.equal((await pool.query('SELECT * FROM app.actions WHERE id=$1',[id])).rowCount,0);
  assert.equal((await pool.query('SELECT * FROM app.audit_events WHERE action_id=$1',[id])).rowCount,0);
});
test('runtime role cannot edit audit records or read identity tables', async () => {
  await assert.rejects(asActor(admin,tenantA,db=>db.query('DELETE FROM app.audit_events')),{ code: '42501' });
  await assert.rejects(pool.query('SELECT * FROM identity.users'),{ code: '42501' });
});
test('transaction scope does not leak into pooled connections', async () => {
  await asActor(admin,tenantA,db=>db.query('SELECT * FROM app.actions'));
  assert.equal((await pool.query('SELECT * FROM app.actions')).rowCount,0);
});
