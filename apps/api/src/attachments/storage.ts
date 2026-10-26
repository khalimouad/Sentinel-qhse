import { Inject,Injectable,OnModuleDestroy,ServiceUnavailableException } from '@nestjs/common';
import { S3Client,HeadObjectCommand,CopyObjectCommand,GetObjectCommand,DeleteObjectCommand } from '@aws-sdk/client-s3';
import { createPresignedPost } from '@aws-sdk/s3-presigned-post';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Readable } from 'node:stream';
import { CONFIG,type Config } from '../auth.js';
import { AttachmentRuleError,downloadDisposition,verifyFileStream } from './rules.mjs';

@Injectable()
export class ObjectStorage implements OnModuleDestroy{
  private readonly client:S3Client|null;
  private readonly bucket:string;
  constructor(@Inject(CONFIG) config:Config){
    this.bucket=config.storage?.bucket||'';
    this.client=config.storage?new S3Client({region:config.storage.region,endpoint:config.storage.endpoint,forcePathStyle:config.storage.forcePathStyle,maxAttempts:2,requestChecksumCalculation:'WHEN_REQUIRED',responseChecksumValidation:'WHEN_REQUIRED',requestHandler:{connectionTimeout:3000,requestTimeout:12000}}):null;
  }
  get enabled(){return !!this.client;}
  onModuleDestroy(){this.client?.destroy();}
  private configured(){if(!this.client)throw new ServiceUnavailableException('Le stockage de fichiers n’est pas disponible.');return this.client;}
  async upload(key:string,mimeType:string,size:number){
    const result=await createPresignedPost(this.configured(),{Bucket:this.bucket,Key:key,Fields:{'Content-Type':mimeType},Conditions:[['content-length-range',size,size],{'Content-Type':mimeType}],Expires:300});
    return {...result,expiresAt:new Date(Date.now()+300000).toISOString()};
  }
  async promote(staging:string,destination:string,expected:{size:number;sha256:string;mimeType:string}){
    const client=this.configured();
    const source=await client.send(new HeadObjectCommand({Bucket:this.bucket,Key:staging}),{abortSignal:AbortSignal.timeout(12000)});
    if(source.ContentLength!==expected.size||source.ContentType?.split(';')[0].toLowerCase()!==expected.mimeType)throw new AttachmentRuleError(422,'La taille ou le type du fichier envoyé ne correspond pas à la déclaration.');
    if(!source.ETag)throw new ServiceUnavailableException('Le fournisseur de stockage ne permet pas de vérifier cet objet.');
    await client.send(new CopyObjectCommand({Bucket:this.bucket,Key:destination,CopySource:`${this.bucket}/${staging}`,CopySourceIfMatch:source.ETag,MetadataDirective:'REPLACE',ContentType:expected.mimeType,CacheControl:'private, no-store',Metadata:{sha256:expected.sha256}}),{abortSignal:AbortSignal.timeout(12000)});
    const object=await client.send(new GetObjectCommand({Bucket:this.bucket,Key:destination}),{abortSignal:AbortSignal.timeout(12000)});
    if(!(object.Body instanceof Readable))throw new ServiceUnavailableException('Lecture du fichier indisponible.');
    const body=object.Body;
    const timer=setTimeout(()=>body.destroy(new Error('File verification timeout')),12000);
    try{await verifyFileStream(body,expected);}finally{clearTimeout(timer);body.destroy();}
  }
  async download(key:string,filename:string){return {url:await getSignedUrl(this.configured(),new GetObjectCommand({Bucket:this.bucket,Key:key,ResponseContentDisposition:downloadDisposition(filename),ResponseContentType:'application/octet-stream',ResponseCacheControl:'private, no-store'}),{expiresIn:60}),expiresAt:new Date(Date.now()+60000).toISOString()};}
  async cleanup(key:string){if(!this.client)return;try{await this.client.send(new DeleteObjectCommand({Bucket:this.bucket,Key:key}),{abortSignal:AbortSignal.timeout(5000)});}catch{console.error('An unreferenced storage object could not be removed.');}}
}
