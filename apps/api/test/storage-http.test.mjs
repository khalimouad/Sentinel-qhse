import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {startTestApi} from './support/api-server.mjs';
let api;
before(async()=>{if(!process.env.S3_BUCKET||!process.env.S3_ENDPOINT)throw new Error('Initialize local MinIO and enable S3 settings before running storage tests.');api=await startTestApi();});
after(async()=>{if(api)await api.close();});
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
async function draft(auth){
  const response=await api.request('documents',auth,{method:'POST',body:JSON.stringify({code:`STORAGE-${randomUUID()}`,title:'Document et preuves',siteId:'30000000-0000-4000-8000-000000000001',content:'Procédure de test',reviewerId:'20000000-0000-4000-8000-000000000003',approverId:'20000000-0000-4000-8000-000000000005'})});
  assert.equal(response.status,201);return response.json();
}
async function ticket(auth,parent,bytes,change={}){
  const response=await api.request('attachments/uploads',auth,{method:'POST',body:JSON.stringify({parentType:'document_version',parentId:parent.versions[0].id,filename:'preuve.txt',mimeType:'text/plain',size:bytes.length,sha256:sha(bytes),...change})});assert.equal(response.status,201);return response.json();
}
async function send(upload,bytes,filename='preuve.txt'){
  const form=new FormData();for(const [key,value] of Object.entries(upload.fields))form.append(key,value);form.append('file',new Blob([bytes]),filename);
  return fetch(upload.url,{method:'POST',body:form});
}
test('private staged upload verifies content, survives upload replay and freezes with publication',async()=>{
  const author=await api.token(),reader=await api.token('aicha-meite');let document=await draft(author);const bytes=Buffer.from('Preuve de procédure validée.');
  const upload=await ticket(author,document,bytes);assert.ok((await send(upload.upload,bytes)).ok);
  let response=await api.request(`documents/${document.document.id}`,author);document=await response.json();
  response=await api.request(`documents/${document.document.id}/versions/${document.versions[0].id}/decisions`,author,{method:'POST',body:JSON.stringify({revision:document.versions[0].revision,command:'submit'})});assert.equal(response.status,409);
  response=await api.request(`attachments/${upload.attachment.id.toUpperCase()}/confirm`,author,{method:'POST',body:'{}'});assert.equal(response.status,201);const ready=await response.json();assert.equal(ready.status,'ready');assert.equal(ready.sha256,sha(bytes));
  const events=await (await api.request(`attachments/${ready.id}/history`,author)).json();assert.ok(events.length>=2);assert.ok(events.every(event=>event.actorName));assert.ok(events.every(event=>!Object.hasOwn(event.after,'object_key')&&!Object.hasOwn(event.after,'staging_key')));
  response=await api.request(`attachments/${ready.id}/download`,reader);assert.equal(response.status,404);
  const other=await api.token('other-user');assert.equal((await api.request(`attachments/${ready.id}/download`,other,{headers:{'X-Tenant-Id':'10000000-0000-4000-8000-000000000002'}})).status,404);
  // The original staging policy may still be valid: it must never target the final object.
  assert.ok((await send(upload.upload,Buffer.alloc(bytes.length,0x78))).ok);
  response=await api.request(`attachments/${ready.id}/download`,author);assert.equal(response.status,200);const link=await response.json();
  const downloaded=await fetch(link.url);assert.equal(downloaded.status,200);assert.match(downloaded.headers.get('content-disposition'),/^attachment;/);assert.equal(Buffer.from(await downloaded.arrayBuffer()).toString(),bytes.toString());
  const unsigned=new URL(link.url);unsigned.search='';assert.equal((await fetch(unsigned)).status,403);
  document=await (await api.request(`documents/${document.document.id}`,author)).json();const manifest=document.versions[0].attachmentsSha256;
  for(const [command,subject] of [['submit','jean-dupont'],['verify','fatima-k'],['approve','clara-martin']]){
    response=await api.request(`documents/${document.document.id}/versions/${document.versions[0].id}/decisions`,await api.token(subject),{method:'POST',body:JSON.stringify({revision:document.versions[0].revision,command})});assert.equal(response.status,201);document=await response.json();
  }
  assert.equal(document.versions[0].attachmentsSha256,manifest);
  assert.equal((await api.request(`attachments/${ready.id}/remove`,author,{method:'POST',body:JSON.stringify({revision:ready.revision})})).status,403);
  assert.equal((await api.request(`attachments/${ready.id}/download`,reader)).status,200);
});
test('mismatched bytes and false advertised types never become downloadable',async()=>{
  const auth=await api.token(),document=await draft(auth),bytes=Buffer.from('Preuve valide');
  for(const change of [{sha256:'0'.repeat(64)},{filename:'faux.pdf',mimeType:'application/pdf'}]){
    const upload=await ticket(auth,document,bytes,change);assert.ok((await send(upload.upload,bytes)).ok);
    assert.equal((await api.request(`attachments/${upload.attachment.id}/confirm`,auth,{method:'POST',body:'{}'})).status,422);
    assert.equal((await api.request(`attachments/${upload.attachment.id}/download`,auth)).status,409);
  }
});
test('signed policy enforces exact size and cancelling an incomplete upload unblocks the version',async()=>{
  const auth=await api.token();let document=await draft(auth);const bytes=Buffer.from('preuve'),upload=await ticket(auth,document,bytes);
  assert.equal((await send(upload.upload,Buffer.from('preuve trop longue'))).ok,false);
  const removed=await api.request(`attachments/${upload.attachment.id}/remove`,auth,{method:'POST',body:JSON.stringify({revision:upload.attachment.revision})});assert.equal(removed.status,201);
  document=await (await api.request(`documents/${document.document.id}`,auth)).json();
  assert.equal((await api.request(`documents/${document.document.id}/versions/${document.versions[0].id}/decisions`,auth,{method:'POST',body:JSON.stringify({revision:document.versions[0].revision,command:'submit'})})).status,201);
});
test('staff can upload evidence to their own report',async()=>{
  const auth=await api.token('aicha-meite');
  const created=await api.request('reports',auth,{method:'POST',body:JSON.stringify({title:'Photo de terrain',description:'Constat de test',kind:'incident',severity:'medium',occurredAt:new Date(Date.now()-1000).toISOString(),siteId:'30000000-0000-4000-8000-000000000001',currency:'XOF'})});assert.equal(created.status,201);const report=(await created.json()).report;
  const bytes=Buffer.from('Constat factuel');const requested=await api.request('attachments/uploads',auth,{method:'POST',body:JSON.stringify({parentType:'report',parentId:report.id,filename:'constat.txt',mimeType:'text/plain',size:bytes.length,sha256:sha(bytes)})});assert.equal(requested.status,201);const upload=await requested.json();assert.ok((await send(upload.upload,bytes)).ok);
  assert.equal((await api.request(`attachments/${upload.attachment.id}/confirm`,auth,{method:'POST',body:'{}'})).status,201);
  const refreshed=(await (await api.request(`reports/${report.id}`,auth)).json()).report;assert.notEqual(refreshed.attachmentsSha256,sha('[]'));
});
