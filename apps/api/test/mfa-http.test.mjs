import test from 'node:test';
import assert from 'node:assert/strict';
import {startTestApi} from './support/api-server.mjs';

test('MFA enforcement accepts only verified tokens with aal2',async()=>{
 const server=await startTestApi({requireMfa:true});
 try{
  const noAssurance=await server.token();
  const firstFactor=await server.token('jean-dupont',{claims:{aal:'aal1'}});
  const secondFactor=await server.token('jean-dupont',{claims:{aal:'aal2'}});
  assert.equal((await server.request('me',noAssurance)).status,401);
  assert.equal((await server.request('me',firstFactor)).status,401);
  assert.equal((await server.request('me',secondFactor)).status,200);
  const wrongAudience=await server.token('jean-dupont',{audience:'other',claims:{aal:'aal2'}});
  assert.equal((await server.request('me',wrongAudience)).status,401);
 }finally{await server.close();}
});
