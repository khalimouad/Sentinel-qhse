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
 const targets=`${path}/distribution`,readerId='20000000-0000-4000-8000-000000000002',otherId='20000000-0000-4000-8000-000000000004';
 const candidates=`${path}/distribution-candidates`;assert.equal((await server.request(candidates,reader)).status,403);
 const initialCandidates=await (await server.request(`${candidates}?search=A%C3%AFcha&limit=1`,author)).json();assert.equal(initialCandidates.total,1);assert.equal(initialCandidates.items[0].id,readerId);
 assert.equal((await server.request(candidates,author,{headers:{'X-Tenant-Id':'10000000-0000-4000-8000-000000000002'}})).status,403);

 assert.equal((await server.request(targets,reader,{method:'POST',body:JSON.stringify({recipientIds:[readerId]})})).status,403);
 assert.equal((await server.request(targets,author,{method:'POST',body:JSON.stringify({recipientIds:[readerId,otherId]})})).status,400);
 assert.equal((await (await server.request(targets,author)).json()).total,0);
 for(let i=0;i<2;i++)assert.equal((await server.request(targets,author,{method:'POST',body:JSON.stringify({recipientIds:[readerId]})})).status,201);
 let distribution=await (await server.request(targets,author)).json();assert.equal(distribution.total,1);assert.equal(distribution.acknowledged,0);
 assert.equal((await (await server.request(`${candidates}?search=A%C3%AFcha`,author)).json()).total,0);
 const reminderPath=`${targets}/${readerId}/reminders`,reminderKey=randomUUID();
 assert.equal((await server.request(reminderPath,reader,{method:'POST',body:JSON.stringify({idempotencyKey:reminderKey})})).status,403);
 const firstReminder=await server.request(reminderPath,author,{method:'POST',body:JSON.stringify({idempotencyKey:reminderKey})});assert.equal(firstReminder.status,201);const reminderId=(await firstReminder.json()).id;
 distribution=await (await server.request(targets,author)).json();assert.ok(distribution.items[0].lastReminderAt);
 assert.equal((await server.request(reminderPath,reader)).status,403);const log=await (await server.request(`${reminderPath}?limit=1`,author)).json();assert.equal(log.total,1);assert.equal(log.items[0].id,reminderId);assert.equal(log.items[0].actorName,'Jean Dupont');

 const retryReminder=await server.request(reminderPath,author,{method:'POST',body:JSON.stringify({idempotencyKey:reminderKey})});assert.equal(retryReminder.status,201);assert.equal((await retryReminder.json()).id,reminderId);
 assert.equal((await server.request(reminderPath,author,{method:'POST',body:JSON.stringify({idempotencyKey:randomUUID()})})).status,409);

 const inboxResponse=await server.request('notifications?filter=unread&limit=100',reader);assert.equal(inboxResponse.status,200);const inbox=await inboxResponse.json();const reminders=inbox.items.filter(n=>n.kind==='document_reminder'&&n.documentId===id);assert.equal(reminders.length,1);assert.equal(reminders[0].id,reminderId);assert.equal((await server.request(`notifications/${reminderId}/read`,reader,{method:'POST',body:JSON.stringify({status:'read'})})).status,201);assert.equal((await server.request(`notifications/${reminderId}/read`,reader,{method:'POST',body:JSON.stringify({status:'read'})})).status,201);const notices=inbox.items.filter(n=>n.kind==='document_assigned'&&n.documentId===id);assert.equal(notices.length,1);assert.equal(notices[0].documentTitle,'Lecture documentaire');
 const authorInbox=await (await server.request('notifications?filter=all&limit=100',author)).json();assert.ok(!authorInbox.items.some(n=>n.id===notices[0].id));
 assert.equal((await server.request(`notifications/${notices[0].id}/read`,author,{method:'POST',body:JSON.stringify({status:'read'})})).status,404);
 assert.equal((await server.request(`notifications/${notices[0].id}/read`,reader,{method:'POST',body:JSON.stringify({status:'read'})})).status,201);
 assert.equal((await server.request(`notifications/${notices[0].id}/read`,reader,{method:'POST',body:JSON.stringify({status:'read'})})).status,201);

 assert.equal((await server.request(targets,reader)).status,403);
 for(let i=0;i<2;i++)assert.equal((await server.request(`${path}/acknowledgements`,reader,{method:'POST',body:'{}'})).status,201);
 distribution=await (await server.request(targets,author)).json();assert.equal(distribution.acknowledged,1);assert.ok(distribution.items[0].acknowledgedAt);
 assert.equal((await server.request(reminderPath,author,{method:'POST',body:JSON.stringify({idempotencyKey:randomUUID()})})).status,409);
 const readInbox=await (await server.request('notifications?filter=all&limit=100',reader)).json();assert.ok(!readInbox.items.some(n=>n.id===reminderId));
 assert.equal((await server.request(`notifications/${reminderId}/read`,reader,{method:'POST',body:JSON.stringify({status:'read'})})).status,404);
 assert.equal((await server.request(`${path}/acknowledgements`,reader)).status,403);
 assert.equal((await server.request(`${path}/acknowledgements`,author,{headers:{'X-Tenant-Id':'10000000-0000-4000-8000-000000000002'}})).status,403);
 const list=await server.request(`${path}/acknowledgements?limit=1&offset=0`,author);assert.equal(list.status,200);const data=await list.json();assert.equal(data.total,1);assert.equal(data.items[0].userName,'Aïcha Méité');
 const next=await server.request(`${path}/acknowledgements?limit=1&offset=1`,author);assert.deepEqual((await next.json()).items,[]);
 const cancelPath=`${targets}/${readerId}/cancel`,cancel={reason:'Changement de fonction',idempotencyKey:randomUUID()};
 assert.equal((await server.request(cancelPath,reader,{method:'POST',body:JSON.stringify(cancel)})).status,403);
 for(let n=0;n<2;n++)assert.equal((await server.request(cancelPath,author,{method:'POST',body:JSON.stringify(cancel)})).status,201);
 assert.equal((await server.request(cancelPath,author,{method:'POST',body:JSON.stringify({...cancel,reason:'Autre motif'})})).status,409);
 distribution=await (await server.request(targets,author)).json();assert.equal(distribution.total,1);assert.equal(distribution.active,0);assert.equal(distribution.acknowledged,0);assert.equal(distribution.items[0].cancellationReason,cancel.reason);assert.ok(distribution.items[0].acknowledgedAt);
 assert.equal((await server.request(targets,author,{method:'POST',body:JSON.stringify({recipientIds:[readerId]})})).status,409);
 const afterCancel=await (await server.request('notifications?filter=all&limit=100',reader)).json();assert.ok(!afterCancel.items.some(n=>n.id===notices[0].id));
 assert.equal((await server.request(`notifications/${notices[0].id}/read`,reader,{method:'POST',body:JSON.stringify({status:'read'})})).status,404);

 const replacement=await server.request(`documents/${id}/versions`,author,{method:'POST',body:JSON.stringify({expectedLastVersion:1,content:'Nouvelle version',reviewerId:'20000000-0000-4000-8000-000000000003',approverId:'20000000-0000-4000-8000-000000000005'})});assert.equal(replacement.status,201);detail=await replacement.json();const newPath=`documents/${id}/versions/${detail.versions[0].id}`;
 for(const [command,actor] of [['submit',author],['verify',reviewer],['approve',approver]]){const response=await server.request(`${newPath}/decisions`,actor,{method:'POST',body:JSON.stringify({revision:detail.versions[0].revision,command})});assert.equal(response.status,201);detail=await response.json();}
 const afterReplacement=await (await server.request('notifications?filter=all&limit=100',reader)).json();assert.ok(!afterReplacement.items.some(n=>n.id===notices[0].id));
 assert.equal((await server.request(`notifications/${notices[0].id}/read`,reader,{method:'POST',body:JSON.stringify({status:'read'})})).status,404);

});
