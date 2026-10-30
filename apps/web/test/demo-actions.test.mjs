import test from 'node:test';
import assert from 'node:assert/strict';
import { demoApi } from '../lib/demo.mjs';

globalThis.localStorage={getItem:()=>null,setItem:()=>{},removeItem:()=>{}};
test('demo action lists filter before pagination',async()=>{
  const context=await demoApi('context');
  const tenant=context.tenant.id;
  const created=await demoApi('actions',tenant,{method:'POST',body:JSON.stringify({title:'Contrôle paginé',siteId:context.sites[0].id,ownerId:context.actor.id,priority:'normal'})});
  await demoApi(`actions/${created.id}`,tenant,{method:'PATCH',body:JSON.stringify({version:created.version,status:'closed'})});
  const exported=await demoApi('actions/export?status=closed&search=Contr%C3%B4le',tenant);
  assert.equal(exported.total,1);assert.equal(exported.items[0].id,created.id);
  const closed=await demoApi('actions?status=closed&search=Contr%C3%B4le&limit=1&offset=0',tenant);
  assert.equal(closed.total,1);assert.equal(closed.items[0].id,created.id);
  const open=await demoApi('actions?status=open&search=Contr%C3%B4le',tenant);
  assert.equal(open.total,0);
  const next=await demoApi('actions?status=closed&limit=1&offset=1',tenant);
  assert.equal(next.total,1);assert.equal(next.items.length,0);
});

test('demo register exports use active filters',async()=>{
 const context=await demoApi('context');
 const risks=await demoApi('risks/export?category=safety',context.tenant.id);
 assert.ok(risks.items.length>0);assert.ok(risks.items.every(item=>item.category==='safety'));
 const obligations=await demoApi('obligations/export?lifecycle=active&search=FR',context.tenant.id);
 assert.ok(obligations.items.length>0);assert.ok(obligations.items.every(item=>item.jurisdiction==='FR'));
});
