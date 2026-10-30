import { isIP } from 'node:net';

// This adapter is not wired to an endpoint until durable reconciliation and
// identity-to-membership provisioning are complete.
export function createInvitationProvider({url,serviceKey,redirectUrl,fetchImpl=fetch}) {
  const base=new URL(url),redirect=new URL(redirectUrl);
  if(base.protocol!=='https:'||!base.hostname.endsWith('.supabase.co')||isIP(base.hostname)||base.username||base.password||base.pathname!=='/'||base.search||base.hash)throw new Error('Invalid Supabase project URL');
  if(redirect.protocol!=='https:'||redirect.username||redirect.password||redirect.search||redirect.hash||redirect.pathname!=='/auth/reset')throw new Error('Invalid invitation redirect');
  if(typeof serviceKey!=='string'||serviceKey.length<20)throw new Error('Missing service credential');
  return async function invite(email){
    if(typeof email!=='string'||email.length>254||!email.includes('@'))throw new Error('Invalid email');
    let response;
    try{
      const endpoint=new URL('/auth/v1/invite',base);endpoint.searchParams.set('redirect_to',redirect.href);
      response=await fetchImpl(endpoint,{
        method:'POST',headers:{'Authorization':`Bearer ${serviceKey}`,'apikey':serviceKey,'Content-Type':'application/json'},
        body:JSON.stringify({email}),redirect:'error',signal:AbortSignal.timeout(10000),
      });
    }catch{return {status:'uncertain'};}
    if(!response.ok){
      // A rejection may be caused by an existing identity or an external error;
      // do not attach access or automatically resend based on its body.
      return {status:'uncertain'};
    }
    try{
      const data=await response.json();
      if(typeof data.id!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(data.id)||typeof data.email!=='string'||data.email.trim().toLowerCase()!==email.trim().toLowerCase())return {status:'uncertain'};
      return {status:'confirmed',subject:data.id};
    }catch{return {status:'uncertain'};}
  };
}

// Verify a known provider subject directly with Supabase; matching an unverified
// input alone is never sufficient to attach tenant permissions.
export function createInvitationLookup({url,serviceKey,fetchImpl=fetch}) {
  const base=new URL(url);
  if(base.protocol!=='https:'||!/^([a-z0-9-]+)\.supabase\.co$/.test(base.hostname)||base.username||base.password||base.pathname!=='/'||base.search||base.hash)throw new Error('Invalid Supabase project URL');
  if(typeof serviceKey!=='string'||serviceKey.length<20)throw new Error('Missing service credential');
  return async function lookup(subject,email){
    if(typeof subject!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(subject)||typeof email!=='string')return false;
    try{
      const response=await fetchImpl(new URL(`/auth/v1/admin/users/${subject}`,base),{headers:{'Authorization':`Bearer ${serviceKey}`,'apikey':serviceKey},redirect:'error',signal:AbortSignal.timeout(10000)});
      if(!response.ok)return false;
      const data=await response.json();
      return typeof data.id==='string'&&data.id.toLowerCase()===subject.toLowerCase()&&typeof data.email==='string'&&data.email.trim().toLowerCase()===email.trim().toLowerCase()&&typeof data.email_confirmed_at==='string'&&Number.isFinite(Date.parse(data.email_confirmed_at));
    }catch{return false;}
  };
}
