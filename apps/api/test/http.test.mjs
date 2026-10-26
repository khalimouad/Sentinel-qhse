import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {startTestApi} from './support/api-server.mjs';
const tenant='10000000-0000-4000-8000-000000000001';
const otherTenant='10000000-0000-4000-8000-000000000002';
const firstAction='40000000-0000-4000-8000-000000000001';
const outsideSiteAction='40000000-0000-4000-8000-000000000002';
let server;
before(async()=>{server=await startTestApi();});
after(async()=>{if(server)await server.close();});
const token=(...args)=>server.token(...args);
const request=(...args)=>server.request(...args);
test('missing, expired and wrong-audience tokens cannot authenticate',async () => {
  assert.equal((await request('me')).status,401);
  assert.equal((await request('me',await token('jean-dupont',{ expiration: Math.floor(Date.now()/1000)-60 }))).status,401);
  assert.equal((await request('me',await token('jean-dupont',{ audience: 'other-api' }))).status,401);
  assert.equal((await request('me','invalid-token')).status,401);
});
test('verified identity sees only its memberships, regardless of caller headers',async () => {
  const auth = await token();
  const response = await request('me',auth,{ headers: { 'X-User-Id': 'other-user','X-Role': 'admin' } });
  assert.equal(response.status,200);
  const me = await response.json(); assert.deepEqual(me.tenants.map(t=>t.id),[tenant]);
  assert.equal((await request('actions',auth,{ headers: { 'X-Tenant-Id': otherTenant } })).status,403);
});
test('site-limited readers cannot see other site history or create actions',async () => {
  const auth = await token('aicha-meite');
  const response = await request('actions',auth); assert.equal(response.status,200);
  const body = await response.json(); assert.ok(body.items.length>0);
  assert.ok(body.items.every(a=>a.siteId==='30000000-0000-4000-8000-000000000001'));
  assert.equal((await request(`actions/${outsideSiteAction}/history`,auth)).status,404);
  assert.equal((await request('actions',auth,{ method: 'POST',body: JSON.stringify({ title: 'Unauthorized',siteId: '30000000-0000-4000-8000-000000000001',ownerId: '20000000-0000-4000-8000-000000000002',priority: 'normal' }) })).status,403);
});
test('validation rejects unknown body fields and optimistic concurrency rejects stale versions',async () => {
  const auth = await token();
  assert.equal((await request(`actions/${firstAction}`,auth,{ method: 'PATCH',body: JSON.stringify({ version: 1,status: 'closed',tenantId: otherTenant }) })).status,400);
  const list = await (await request('actions',auth)).json();
  const action = list.items.find(a=>a.id===firstAction); assert.ok(action);
  assert.equal((await request(`actions/${firstAction}`,auth,{ method: 'PATCH',body: JSON.stringify({ version: action.version+10000,status: 'closed' }) })).status,409);
});
test('documents endpoints enforce participants and expose only authorized reviewers',async () => {
  const auth=await token();
  const documents=await request('documents',auth);
  assert.equal(documents.status,200); assert.ok(Array.isArray((await documents.json()).items));
  const context=await (await request('context',auth)).json();
  const reviewers=context.documentReviewers['30000000-0000-4000-8000-000000000001'];
  assert.ok(reviewers.some(user=>user.id==='20000000-0000-4000-8000-000000000005'));
  assert.ok(!reviewers.some(user=>user.id==='20000000-0000-4000-8000-000000000002'));
  const response=await request('documents',auth,{ method:'POST',body:JSON.stringify({
    code:'TEST-INVALID-REVIEW',title:'Invalid self-review',siteId:'30000000-0000-4000-8000-000000000001',
    content:'Not inserted',reviewerId:'20000000-0000-4000-8000-000000000001',approverId:'20000000-0000-4000-8000-000000000005',
  }) });
  assert.equal(response.status,400);
});
test('staff declaration reaches independently verified closure through the shared action plan',async()=>{
  const managerAuth=await token(),readerAuth=await token('aicha-meite'),verifierAuth=await token('fatima-k');
  const declared=await request('reports',readerAuth,{method:'POST',body:JSON.stringify({title:'HTTP lifecycle test',description:'Écart de test contrôlé',kind:'nonconformity',severity:'high',siteId:'30000000-0000-4000-8000-000000000001',occurredAt:new Date(Date.now()-60000).toISOString(),currency:'EUR'})});
  assert.equal(declared.status,201);let current=await declared.json();const id=current.report.id;assert.equal(current.report.reportedBy,'20000000-0000-4000-8000-000000000002');
  const analysis={revision:current.report.revision,ownerId:'20000000-0000-4000-8000-000000000001',verifierId:'20000000-0000-4000-8000-000000000003',correction:'Produit isolé',rootCause:'Procédure incomplète',fiveWhys:['Contrôle absent','Instruction manquante'],costAmount:'12.50',currency:'EUR'};
  assert.equal((await request(`reports/${id}/analysis`,readerAuth,{method:'PATCH',body:JSON.stringify(analysis)})).status,403);
  const analyzed=await request(`reports/${id}/analysis`,managerAuth,{method:'PATCH',body:JSON.stringify(analysis)});assert.equal(analyzed.status,200);current=await analyzed.json();
  async function advance(command,auth=managerAuth,note){const response=await request(`reports/${id}/decisions`,auth,{method:'POST',body:JSON.stringify({revision:current.report.revision,command,...(note?{note}:{})})});assert.equal(response.status,201);current=await response.json();}
  await advance('start_analysis');await advance('plan_actions');
  const added=await request(`reports/${id}/actions`,managerAuth,{method:'POST',body:JSON.stringify({revision:current.report.revision,title:'Compléter la procédure de contrôle',ownerId:analysis.ownerId,priority:'high'})});assert.equal(added.status,201);current=await added.json();
  const linked=current.actions[0];assert.equal(linked.reportId,id);
  assert.equal((await request(`reports/${id}/decisions`,managerAuth,{method:'POST',body:JSON.stringify({revision:current.report.revision,command:'request_review'})})).status,409);
  const closedAction=await request(`actions/${linked.id}`,managerAuth,{method:'PATCH',body:JSON.stringify({version:linked.version,status:'closed'})});assert.equal(closedAction.status,200);const completed=await closedAction.json();
  current=await (await request(`reports/${id}`,managerAuth)).json();await advance('request_review');
  assert.equal((await request(`reports/${id}/decisions`,managerAuth,{method:'POST',body:JSON.stringify({revision:current.report.revision,command:'close',note:'Auto-approbation interdite'})})).status,403);
  await advance('close',verifierAuth,'Vérification indépendante du contrôle concluante.');assert.equal(current.report.status,'closed');assert.equal(current.report.reviewedBy,'20000000-0000-4000-8000-000000000003');assert.ok(current.report.closedAt);
  assert.equal((await request(`actions/${linked.id}`,managerAuth,{method:'PATCH',body:JSON.stringify({version:completed.version,status:'open'})})).status,200);
  current=await (await request(`reports/${id}`,readerAuth)).json();assert.equal(current.report.status,'action_plan');assert.equal(current.report.effectiveness,'not_evaluated');assert.equal(current.report.closedAt,null);
  const privateReport=await request('reports',managerAuth,{method:'POST',body:JSON.stringify({title:'Management-only HTTP fixture',description:'Not reported by reader',kind:'incident',severity:'low',siteId:'30000000-0000-4000-8000-000000000001',occurredAt:new Date(Date.now()-60000).toISOString(),currency:'EUR'})});assert.equal(privateReport.status,201);
  const privateId=(await privateReport.json()).report.id;assert.equal((await request(`reports/${privateId}`,readerAuth)).status,404);
});
