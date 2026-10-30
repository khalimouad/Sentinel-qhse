import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {startTestApi} from './support/api-server.mjs';
let server;
before(async()=>{server=await startTestApi();});
after(async()=>{if(server)await server.close();});
for(const domain of ['risks','obligations'])test(`${domain} export enforces access and filtering`,async()=>{
 const admin=await server.token(),reader=await server.token('aicha-meite');
 assert.equal((await server.request(`${domain}/export`)).status,401);
 assert.equal((await server.request(`${domain}/export`,reader)).status,403);
 assert.equal((await server.request(`${domain}/export?limit=1`,admin)).status,400);
 assert.equal((await server.request(`${domain}/export`,admin,{headers:{'X-Tenant-Id':'10000000-0000-4000-8000-000000000002'}})).status,403);
 const params=domain==='obligations'?'lifecycle=active&search=unique-no-match':'status=active&search=unique-no-match';
 const result=await server.request(`${domain}/export?${params}`,admin);assert.equal(result.status,200);assert.equal((await result.json()).total,0);
 const exported=await server.request(`${domain}/export`,admin);assert.equal(exported.status,200);
 const body=await exported.json();assert.equal(body.total,body.items.length);
});
