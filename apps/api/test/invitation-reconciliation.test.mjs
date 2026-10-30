import test from 'node:test';
import assert from 'node:assert/strict';
import {reconcileInvitation} from '../src/platform/invitation-reconciliation.mjs';
import {createInvitationLookup} from '../src/platform/supabase-invitation.mjs';
const subject='12345678-1234-4234-8234-123456789012';
const base={companyId:'company',invitationId:'invitation',subject,issuer:'https://example.supabase.co/auth/v1',reason:'Contrôle fournisseur'};
function scenario(status='uncertain'){
 const events=[];const store={lookup:async()=>({status,email:'person@example.test',attemptId:'attempt',providerIssuer:base.issuer}),reconcile:async(...args)=>{events.push(['reconcile',...args]);},link:async()=>{events.push('link');return {userId:'user'};}};
 return {events,store};
}
test('uncertain invitations require matching verified provider identity before linking',async()=>{
 const f=scenario();assert.deepEqual(await reconcileInvitation({...base,store:f.store,lookup:async(id,email)=>id===subject&&email==='person@example.test'}),{status:'linked',userId:'user'});assert.equal(f.events[0][0],'reconcile');assert.equal(f.events[1],'link');
 const g=scenario();await assert.rejects(reconcileInvitation({...base,store:g.store,lookup:async()=>false}),/could not be verified/);assert.deepEqual(g.events,[]);
});
test('cancelled invitations are never linked and confirmed invitations are not resent',async()=>{
 const cancelled=scenario('cancelled');await assert.rejects(reconcileInvitation({...base,store:cancelled.store,lookup:async()=>true}),/current state/);assert.deepEqual(cancelled.events,[]);
 const sent=scenario('sent');assert.deepEqual(await reconcileInvitation({...base,store:sent.store,lookup:async()=>{throw new Error('not expected');}}),{status:'linked',userId:'user'});assert.deepEqual(sent.events,['link']);
});
test('provider lookup requires confirmed email and exact identity',async()=>{
 const config={url:'https://example.supabase.co',serviceKey:'test-service-key-not-a-secret'};
 for(const data of [{id:subject,email:'person@example.test'},{id:subject,email:'other@example.test',email_confirmed_at:'2026-01-01T00:00:00Z'},{id:subject,email:'person@example.test',email_confirmed_at:'bad'}]){
  assert.equal(await createInvitationLookup({...config,fetchImpl:async()=>Response.json(data)})(subject,'person@example.test'),false);
 }
 assert.equal(await createInvitationLookup({...config,fetchImpl:async()=>Response.json({id:subject,email:'PERSON@example.test',email_confirmed_at:'2026-01-01T00:00:00Z'})})(subject,'person@example.test'),true);
});


test('reconciliation refuses a different provider project',async()=>{const f=scenario();await assert.rejects(reconcileInvitation({...base,issuer:'https://other.supabase.co/auth/v1',store:f.store,lookup:async()=>true}),/does not match/);assert.deepEqual(f.events,[]);});
