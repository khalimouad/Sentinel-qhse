// Operations must commit independently: a timeout cannot roll back a provider
// invitation. A reserved attempt is never sent again automatically.
export async function deliverInvitation({companyId,invitationId,attemptId,issuer,store,provider}) {
 const reserved=await store.reserve(companyId,invitationId,attemptId,issuer);
 if(reserved.status!=='sending'||reserved.attemptId!==attemptId)throw new Error('Invitation reservation mismatch');
 let outcome;
 try{outcome=await provider(reserved.email);}catch{outcome={status:'uncertain'};}
 if(outcome?.status!=='confirmed'||typeof outcome.subject!=='string'){
  await store.record(companyId,invitationId,attemptId,'uncertain',null);
  return {status:'uncertain'};
 }
 // Persist provider confirmation before creating any tenant membership. If the
 // linking transaction fails, the recorded subject remains available for a
 // controlled reconciliation and must not trigger another provider call.
 await store.record(companyId,invitationId,attemptId,'sent',outcome.subject);
 try{
  const linked=await store.link(companyId,invitationId,issuer);
  return {status:'linked',userId:linked.userId};
 }catch{return {status:'sent_unlinked'};}
}
