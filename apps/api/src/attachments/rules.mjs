import { createHash } from 'node:crypto';
export const MAX_FILE_BYTES=10*1024*1024;
export const MAX_PARENT_FILES=20;
export const FILE_TYPES={
  'application/pdf':['pdf'], 'image/jpeg':['jpg','jpeg'], 'image/png':['png'], 'image/webp':['webp'],
  'image/heic':['heic'], 'image/heif':['heif'], 'text/plain':['txt'], 'text/csv':['csv'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document':['docx'],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':['xlsx'],
};
export class AttachmentRuleError extends Error { constructor(status,message){super(message);this.status=status;} }
export function validateFileMetadata(file){
  if(typeof file.filename!=='string'||file.filename.length<1||file.filename.length>180||file.filename!==file.filename.trim()||/[\x00-\x1f\x7f/\\]/.test(file.filename))throw new AttachmentRuleError(400,'Nom de fichier non valide.');
  const extension=file.filename.split('.').at(-1)?.toLowerCase();
  if(!Object.hasOwn(FILE_TYPES,file.mimeType)||!FILE_TYPES[file.mimeType].includes(extension))throw new AttachmentRuleError(400,'Type de fichier ou extension non pris en charge.');
  if(!Number.isInteger(file.size)||file.size<1||file.size>MAX_FILE_BYTES)throw new AttachmentRuleError(400,'Le fichier doit contenir entre 1 octet et 10 Mo.');
  if(typeof file.sha256!=='string'||! /^[a-f0-9]{64}$/.test(file.sha256))throw new AttachmentRuleError(400,'Empreinte SHA-256 non valide.');
}
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
export function stagingKey(tenant,id){if(!uuid.test(tenant)||!uuid.test(id))throw new Error('Invalid storage scope');return `staging/${tenant}/${id}`;}
export function finalKey(tenant,id,attempt){if(!uuid.test(attempt))throw new Error('Invalid object attempt');stagingKey(tenant,id);return `tenants/${tenant}/objects/${id}/${attempt}`;}
export function downloadDisposition(filename){
  const ascii=filename.replace(/[^a-zA-Z0-9._ -]/g,'_').replace(/[\r\n]/g,'_')||'document';
  const encoded=encodeURIComponent(filename).replace(/[!'()*]/g,char=>`%${char.charCodeAt(0).toString(16).toUpperCase()}`);
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}
function checkSignature(bytes,mime){
  const is=(hex)=>bytes.subarray(0,hex.length/2).equals(Buffer.from(hex,'hex'));
  const valid=mime==='application/pdf'?bytes.subarray(0,5).toString()==='%PDF-':
    mime==='image/jpeg'?is('ffd8ff'):mime==='image/png'?is('89504e470d0a1a0a'):
    mime==='image/webp'?bytes.subarray(0,4).toString()==='RIFF'&&bytes.subarray(8,12).toString()==='WEBP':
    ['image/heic','image/heif'].includes(mime)?bytes.subarray(4,8).toString()==='ftyp'&&/^(heic|heix|hevc|hevx|mif1|msf1)$/.test(bytes.subarray(8,12).toString()):
    mime.startsWith('application/vnd.openxmlformats-officedocument.')?is('504b0304'):
    ['text/plain','text/csv'].includes(mime);
  if(!valid)throw new AttachmentRuleError(422,'Le contenu ne correspond pas au type de fichier annoncé.');
}
export async function verifyFileStream(stream,expected){
  let size=0;const hash=createHash('sha256');let header=Buffer.alloc(0);
  const decoder=expected.mimeType.startsWith('text/')?new TextDecoder('utf-8',{fatal:true}):null;
  try{
    for await(const value of stream){
      const chunk=Buffer.isBuffer(value)?value:Buffer.from(value);size+=chunk.length;
      if(size>MAX_FILE_BYTES||size>expected.size)throw new AttachmentRuleError(422,'La taille réelle ne correspond pas à la déclaration.');
      hash.update(chunk);if(header.length<32)header=Buffer.concat([header,chunk.subarray(0,32-header.length)]);
      if(decoder){if(chunk.includes(0))throw new AttachmentRuleError(422,'Le fichier texte contient des données binaires.');try{decoder.decode(chunk,{stream:true});}catch{throw new AttachmentRuleError(422,'Le fichier texte doit être encodé en UTF-8.');}}
    }
    if(decoder){try{decoder.decode();}catch{throw new AttachmentRuleError(422,'Le fichier texte doit être encodé en UTF-8.');}}
    if(size!==expected.size||hash.digest('hex')!==expected.sha256)throw new AttachmentRuleError(422,'L’intégrité du fichier n’a pas pu être confirmée.');
    checkSignature(header,expected.mimeType);
  }catch(error){if(typeof stream.destroy==='function')stream.destroy();throw error;}
}
