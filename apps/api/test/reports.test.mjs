import test from 'node:test';
import assert from 'node:assert/strict';
import { decideReport,validateCost } from '../src/reports/workflow.mjs';
const report={ status:'reported',ownerId:'owner',verifierId:'verifier',rootCause:'Cause identifiée',correction:'Mesure immédiate réalisée' };
const closed=[{ status:'closed' }];
test('report follows analysis, corrective actions and independent effectiveness review',()=>{
  let status=decideReport(report,'start_analysis','owner',true,[]); assert.equal(status,'in_analysis');
  status=decideReport({ ...report,status },'plan_actions','owner',true,[]); assert.equal(status,'action_plan');
  status=decideReport({ ...report,status },'request_review','owner',true,closed); assert.equal(status,'effectiveness_review');
  assert.equal(decideReport({ ...report,status },'close','verifier',true,closed,'Vérification documentée'),'closed');
});
test('reader cannot process a report and owner cannot validate their own effectiveness',()=>{
  assert.throws(()=>decideReport(report,'start_analysis','owner',false,[]),{ status:403 });
  assert.throws(()=>decideReport({ ...report,status:'effectiveness_review' },'close','owner',true,closed,'Preuve'),{ status:403 });
  assert.throws(()=>decideReport({ ...report,status:'effectiveness_review' },'return_for_action','owner',true,closed,'Échec'),{ status:403 });
});
test('review requires at least one corrective action and all linked actions closed',()=>{
  for(const actions of [[],[{ status:'open' }],[{ status:'closed' },{ status:'open' }]]) {
    assert.throws(()=>decideReport({ ...report,status:'action_plan' },'request_review','owner',true,actions),{ status:409 });
    assert.throws(()=>decideReport({ ...report,status:'effectiveness_review' },'close','verifier',true,actions,'Preuve'),{ status:409 });
  }
});
test('root cause, correction and separate named responsibilities are mandatory',()=>{
  for(const overrides of [{ rootCause:' ' },{ correction:'' },{ ownerId:null },{ verifierId:'owner' }]) {
    assert.throws(()=>decideReport({ ...report,...overrides,status:'in_analysis' },'plan_actions','owner',true,[]),{ status:400 });
  }
});
test('effectiveness decisions and reopening require reasons; skipped transitions fail',()=>{
  for(const [status,command,actor] of [['effectiveness_review','close','verifier'],['effectiveness_review','return_for_action','verifier'],['closed','reopen','owner']]) {
    assert.throws(()=>decideReport({ ...report,status },command,actor,true,closed,' '),{ status:400 });
  }
  assert.equal(decideReport({ ...report,status:'effectiveness_review' },'return_for_action','verifier',true,closed,'Résultat insuffisant'),'action_plan');
  assert.equal(decideReport({ ...report,status:'closed' },'reopen','owner',true,closed,'Récidive'),'action_plan');
  assert.throws(()=>decideReport(report,'close','verifier',true,closed,'Preuve'),{ status:409 });
});
test('cost values retain decimal precision and respect CFA whole units',()=>{
  for(const [amount,currency] of [['12345','XOF'],['12.00','XAF'],['12.25','EUR'],['0.01','MAD'],['999999999999.99','USD']]) validateCost(amount,currency);
  for(const [amount,currency] of [['12.25','XOF'],['0.01','XAF'],['1.123','EUR'],['-1','MAD'],['1e3','EUR'],['1000000000000','USD'],['10','ABC']]) assert.throws(()=>validateCost(amount,currency),{ status:400 });
});
