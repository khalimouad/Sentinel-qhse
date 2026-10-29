import { BadRequestException,ConflictException,ForbiddenException,Injectable,NotFoundException } from '@nestjs/common';
import { type Principal } from '../auth.js';
import { Database } from '../database.js';
import { PlatformAccountQuery,PlatformHistoryQuery,CompanyDto,CompanyMetadataDto,SiteMetadataDto,PlatformAccountDto,PlatformAccessDto,PlatformQuery,PlatformSiteDto } from './dto.js';
@Injectable()
export class PlatformService {
 constructor(private readonly database:Database){}
 private run<T>(principal:Principal,operation:(db:import('pg').PoolClient)=>Promise<T>){
  return this.database.withIdentity(principal,async({db})=>{
   const result=await db.query('SELECT identity.is_platform_admin() AS allowed');
   if(!result.rows[0].allowed)throw new ForbiddenException('Administration de plateforme réservée aux opérateurs habilités.');
   try{return await operation(db);}catch(error){
    const code=(error as {code?:string}).code;
    if(code==='40001')throw new ConflictException('Les données ont été modifiées par un autre administrateur. Actualisez la fiche avant de recommencer.');
    if(code==='23505')throw new ConflictException('Un site portant ce nom ou un compte rattaché à cette identité existe déjà dans cette entreprise.');
    if(code==='P0002')throw new NotFoundException('Entreprise ou site introuvable.');
    if(code==='23514'||code==='23503')throw new BadRequestException('Vérifiez les données, les sites et l’identité : ils doivent appartenir à l’entreprise sélectionnée.');
    throw error;
   }
  });
 }
 context(principal:Principal){return this.run(principal,async()=>({issuer:principal.issuer}));}
 list(principal:Principal,query:PlatformQuery){return this.run(principal,async db=>(await db.query('SELECT identity.platform_companies($1,$2,$3) AS result',[query.search,query.limit,query.offset])).rows[0].result);}
 detail(principal:Principal,id:string){return this.run(principal,async db=>{const result=(await db.query('SELECT identity.platform_company($1) AS result',[id])).rows[0].result;if(!result)throw new NotFoundException('Entreprise introuvable.');return result;});}
 accounts(p:Principal,id:string,q:PlatformAccountQuery){return this.run(p,async db=>(await db.query('SELECT identity.platform_accounts($1,$2,$3,$4,$5,$6) AS result',[id,q.search,q.role,q.status,q.limit,q.offset])).rows[0].result);}
 history(p:Principal,id:string,q:PlatformHistoryQuery){return this.run(p,async db=>(await db.query('SELECT identity.platform_history($1,$2,$3,$4,$5) AS result',[id,q.search,q.operation,q.limit,q.offset])).rows[0].result);}
 private provision(principal:Principal,command:string,id:string|null,input:CompanyDto|PlatformSiteDto|PlatformAccountDto|PlatformAccessDto){
  return this.run(principal,async db=>{
   const {note,...payload}=input;
   const data:Record<string,unknown>={...payload};
   if(command==='account')data.issuer=principal.issuer;
   const result=await db.query('SELECT identity.platform_provision($1,$2,$3::jsonb,$4) AS id',[command,id,JSON.stringify(data),note]);
   return {id:result.rows[0].id};
  });
 }
 metadata(p:Principal,id:string,siteId:string|null,input:CompanyMetadataDto|SiteMetadataDto){
  return this.run(p,async db=>{
   const {revision,note,...payload}=input;
   const result=await db.query('SELECT identity.platform_update_metadata($1,$2,$3,$4::jsonb,$5) AS id',[id,siteId,revision,JSON.stringify(payload),note]);
   return {id:result.rows[0].id};
  });
 }
 company(p:Principal,input:CompanyDto){return this.provision(p,'company',null,input);}
 site(p:Principal,id:string,input:PlatformSiteDto){return this.provision(p,'site',id,input);}
 account(p:Principal,id:string,input:PlatformAccountDto){return this.provision(p,'account',id,input);}
 access(p:Principal,id:string,input:PlatformAccessDto){return this.provision(p,'access',id,input);}
}
