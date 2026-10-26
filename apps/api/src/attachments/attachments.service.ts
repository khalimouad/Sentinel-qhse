import { ConflictException,ForbiddenException,HttpException,Injectable,NotFoundException,ServiceUnavailableException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Attachment,AttachmentEvent,AttachmentList,AttachmentParent,UploadTicket } from '@sentinelle/contracts';
import { Database,type TenantSession } from '../database.js';
import type { Principal } from '../auth.js';
import { AttachmentParentDto,RemoveAttachmentDto,UploadAttachmentDto } from './dto.js';
import { AttachmentRuleError,finalKey,MAX_FILE_BYTES,MAX_PARENT_FILES,stagingKey,validateFileMetadata } from './rules.mjs';
import { ObjectStorage } from './storage.js';

interface StoredAttachment extends Attachment{siteId:string;documentVersionId:string|null;reportId:string|null;stagingKey:string;objectKey:string|null;}
const columns=`a.id,CASE WHEN a.document_version_id IS NOT NULL THEN 'document_version' ELSE 'report' END AS "parentType",coalesce(a.document_version_id,a.report_id) AS "parentId",
  a.filename,a.mime_type AS "mimeType",a.size,a.sha256,a.status,a.revision,a.created_by AS "createdBy",a.created_at AS "createdAt",a.expires_at AS "expiresAt",a.ready_at AS "readyAt",a.rejection_reason AS "rejectionReason",
  (a.status='pending' AND a.created_by=identity.actor_id() AND app.can_manage_file_parent(a.tenant_id,a.site_id,a.document_version_id,a.report_id)) AS "canConfirm",
  (a.status<>'deleted' AND (a.created_by=identity.actor_id() OR identity.can_write_site(a.tenant_id,a.site_id)) AND app.can_manage_file_parent(a.tenant_id,a.site_id,a.document_version_id,a.report_id)) AS "canRemove",
  a.site_id AS "siteId",a.document_version_id AS "documentVersionId",a.report_id AS "reportId",a.staging_key AS "stagingKey",a.object_key AS "objectKey"`;
function visible(row:StoredAttachment):Attachment{
  return {id:row.id,parentType:row.parentType,parentId:row.parentId,filename:row.filename,mimeType:row.mimeType,size:row.size,sha256:row.sha256,status:row.status,revision:row.revision,createdBy:row.createdBy,createdAt:row.createdAt,expiresAt:row.expiresAt,readyAt:row.readyAt,rejectionReason:row.rejectionReason,canConfirm:row.canConfirm,canRemove:row.canRemove};
}
@Injectable()
export class AttachmentsService{
  constructor(private readonly database:Database,private readonly storage:ObjectStorage){}
  private async parent(session:TenantSession,type:AttachmentParent,id:string,manage=false,lock=false){
    const version=type==='document_version'?id:null,report=type==='report'?id:null;
    const query=type==='document_version'?'SELECT site_id AS "siteId" FROM app.document_versions WHERE tenant_id=$1 AND id=$2':'SELECT site_id AS "siteId" FROM app.reports WHERE tenant_id=$1 AND id=$2';
    const parent=await session.db.query<{siteId:string}>(query,[session.tenant.id,id]);
    if(!parent.rows[0])throw new NotFoundException('Le document ou le signalement n’est pas accessible.');
    let allowed=await session.db.query<{allowed:boolean}>('SELECT app.can_manage_file_parent($1,$2,$3,$4) AS allowed',[session.tenant.id,parent.rows[0].siteId,version,report]);
    if(manage&&!allowed.rows[0].allowed)throw new ForbiddenException('Les fichiers de ce document ou de ce signalement ne sont plus modifiables.');
    if(lock){
      try{await session.db.query('SELECT app.lock_file_parent($1,$2,$3)',[session.tenant.id,version,report]);}
      catch(e){if((e as {code?:string}).code==='42501')throw new ConflictException('Le document ou le signalement a changé d’état. Actualisez avant de recommencer.');throw e;}
      allowed=await session.db.query<{allowed:boolean}>('SELECT app.can_manage_file_parent($1,$2,$3,$4) AS allowed',[session.tenant.id,parent.rows[0].siteId,version,report]);
      if(manage&&!allowed.rows[0].allowed)throw new ConflictException('Le document ou le signalement a changé d’état.');
    }
    return {siteId:parent.rows[0].siteId,version,report,canManage:allowed.rows[0].allowed};
  }
  private async get(session:TenantSession,id:string,lock=false){
    const result=await session.db.query<StoredAttachment>(`SELECT ${columns} FROM app.attachments a WHERE a.tenant_id=$1 AND a.id=$2${lock?' FOR UPDATE OF a':''}`,[session.tenant.id,id]);
    if(!result.rows[0])throw new NotFoundException('Pièce jointe introuvable.');
    return result.rows[0];
  }
  private pending(row:StoredAttachment,actor:string){
    if(row.status!=='pending')throw new ConflictException('Cet envoi n’est plus en attente.');
    if(row.createdBy!==actor||!row.canConfirm)throw new ForbiddenException('Seul l’émetteur habilité peut finaliser cet envoi.');
    if(new Date(row.expiresAt).getTime()<=Date.now())throw new ConflictException('L’envoi a expiré. Annulez-le puis recommencez.');
  }
  list(principal:Principal,tenant:string|undefined,input:AttachmentParentDto):Promise<AttachmentList>{
    return this.database.withTenant(principal,tenant,async session=>{
      const parent=await this.parent(session,input.parentType,input.parentId);
      const result=await session.db.query<StoredAttachment>(`SELECT ${columns} FROM app.attachments a WHERE a.tenant_id=$1 AND (a.document_version_id=$2 OR a.report_id=$3) AND a.status<>'deleted' ORDER BY a.created_at,a.id`,[session.tenant.id,parent.version,parent.report]);
      return {items:result.rows.map(visible),canUpload:parent.canManage&&this.storage.enabled,uploadEnabled:this.storage.enabled,maxBytes:MAX_FILE_BYTES,maxFiles:MAX_PARENT_FILES};
    });
  }
  async start(principal:Principal,tenant:string|undefined,input:UploadAttachmentDto):Promise<UploadTicket>{
    try{validateFileMetadata(input);}catch(e){if(e instanceof AttachmentRuleError)throw new HttpException(e.message,e.status);throw e;}
    if(!this.storage.enabled)throw new ServiceUnavailableException('Le stockage de fichiers n’est pas disponible.');
    return this.database.withTenant(principal,tenant,async session=>{
      const parent=await this.parent(session,input.parentType,input.parentId,true,true);
      const count=await session.db.query('SELECT count(*)::integer AS total FROM app.attachments WHERE tenant_id=$1 AND (document_version_id=$2 OR report_id=$3) AND status IN (\'pending\',\'ready\')',[session.tenant.id,parent.version,parent.report]);
      if(count.rows[0].total>=MAX_PARENT_FILES)throw new ConflictException('Limite de 20 fichiers atteinte pour cet élément.');
      const id=randomUUID(),key=stagingKey(session.tenant.id,id);
      let upload;
      try{upload=await this.storage.upload(key,input.mimeType,input.size);}catch{throw new ServiceUnavailableException('Le service d’envoi de fichiers n’est pas disponible.');}
      await session.db.query(`INSERT INTO app.attachments(id,tenant_id,site_id,document_version_id,report_id,filename,mime_type,size,sha256,staging_key,created_by)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,[id,session.tenant.id,parent.siteId,parent.version,parent.report,input.filename,input.mimeType,input.size,input.sha256,key,session.actor.id]);
      return {attachment:visible(await this.get(session,id)),upload};
    });
  }
  async confirm(principal:Principal,tenant:string|undefined,id:string):Promise<Attachment>{
    const snapshot=await this.database.withTenant(principal,tenant,async session=>{const row=await this.get(session,id);if(row.status!=='ready')this.pending(row,session.actor.id);return {...row,tenantId:session.tenant.id};});
    if(snapshot.status==='ready')return visible(snapshot);
    const destination=finalKey(snapshot.tenantId,snapshot.id,randomUUID());
    try{await this.storage.promote(snapshot.stagingKey,destination,{size:snapshot.size,sha256:snapshot.sha256,mimeType:snapshot.mimeType});}
    catch(e){
      await this.storage.cleanup(destination);
      if(e instanceof AttachmentRuleError){
        try{await this.database.withTenant(principal,tenant,async session=>{
          const row=await this.get(session,id);if(row.status!=='pending')return;
          await this.parent(session,row.parentType,row.parentId,true,true);
          const locked=await this.get(session,id,true);if(locked.status==='pending'&&locked.createdBy===session.actor.id)await session.db.query("UPDATE app.attachments SET status='rejected',rejection_reason=$2 WHERE id=$1",[id,e.message]);
        });}catch{ /* A removed or frozen parent cannot be modified by a failed upload. */ }
        await this.storage.cleanup(snapshot.stagingKey);throw new HttpException(e.message,e.status);
      }
      const status=(e as {$metadata?:{httpStatusCode?:number}}).$metadata?.httpStatusCode;
      if(status===404)throw new ConflictException('Envoyez le fichier avant de finaliser cet envoi.');
      if(status===412)throw new ConflictException('Le fichier envoyé a changé. Recommencez sa vérification.');
      throw new ServiceUnavailableException('La vérification du fichier est temporairement indisponible. Vous pouvez la réessayer.');
    }
    // Never delete a verified final copy on an ambiguous database commit error:
    // it may already be referenced by a committed ready row. Reconcile orphans separately.
    const saved=await this.database.withTenant(principal,tenant,async session=>{
      const current=await this.get(session,id);if(current.status==='ready')return current;
      await this.parent(session,current.parentType,current.parentId,true,true);
      const locked=await this.get(session,id,true);if(locked.status==='ready')return locked;
      this.pending(locked,session.actor.id);
      await session.db.query("UPDATE app.attachments SET status='ready',object_key=$2,ready_at=clock_timestamp(),rejection_reason=NULL WHERE id=$1",[id,destination]);
      return this.get(session,id);
    });
    if(saved.objectKey!==destination)await this.storage.cleanup(destination);
    await this.storage.cleanup(snapshot.stagingKey);
    return visible(saved);
  }
  async remove(principal:Principal,tenant:string|undefined,id:string,input:RemoveAttachmentDto){
    const removed=await this.database.withTenant(principal,tenant,async session=>{
      const current=await this.get(session,id);await this.parent(session,current.parentType,current.parentId,true,true);
      const locked=await this.get(session,id,true);
      if(locked.revision!==input.revision)throw new ConflictException('Ce fichier a changé. Actualisez avant de recommencer.');
      if(!locked.canRemove)throw new ForbiddenException('Vous ne pouvez pas retirer ce fichier.');
      await session.db.query("UPDATE app.attachments SET status='deleted' WHERE id=$1",[id]);return locked;
    });
    await this.storage.cleanup(removed.stagingKey);
    // Final verified objects are retained for audit. Purging requires an explicit
    // retention policy; removing an association is not destruction of evidence.
    return {removed:true};
  }
  download(principal:Principal,tenant:string|undefined,id:string){
    return this.database.withTenant(principal,tenant,async session=>{
      const row=await this.get(session,id);if(row.status!=='ready'||!row.objectKey)throw new ConflictException('Le fichier n’est pas disponible au téléchargement.');
      try{return await this.storage.download(row.objectKey,row.filename);}catch{throw new ServiceUnavailableException('Le téléchargement est temporairement indisponible.');}
    });
  }
  history(principal:Principal,tenant:string|undefined,id:string):Promise<AttachmentEvent[]>{
    return this.database.withTenant(principal,tenant,async session=>{
      await this.get(session,id);
      const result=await session.db.query<AttachmentEvent>(`SELECT e.id,e.actor_id AS "actorId",u.name AS "actorName",e.occurred_at AS "occurredAt",e.operation,e.before_data AS "before",e.after_data AS "after"
        FROM app.attachment_events e JOIN identity.list_members($1) u ON u.id=e.actor_id WHERE e.tenant_id=$1 AND e.attachment_id=$2 ORDER BY e.occurred_at DESC,e.id LIMIT 100`,[session.tenant.id,id]);
      return result.rows;
    });
  }
}
