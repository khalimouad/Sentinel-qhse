import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {startTestApi} from './support/api-server.mjs';
let server;before(async()=>{server=await startTestApi();});after(async()=>{if(server)await server.close();});
test('published version receipts are paginated and restricted to site managers',async()=>{
 const author=await server.token(),reviewer=await server.token('fatima-k'),approver=await server.token('clara-martin'),reader=await server.token('aicha-meite');
 const make=await server.request('documents',author,{method:'POST',body:JSON.stringify({code:`TEST-${randomUUID().slice(0,8).toUpperCase()}`,title:'Lecture documentaire',siteId:'30000000-0000-4000-8000-000000000001',content:'Texte de recette',reviewerId:'20000000-0000-4000-8000-000000000003',approverId:'20000000-0000-4000-8000-000000000005'})});
 assert.equal(make.status,201);let detail=await make.json();const id=detail.document.id,version=detail.versions[0].id,path=`documents/${id}/versions/${version}`;
 assert.equal((await server.request(`${path}/acknowledgements`,author)).status,409);
 for(const [command,actor] of [['submit',author],['verify',reviewer],['approve',approver]]) {const res=await server.request(`${path}/decisions`,actor,{method:'POST',body:JSON.stringify({revision:detail.versions[0].revision,command})});assert.equal(res.status,201);detail=await res.json();}
 for(let i=0;i<2;i++)assert.equal((await server.request(`${path}/acknowledgements`,reader,{method:'POST',body:'{}'})).status,201);
 assert.equal((await server.request(`${path}/acknowledgements`,reader)).status,403);
 assert.equal((await server.request(`${path}/acknowledgements`,author,{headers:{'X-Tenant-Id':'10000000-0000-4000-8000-000000000002'}})).status,403);
 const list=await server.request(`${path}/acknowledgements?limit=1&offset=0`,author);assert.equal(list.status,200);const data=await list.json();assert.equal(data.total,1);assert.equal(data.items[0].userName,'Aïcha Méité');
 const next=await server.request(`${path}/acknowledgements?limit=1&offset=1`,author);assert.deepEqual((await next.json()).items,[]);
});
