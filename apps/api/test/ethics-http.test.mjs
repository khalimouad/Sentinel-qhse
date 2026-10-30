import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {startTestApi} from './support/api-server.mjs';
let server;before(async()=>{server=await startTestApi();});after(async()=>{if(server)await server.close();});
test('third parties, evaluations, gifts and conflicts can be recorded and followed',async()=>{
 const admin=await server.token(),reader=await server.token('aicha-meite'),prefix=randomUUID();const base={siteId:'30000000-0000-4000-8000-000000000001',ownerId:'20000000-0000-4000-8000-000000000001',description:'Éléments de revue',country:'CI'};
 const create=async payload=>{const response=await server.request('ethics',admin,{method:'POST',body:JSON.stringify({...base,...payload})});assert.equal(response.status,201);return response.json();};
 const parties=[];for(let i=0;i<10;i++)parties.push(await create({kind:'third_party',title:`Tiers ${prefix} ${i}`}));
 const assessment=await create({kind:'assessment',title:'Revue annuelle',partyId:parties[0].id,risk:'high',reviewOn:'2030-01-01'});assert.equal(assessment.partyId,parties[0].id);
 const gift=await create({kind:'gift',title:'Invitation commerciale',amount:'125.00',currency:'EUR'});assert.equal(gift.amount,'125.00');
 const conflict=await create({kind:'conflict',title:'Lien personnel déclaré'});assert.equal(conflict.status,'open');
 const updated=await server.request(`ethics/${conflict.id}`,admin,{method:'PATCH',body:JSON.stringify({revision:conflict.revision,status:'reviewed',risk:'medium',description:'Mesure décidée'})});assert.equal(updated.status,200);assert.equal((await updated.json()).revision,2);
 assert.equal((await server.request(`ethics/${conflict.id}`,admin,{method:'PATCH',body:JSON.stringify({revision:1,status:'closed',risk:'low',description:'ancien'})})).status,409);
 const history=await (await server.request(`ethics/${conflict.id}/history`,admin)).json();assert.equal(history.length,2);
 assert.equal((await server.request('ethics?kind=third_party',reader)).status,403);assert.equal((await server.request('ethics?kind=third_party',admin,{headers:{'X-Tenant-Id':'10000000-0000-4000-8000-000000000002'}})).status,403);
 assert.equal((await server.request('ethics',admin,{method:'POST',body:JSON.stringify({...base,kind:'assessment',title:'Sans tiers'})})).status,400);
 const list=await (await server.request(`ethics?kind=third_party&search=${prefix}`,admin)).json();assert.equal(list.total,10);
});
