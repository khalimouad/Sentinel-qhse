import test from 'node:test';
import assert from 'node:assert/strict';
import { createInvitationProvider } from '../src/platform/supabase-invitation.mjs';
const config={url:'https://example.supabase.co',serviceKey:'example-service-key-not-real',redirectUrl:'https://sentinel.example/auth/reset'};
test('provider adapter validates destination and accepts only a confirmed UUID',async()=>{
 let calls=0;
 const provider=createInvitationProvider({...config,fetchImpl:async(url,options)=>{calls++;assert.equal(url.origin+url.pathname,'https://example.supabase.co/auth/v1/invite');assert.equal(url.searchParams.get('redirect_to'),config.redirectUrl);assert.equal(options.redirect,'error');return new Response(JSON.stringify({id:'12345678-1234-4234-8234-123456789012'}),{status:200});}});
 assert.deepEqual(await provider('person@example.test'),{status:'confirmed',subject:'12345678-1234-4234-8234-123456789012'});assert.equal(calls,1);
 assert.throws(()=>createInvitationProvider({...config,url:'https://evil.example'}),/project URL/);
 assert.throws(()=>createInvitationProvider({...config,redirectUrl:'https://sentinel.example/other'}),/redirect/);
});
test('network, provider and malformed responses remain uncertain without retries',async()=>{
 for(const fetchImpl of [async()=>{throw new Error('timeout');},async()=>new Response('{}',{status:500}),async()=>new Response('{"id":"invalid"}',{status:200})]){
  let calls=0;const provider=createInvitationProvider({...config,fetchImpl:async(...args)=>{calls++;return fetchImpl(...args);}});
  assert.deepEqual(await provider('person@example.test'),{status:'uncertain'});assert.equal(calls,1);
 }
});
