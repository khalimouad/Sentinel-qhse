import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import {startTestApi} from './support/api-server.mjs';

test('invitation delivery requires platform admin and disabled service fails closed',async()=>{
 if(!process.env.DATABASE_ADMIN_URL||!process.env.DATABASE_URL)throw new Error('A disposable seeded database is required.');
 const owner=new pg.Client({connectionString:process.env.DATABASE_ADMIN_URL});await owner.connect();
 const actor='20000000-0000-4000-8000-000000000001';let created=false,server;
 const previous=process.env.INVITATION_DELIVERY_ENABLED;process.env.INVITATION_DELIVERY_ENABLED='false';
 try{
  const inserted=await owner.query('INSERT INTO identity.platform_admins(user_id) VALUES($1) ON CONFLICT DO NOTHING',[actor]);created=inserted.rowCount===1;
  server=await startTestApi();
  const path='platform/companies/10000000-0000-4000-8000-000000000001/invitations/40000000-0000-4000-8000-000000000001/send';
  const reader=await server.token('aicha-meite');const admin=await server.token('jean-dupont');
  assert.equal((await server.request(path,reader,{method:'POST',body:'{}'})).status,403);
  assert.equal((await server.request(path,admin,{method:'POST',body:'{}'})).status,503);
 }finally{
  if(server)await server.close();if(created)await owner.query('DELETE FROM identity.platform_admins WHERE user_id=$1',[actor]);await owner.end();
  if(previous===undefined)delete process.env.INVITATION_DELIVERY_ENABLED;else process.env.INVITATION_DELIVERY_ENABLED=previous;
 }
});
