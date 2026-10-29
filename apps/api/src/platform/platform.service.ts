import { BadRequestException,ConflictException,ForbiddenException,Injectable,NotFoundException } from '@nestjs/common';
import { type Principal } from '../auth.js';
import { Database } from '../database.js';
import { CompanyDto,PlatformAccountDto,PlatformAccessDto,PlatformQuery,PlatformSiteDto } from './dto.js';
@Injectable()
export class PlatformService {
 constructor(private readonly database:Database){}
 private run<T>(principal:Principal,operation:(db:import('pg').PoolClient)=>Promise<T>){
  return this.database.withIdentity(principal,async({db})=>{
   const result=await db.query('SELECT identity.is_platform_admin() AS allowed');
   if(!result.rows[0].allowed)throw new ForbiddenException('Administration de plateforme réservée aux opérateurs habilités.');
   try{return await operation(db);}catch(error){
    const code=(error as {code?:string}).code;
    if(code==='23505'||code==='40001')throw new ConflictException('Cette identité existe déjà dans l’entreprise ou ses accès ont changé. Actualisez.');
    if(code==='23514'||code==='23503')throw new BadRequestException('Vérifiez les données, les sites et l’identité : ils doivent appartenir à l’entreprise sélectionnée.');
    throw error;
   }
  });
 }
 context(principal:Principal){return this.run(principal,async()=>({issuer:principal.issuer}));}
 list(principal:Principal,query:PlatformQuery){return this.run(principal,async db=>(await db.query('SELECT identity.platform_companies($1,$2,$3) AS result',[query.search,query.limit,query.offset])).rows[0].result);}
 detail(principal:Principal,id:string){return this.run(principal,async db=>{const result=(await db.query('SELECT identity.platform_company($1) AS result',[id])).rows[0].result;if(!result)throw new NotFoundException('Entreprise introuvable.');return result;});}
 private provision(principal:Principal,command:string,id:string|null,input:CompanyDto|PlatformSiteDto|PlatformAccountDto|PlatformAccessDto){
  return this.run(principal,async db=>{
   const {note,...payload}=input;
   const data:Record<string,unknown>={...payload};
   if(command==='account')data.issuer=principal.issuer;
   const result=await db.query('SELECT identity.platform_provision($1,$2,$3::jsonb,$4) AS id',[command,id,JSON.stringify(data),note]);
   return {id:result.rows[0].id};
  });
 }
 company(p:Principal,input:CompanyDto){return this.provision(p,'company',null,input);}
 site(p:Principal,id:string,input:PlatformSiteDto){return this.provision(p,'site',id,input);}
 account(p:Principal,id:string,input:PlatformAccountDto){return this.provision(p,'account',id,input);}
 access(p:Principal,id:string,input:PlatformAccessDto){return this.provision(p,'access',id,input);}
}
