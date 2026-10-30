import { ForbiddenException,Injectable,ServiceUnavailableException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Database } from '../database.js';
import type { Principal } from '../auth.js';
import { createInvitationStore } from './invitation-store.mjs';
import { createInvitationProvider,createInvitationLookup } from './supabase-invitation.mjs';
import { deliverInvitation } from './invitation-delivery.mjs';
import { reconcileInvitation } from './invitation-reconciliation.mjs';

@Injectable()
export class InvitationGatewayService {
 constructor(private readonly database:Database){}
 private async prepare(principal:Principal){
  const actor=await this.database.withIdentity(principal,async({db,actor})=>{
   const {rows}=await db.query('SELECT identity.is_platform_admin() AS allowed');
   if(!rows[0]?.allowed)throw new ForbiddenException('Administration de plateforme réservée aux opérateurs habilités.');return actor;
  });
  const {INVITATION_DELIVERY_ENABLED,INVITATION_DATABASE_URL,SUPABASE_PROJECT_URL,SUPABASE_SERVICE_KEY,INVITATION_REDIRECT_URL}=process.env;
  if(INVITATION_DELIVERY_ENABLED!=='true'||!INVITATION_DATABASE_URL||!SUPABASE_PROJECT_URL||!SUPABASE_SERVICE_KEY||!INVITATION_REDIRECT_URL)throw new ServiceUnavailableException('Le service d’invitation n’est pas configuré.');
  try{
   const provider=createInvitationProvider({url:SUPABASE_PROJECT_URL,serviceKey:SUPABASE_SERVICE_KEY,redirectUrl:INVITATION_REDIRECT_URL});
   const lookup=createInvitationLookup({url:SUPABASE_PROJECT_URL,serviceKey:SUPABASE_SERVICE_KEY});
   const issuer=new URL('/auth/v1',SUPABASE_PROJECT_URL).href.replace(/\/$/,'');
   if(principal.authentication!=='oidc'||principal.issuer!==issuer)throw new ForbiddenException('Le compte administrateur doit utiliser le fournisseur configuré.');
   const store=await createInvitationStore({databaseUrl:INVITATION_DATABASE_URL,actorId:actor.id});
   return {store,provider,lookup,issuer};
  }catch(error){if(error instanceof ForbiddenException)throw error;throw new ServiceUnavailableException('Le service d’invitation est indisponible.');}
 }
 async send(principal:Principal,companyId:string,invitationId:string){
  const session=await this.prepare(principal);
  try{return await deliverInvitation({companyId,invitationId,attemptId:randomUUID(),issuer:session.issuer,store:session.store,provider:session.provider});}
  catch{throw new ServiceUnavailableException('L’envoi ne peut pas être confirmé. Actualisez et contrôlez l’état avant toute reprise.');}
  finally{await session.store.close();}
 }
 async reconcile(principal:Principal,companyId:string,invitationId:string,subject:string,reason:string){
  const session=await this.prepare(principal);
  try{return await reconcileInvitation({companyId,invitationId,subject,issuer:session.issuer,reason,store:session.store,lookup:session.lookup});}
  catch{throw new ServiceUnavailableException('La réconciliation a échoué. Vérifiez l’identité fournisseur et l’état de la demande.');}
  finally{await session.store.close();}
 }
}
