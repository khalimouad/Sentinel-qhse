import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
import {createInvitationStore} from '../src/platform/invitation-store.mjs';
import {deliverInvitation} from '../src/platform/invitation-delivery.mjs';
import {reconcileInvitation} from '../src/platform/invitation-reconciliation.mjs';

// Run only against the explicitly disposable local database described in the
// deployment guide; this test enables a local worker login for its duration.
test('worker delivers and reconciles against PostgreSQL with a simulated provider',async()=>{
 const adminUrl=process.env.INVITATION_TEST_ADMIN_URL;
 if(!adminUrl)throw new Error('INVITATION_TEST_ADMIN_URL must identify a disposable local database.');
 const parsed=new URL(adminUrl);if(!['127.0.0.1','localhost'].includes(parsed.hostname)||parsed.pathname!=='/sentinelle_bulk_verify2')throw new Error('Refusing to modify a non-disposable database.');
 const admin=new pg.Client({connectionString:adminUrl});await admin.connect();let store,changedRole=false;
 const actor='20000000-0000-4000-8000-000000000001',tenant='10000000-0000-4000-8000-000000000001',site='30000000-0000-4000-8000-000000000001';
 try{
  const role=await admin.query("SELECT rolcanlogin FROM pg_roles WHERE rolname='sentinelle_invitation_worker'");assert.equal(role.rows[0].rolcanlogin,false);
  await admin.query("ALTER ROLE sentinelle_invitation_worker LOGIN PASSWORD 'sentinelle-worker-test-only'");changedRole=true;
  await admin.query('INSERT INTO identity.platform_admins(user_id) VALUES($1) ON CONFLICT DO NOTHING',[actor]);
  const workerUrl=new URL(adminUrl);workerUrl.username='sentinelle_invitation_worker';workerUrl.password='sentinelle-worker-test-only';
  store=await createInvitationStore({databaseUrl:workerUrl.href,actorId:actor});
  async function create(){await admin.query('BEGIN');try{await admin.query("SELECT set_config('app.actor_id',$1,true)",[actor]);const x=await admin.query('SELECT identity.platform_invitation_create($1,$2,$3,$4) AS result',[tenant,{email:'recette@example.test',name:'Recette',role:'reader',allSites:false,siteIds:[site]},randomUUID(),'Recette isolée']);await admin.query('COMMIT');return x.rows[0].result.id;}catch(e){await admin.query('ROLLBACK');throw e;}}
  const issuer='https://example.supabase.co/auth/v1',subject=randomUUID(),first=await create();let sent=0;
  const outcome=await deliverInvitation({companyId:tenant,invitationId:first,attemptId:randomUUID(),issuer,store,provider:async email=>{sent++;assert.equal(email,'recette@example.test');return {status:'confirmed',subject};}});
  assert.equal(outcome.status,'linked');assert.equal(sent,1);
  const membership=await admin.query('SELECT role,all_sites FROM identity.memberships WHERE tenant_id=$1 AND user_id=$2',[tenant,outcome.userId]);assert.deepEqual(membership.rows[0],{role:'reader',all_sites:false});
  const grants=await admin.query('SELECT site_id FROM identity.site_grants WHERE tenant_id=$1 AND user_id=$2',[tenant,outcome.userId]);assert.deepEqual(grants.rows.map(row=>row.site_id),[site]);
  const second=await create(),secondSubject=randomUUID();
  const failed=await deliverInvitation({companyId:tenant,invitationId:second,attemptId:randomUUID(),issuer,store,provider:async()=>({status:'uncertain'})});assert.equal(failed.status,'uncertain');
  await assert.rejects(reconcileInvitation({companyId:tenant,invitationId:second,subject:secondSubject,issuer,reason:'Recette',store,lookup:async()=>false}),/could not be verified/);
  const repaired=await reconcileInvitation({companyId:tenant,invitationId:second,subject:secondSubject,issuer,reason:'Identité confirmée en recette',store,lookup:async()=>true});assert.equal(repaired.status,'linked');
  const saved=await store.lookup(tenant,second);assert.equal(saved.status,'identity_verified');assert.equal(saved.linkedUserId,repaired.userId);
  const repeated=await reconcileInvitation({companyId:tenant,invitationId:second,subject:secondSubject,issuer,reason:'Recette',store,lookup:async()=>{throw new Error('Unexpected lookup');}});assert.equal(repeated.userId,repaired.userId);
  await assert.rejects(store.reserve(tenant,second,randomUUID(),issuer),{code:'40001'});
  const third=await create(),attempt=randomUUID(),thirdSubject=randomUUID();await store.reserve(tenant,third,attempt,issuer);
  await assert.rejects(store.reconcile(tenant,third,attempt,thirdSubject,'Recette'),{code:'40001'});
  await admin.query("UPDATE identity.platform_invitations SET delivery_started_at=clock_timestamp()-interval '3 minutes' WHERE id=$1",[third]);
  await store.reconcile(tenant,third,attempt,thirdSubject,'Identité confirmée en recette');
  const thirdLinked=await store.link(tenant,third,issuer);assert.ok(thirdLinked.userId);

 }finally{if(store)await store.close();if(changedRole)await admin.query('ALTER ROLE sentinelle_invitation_worker NOLOGIN PASSWORD NULL').catch(()=>{});await admin.end();}
});
