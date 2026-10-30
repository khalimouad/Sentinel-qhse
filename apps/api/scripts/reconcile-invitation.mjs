import { createInvitationStore } from '../src/platform/invitation-store.mjs';

// Only a confirmed, previously recorded provider identity may be linked.
// This command never contacts the provider or sends another invitation.
const [companyId,invitationId,actorId]=process.argv.slice(2);
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
if(process.argv.length!==5||![companyId,invitationId,actorId].every(value=>uuid.test(value||'')))throw new Error('Usage: node reconcile-invitation.mjs COMPANY_ID INVITATION_ID PLATFORM_ADMIN_ID');
const {INVITATION_DATABASE_URL,SUPABASE_PROJECT_URL}=process.env;
if(!INVITATION_DATABASE_URL||!SUPABASE_PROJECT_URL)throw new Error('Invitation service configuration is incomplete.');
const base=new URL(SUPABASE_PROJECT_URL);
if(base.protocol!=='https:'||!/^([a-z0-9-]+)\.supabase\.co$/.test(base.hostname)||base.username||base.password||base.pathname!=='/'||base.search||base.hash)throw new Error('Invalid Supabase project URL.');
const issuer=new URL('/auth/v1',base).href.replace(/\/$/,'');
const store=await createInvitationStore({databaseUrl:INVITATION_DATABASE_URL,actorId});
try{
 await store.link(companyId,invitationId,issuer);
 console.log(JSON.stringify({invitationId,status:'linked'}));
}catch{console.error('Reconciliation failed. Verify the saved delivery state and membership before retrying.');process.exitCode=1;}
finally{await store.close();}
