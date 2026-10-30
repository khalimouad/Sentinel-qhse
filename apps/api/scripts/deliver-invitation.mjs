import { randomUUID } from 'node:crypto';
import { createInvitationStore } from '../src/platform/invitation-store.mjs';
import { createInvitationProvider } from '../src/platform/supabase-invitation.mjs';
import { deliverInvitation } from '../src/platform/invitation-delivery.mjs';

// Run only after an authenticated operator explicitly selects a request.
// Credentials come from environment variables, never CLI arguments.
const [companyId,invitationId,actorId]=process.argv.slice(2);
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
if(process.argv.length!==5||![companyId,invitationId,actorId].every(value=>uuid.test(value||'')))throw new Error('Usage: node deliver-invitation.mjs COMPANY_ID INVITATION_ID PLATFORM_ADMIN_ID');
const {INVITATION_DATABASE_URL,SUPABASE_PROJECT_URL,SUPABASE_SERVICE_KEY,INVITATION_REDIRECT_URL}=process.env;
if(!INVITATION_DATABASE_URL||!SUPABASE_PROJECT_URL||!SUPABASE_SERVICE_KEY||!INVITATION_REDIRECT_URL)throw new Error('Invitation service configuration is incomplete.');
const provider=createInvitationProvider({url:SUPABASE_PROJECT_URL,serviceKey:SUPABASE_SERVICE_KEY,redirectUrl:INVITATION_REDIRECT_URL});
const issuer=new URL('/auth/v1',SUPABASE_PROJECT_URL).href.replace(/\/$/,'');
const store=await createInvitationStore({databaseUrl:INVITATION_DATABASE_URL,actorId});
try{
 const result=await deliverInvitation({companyId,invitationId,attemptId:randomUUID(),issuer,store,provider});
 // Do not log the email, provider token, connection string or provider payload.
 console.log(JSON.stringify({invitationId,status:result.status}));
 if(result.status!=='linked')process.exitCode=2;
}catch{console.error('Invitation could not be completed. Inspect its saved state before any retry.');process.exitCode=1;}
finally{await store.close();}
