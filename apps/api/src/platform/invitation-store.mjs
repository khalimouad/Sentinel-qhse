import pg from 'pg';
// Separate identity, credentials and pool from the HTTP API runtime.
export async function createInvitationStore({databaseUrl,actorId}) {
 const pool=new pg.Pool({connectionString:databaseUrl,max:2,connectionTimeoutMillis:5000,idleTimeoutMillis:30000});
 try{
  const {rows}=await pool.query(`SELECT current_user AS name,rolsuper,rolbypassrls,
   EXISTS(SELECT 1 FROM pg_namespace n WHERE n.nspname IN ('app','identity') AND pg_has_role(current_user,n.nspowner,'MEMBER')) AS owner_member
   FROM pg_roles WHERE rolname=current_user`);
  if(!rows[0]||rows[0].name!=='sentinelle_invitation_worker'||rows[0].rolsuper||rows[0].rolbypassrls||rows[0].owner_member)throw new Error('Restricted invitation worker role required');
 }catch(error){await pool.end();throw error;}
 async function transact(sql,args){const db=await pool.connect();try{await db.query('BEGIN');await db.query("SET LOCAL statement_timeout='15s'");await db.query("SET LOCAL lock_timeout='5s'");await db.query("SELECT set_config('app.actor_id',$1,true),set_config('app.tenant_id','',true)",[actorId]);const result=await db.query(sql,args);await db.query('COMMIT');return result.rows[0].result;}catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}}
 return {
  reserve:(companyId,id,attemptId)=>transact('SELECT identity.platform_invitation_reserve($1,$2,$3) AS result',[companyId,id,attemptId]),
  record:(companyId,id,attemptId,status,subject)=>transact('SELECT identity.platform_invitation_record_outcome($1,$2,$3,$4,$5) AS result',[companyId,id,attemptId,status,subject]),
  link:(companyId,id,issuer)=>transact('SELECT identity.platform_invitation_link($1,$2,$3) AS result',[companyId,id,issuer]),
  close:()=>pool.end(),
 };
}
