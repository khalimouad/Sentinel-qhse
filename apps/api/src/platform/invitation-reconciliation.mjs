export async function reconcileInvitation({companyId,invitationId,subject,issuer,reason,store,lookup}){
 const saved=await store.lookup(companyId,invitationId);
 if(saved.providerIssuer!==issuer)throw new Error('Provider issuer does not match the reserved attempt');
 if(saved.status==='sent'||saved.status==='identity_verified'){
  const linked=await store.link(companyId,invitationId,issuer);
  return {status:'linked',userId:linked.userId};
 }
 if(!['sending','uncertain'].includes(saved.status)||!saved.attemptId)throw new Error('Invitation cannot be reconciled in its current state');
 if(!await lookup(subject,saved.email))throw new Error('Provider identity could not be verified');
 await store.reconcile(companyId,invitationId,saved.attemptId,subject,reason);
 try{const linked=await store.link(companyId,invitationId,issuer);return {status:'linked',userId:linked.userId};}
 catch{return {status:'verified_unlinked'};}
}
