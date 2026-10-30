import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {startTestApi} from './support/api-server.mjs';
let server;before(async()=>{server=await startTestApi();});after(async()=>{if(server)await server.close();});
test('report pages preserve filters and reporter confidentiality',async()=>{
 const admin=await server.token(),reader=await server.token('aicha-meite'),prefix=`Pagination-${randomUUID()}`;
 const body=(n)=>JSON.stringify({title:`${prefix}-${n}`,description:'Recette de pagination',kind:'incident',severity:'low',siteId:'30000000-0000-4000-8000-000000000001',occurredAt:new Date(Date.now()-1000).toISOString(),currency:'EUR'});
 for(let n=0;n<26;n++){const response=await server.request('reports',admin,{method:'POST',body:body(n)});assert.equal(response.status,201);}
 assert.equal((await server.request('reports',reader,{method:'POST',body:body('reader')})).status,201);
 const params=new URLSearchParams({search:prefix,status:'reported',limit:'25',offset:'0'});
 const first=await (await server.request(`reports?${params}`,admin)).json();params.set('offset','25');const second=await (await server.request(`reports?${params}`,admin)).json();
 assert.equal(first.total,27);assert.equal(first.items.length,25);assert.equal(second.items.length,2);
 assert.equal(new Set([...first.items,...second.items].map(item=>item.id)).size,27);
 params.set('offset','0');const visible=await (await server.request(`reports?${params}`,reader)).json();assert.equal(visible.total,1);assert.equal(visible.items[0].reportedBy,'20000000-0000-4000-8000-000000000002');
 const exportAdmin=await server.request(`reports/export?search=${encodeURIComponent(prefix)}`,admin);assert.equal(exportAdmin.status,200);assert.equal((await exportAdmin.json()).total,27);
 const exportReader=await server.request(`reports/export?search=${encodeURIComponent(prefix)}`,reader);assert.equal(exportReader.status,200);const exported=await exportReader.json();assert.equal(exported.total,1);assert.equal(exported.items[0].reportedBy,'20000000-0000-4000-8000-000000000002');
 assert.equal((await server.request('reports/export?limit=1',admin)).status,400);
 assert.equal((await server.request('reports/export',admin,{headers:{'X-Tenant-Id':'10000000-0000-4000-8000-000000000002'}})).status,403);
});
