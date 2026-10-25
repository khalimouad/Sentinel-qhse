import pg from 'pg';
if (process.env.NODE_ENV !== 'development' || process.env.DEV_AUTH_ENABLED !== 'true') {
  throw new Error('Demo seeding requires explicit local development configuration.');
}
if (!process.env.DATABASE_ADMIN_URL) throw new Error('DATABASE_ADMIN_URL is required.');
const db = new pg.Client({ connectionString: process.env.DATABASE_ADMIN_URL });
await db.connect();
try {
  await db.query('BEGIN');
  await db.query(`INSERT INTO app.tenants(id,name,region,jurisdictions) VALUES
    ('10000000-0000-4000-8000-000000000001','Atlas Industries','local-development','{CI,MA,FR}'),
    ('10000000-0000-4000-8000-000000000002','Organisation témoin','local-development','{FR}') ON CONFLICT DO NOTHING`);
  await db.query(`INSERT INTO identity.users(id,issuer,subject,name) VALUES
    ('20000000-0000-4000-8000-000000000001','urn:sentinelle:development','jean-dupont','Jean Dupont'),
    ('20000000-0000-4000-8000-000000000002','urn:sentinelle:development','aicha-meite','Aïcha Méité'),
    ('20000000-0000-4000-8000-000000000003','urn:sentinelle:development','fatima-k','Fatima K.'),
    ('20000000-0000-4000-8000-000000000004','urn:sentinelle:development','other-user','Autre utilisateur'),
    ('20000000-0000-4000-8000-000000000005','urn:sentinelle:development','clara-martin','Clara Martin') ON CONFLICT DO NOTHING`);
  await db.query(`INSERT INTO identity.memberships(tenant_id,user_id,role,all_sites) VALUES
    ('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','admin',true),
    ('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002','reader',false),
    ('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000003','manager',true),
    ('10000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000004','admin',true),
    ('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000005','manager',true) ON CONFLICT DO NOTHING`);
  await db.query(`INSERT INTO app.sites(id,tenant_id,name,country_code) VALUES
    ('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','Abidjan · Yopougon','CI'),
    ('30000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','Abidjan · Zone 4','CI'),
    ('30000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001','Casablanca · Aïn Sebaâ','MA'),
    ('30000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000002','Paris · Témoin','FR') ON CONFLICT DO NOTHING`);
  await db.query(`INSERT INTO identity.site_grants(tenant_id,user_id,site_id) VALUES
    ('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000001') ON CONFLICT DO NOTHING`);
  await db.query("SELECT set_config('app.actor_id','20000000-0000-4000-8000-000000000001',true), set_config('app.tenant_id','10000000-0000-4000-8000-000000000001',true)");
  await db.query(`INSERT INTO app.actions(id,tenant_id,site_id,owner_id,title,origin,priority,due_date) VALUES
    ('40000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002','Mettre à jour l’analyse HACCP — Ligne 3','Audit interne','high',current_date),
    ('40000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000003','Renouveler l’autorisation de rejet','Veille réglementaire','high',current_date+3),
    ('40000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000001','Clôturer la formation sécurité au travail','Revue de direction','normal',current_date+5) ON CONFLICT DO NOTHING`);
  await db.query("SELECT set_config('app.actor_id','20000000-0000-4000-8000-000000000004',true), set_config('app.tenant_id','10000000-0000-4000-8000-000000000002',true)");
  await db.query(`INSERT INTO app.actions(id,tenant_id,site_id,owner_id,title) VALUES
    ('40000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000004','20000000-0000-4000-8000-000000000004','Action privée de l’organisation témoin') ON CONFLICT DO NOTHING`);
  await db.query('COMMIT');
  console.log('Local fixtures ready. Existing records preserved.');
} catch (error) { await db.query('ROLLBACK'); throw error; }
finally { await db.end(); }
