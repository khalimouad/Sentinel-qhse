import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {startTestApi} from './support/api-server.mjs';
let server;
before(async()=>{server=await startTestApi();});
after(async()=>{if(server)await server.close();});
test('export respects tenant, site restrictions and query validation',async()=>{
  const reader=await server.token('aicha-meite');
  assert.equal((await server.request('actions/export')).status,401);
  assert.equal((await server.request('actions/export',reader,{headers:{'X-Tenant-Id':'10000000-0000-4000-8000-000000000002'}})).status,403);
  assert.equal((await server.request('actions/export?limit=1',reader)).status,400);
  const response=await server.request('actions/export',reader);assert.equal(response.status,200);
  const body=await response.json();assert.ok(body.total>0);assert.equal(body.total,body.items.length);
  assert.ok(body.items.every(action=>action.siteId==='30000000-0000-4000-8000-000000000001'));
  const otherSite=await server.request('actions/export?siteId=30000000-0000-4000-8000-000000000002',reader);
  assert.equal(otherSite.status,200);assert.deepEqual((await otherSite.json()).items,[]);
  const filtered=await server.request('actions/export?status=closed&search=unmatched-unique-filter',reader);
  assert.equal(filtered.status,200);assert.equal((await filtered.json()).total,0);
});
