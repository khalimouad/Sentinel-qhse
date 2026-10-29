import pg from 'pg';
const {DATABASE_ADMIN_URL,PLATFORM_ADMIN_ISSUER,PLATFORM_ADMIN_SUBJECT,PLATFORM_ADMIN_NAME}=process.env;
if(!DATABASE_ADMIN_URL||!PLATFORM_ADMIN_ISSUER||!PLATFORM_ADMIN_SUBJECT||!PLATFORM_ADMIN_NAME)throw new Error('Set DATABASE_ADMIN_URL, PLATFORM_ADMIN_ISSUER, PLATFORM_ADMIN_SUBJECT and PLATFORM_ADMIN_NAME.');
if(!PLATFORM_ADMIN_ISSUER.startsWith('https://')&&!(process.env.NODE_ENV==='development'&&PLATFORM_ADMIN_ISSUER==='urn:sentinelle:development'))throw new Error('Use the exact HTTPS issuer of the identity provider.');
const db=new pg.Client({connectionString:DATABASE_ADMIN_URL});await db.connect();
try{
 await db.query('BEGIN');
 const owner=await db.query("SELECT pg_has_role(current_user,nspowner,'MEMBER') AS allowed FROM pg_namespace WHERE nspname='identity'");
 if(!owner.rows[0]?.allowed)throw new Error('Run only with the migration owner credentials.');
 await db.query('INSERT INTO identity.users(issuer,subject,name) VALUES($1,$2,$3) ON CONFLICT(issuer,subject) DO NOTHING',[PLATFORM_ADMIN_ISSUER,PLATFORM_ADMIN_SUBJECT,PLATFORM_ADMIN_NAME]);
 await db.query('INSERT INTO identity.platform_admins(user_id) SELECT id FROM identity.users WHERE issuer=$1 AND subject=$2 ON CONFLICT DO NOTHING',[PLATFORM_ADMIN_ISSUER,PLATFORM_ADMIN_SUBJECT]);
 await db.query('COMMIT');console.log('Platform administrator provisioned. No tenant access was granted.');
}catch(error){await db.query('ROLLBACK');throw error;}finally{await db.end();}
