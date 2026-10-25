import test from 'node:test';
import assert from 'node:assert/strict';
import { decideDocument,validateParticipants } from '../src/documents/workflow.mjs';
const version={ authorId: 'author',reviewerId: 'reviewer',approverId: 'approver' };
test('document must pass separate drafting, verification and approval steps',()=>{
  let status=decideDocument({ ...version,status: 'draft' },'submit','author',true);
  assert.equal(status,'in_review');
  status=decideDocument({ ...version,status },'verify','reviewer',true);
  assert.equal(status,'pending_approval');
  assert.equal(decideDocument({ ...version,status },'approve','approver',true),'published');
});
test('author cannot approve their own version or bypass verification',()=>{
  assert.throws(()=>decideDocument({ ...version,status: 'pending_approval' },'approve','author',true),{ status: 403 });
  assert.throws(()=>decideDocument({ ...version,status: 'draft' },'approve','approver',true),{ status: 409 });
  assert.throws(()=>decideDocument({ ...version,status: 'in_review' },'verify','approver',true),{ status: 403 });
});
test('reader role cannot perform any document workflow transition',()=>{
  for (const [status,command,actor] of [['draft','submit','author'],['in_review','verify','reviewer'],['pending_approval','approve','approver']]) {
    assert.throws(()=>decideDocument({ ...version,status },command,actor,false),{ status: 403 });
  }
});
test('only the current designated reviewer can return a version',()=>{
  assert.equal(decideDocument({ ...version,status: 'in_review' },'reject','reviewer',true),'rejected');
  assert.equal(decideDocument({ ...version,status: 'pending_approval' },'reject','approver',true),'rejected');
  assert.throws(()=>decideDocument({ ...version,status: 'pending_approval' },'reject','reviewer',true),{ status: 403 });
});
test('finalized versions cannot be reopened through workflow commands',()=>{
  for (const status of ['published','rejected','archived']) for (const command of ['submit','verify','approve','reject']) {
    assert.throws(()=>decideDocument({ ...version,status },command,'author',true),{ status: 409 });
  }
});
test('participants must be distinct',()=>{
  validateParticipants('author','reviewer','approver');
  for (const people of [['a','a','b'],['a','b','a'],['a','b','b']]) assert.throws(()=>validateParticipants(...people),{ status: 400 });
});
