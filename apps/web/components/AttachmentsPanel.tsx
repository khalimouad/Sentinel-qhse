'use client';
import { useCallback,useEffect,useRef,useState } from 'react';
import { Camera,Clock3,Download,Paperclip,RefreshCw,Trash2,Upload } from 'lucide-react';
import type { Attachment,AttachmentEvent,AttachmentList,AttachmentParent,UploadTicket } from '@sentinelle/contracts';
import { api } from '../lib/use-workspace';
const mimeByExtension:Record<string,string>={pdf:'application/pdf',jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',webp:'image/webp',heic:'image/heic',heif:'image/heif',txt:'text/plain',csv:'text/csv',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'};
const accepts=Object.keys(mimeByExtension).map(ext=>`.${ext}`).join(',');
const message=(e:unknown)=>e instanceof Error?e.message:'L’opération sur le fichier a échoué.';
export default function AttachmentsPanel({tenantId,parentType,parentId,disabled=false,onChanged,onBusyChange}:{tenantId:string;parentType:AttachmentParent;parentId:string;disabled?:boolean;onChanged:()=>Promise<void>;onBusyChange:(busy:boolean)=>void}){
  const [data,setData]=useState<AttachmentList|null>(null);
  const [error,setError]=useState('');
  const [progress,setProgress]=useState('');
  const [busy,setBusy]=useState(false);
  const [loading,setLoading]=useState(true);
  const [history,setHistory]=useState<{filename:string;events:AttachmentEvent[]}|null>(null);
  const historyGeneration=useRef(0);
  const input=useRef<HTMLInputElement>(null),camera=useRef<HTMLInputElement>(null);
  const inFlight=useRef(false);
  const load=useCallback(async(signal?:AbortSignal)=>{
    const params=new URLSearchParams({parentType,parentId});
    const result=await api<AttachmentList>(`attachments?${params}`,tenantId,{signal});
    if(!signal?.aborted)setData(result);
  },[tenantId,parentType,parentId]);
  useEffect(()=>{const controller=new AbortController();setLoading(true);void load(controller.signal).catch(e=>{if(!controller.signal.aborted)setError(message(e));}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});return()=>controller.abort();},[load]);
  async function operation(work:()=>Promise<void>){
    if(inFlight.current||busy||disabled)return;inFlight.current=true;historyGeneration.current++;setHistory(null);setBusy(true);onBusyChange(true);setError('');
    try{await work();}catch(e){setError(message(e));}
    finally{
      const refreshed=await Promise.allSettled([load(),onChanged()]);
      if(refreshed.some(result=>result.status==='rejected'))setError(current=>`${current ? current+' ' : ''}Actualisez les données avant de poursuivre.`);
      inFlight.current=false;setBusy(false);setProgress('');onBusyChange(false);
    }
  }
  async function upload(file:File){
    await operation(async()=>{
      if(!data?.canUpload)throw new Error('L’ajout de fichiers n’est pas autorisé actuellement.');
      if(file.size<1||file.size>data.maxBytes)throw new Error('Choisissez un fichier non vide de 10 Mo maximum.');
      const ext=file.name.split('.').at(-1)?.toLowerCase()||'';
      const mimeType=mimeByExtension[ext];if(!mimeType)throw new Error('Ce type de fichier n’est pas pris en charge.');
      setProgress('Calcul de l’empreinte du fichier…');
      const digest=await crypto.subtle.digest('SHA-256',await file.arrayBuffer());
      const sha256=Array.from(new Uint8Array(digest)).map(byte=>byte.toString(16).padStart(2,'0')).join('');
      const ticket=await api<UploadTicket>('attachments/uploads',tenantId,{method:'POST',body:JSON.stringify({parentType,parentId,filename:file.name,mimeType,size:file.size,sha256})});
      setProgress('Envoi du fichier…');const form=new FormData();
      for(const [key,value] of Object.entries(ticket.upload.fields))form.append(key,value);
      form.append('file',file);
      const sent=await fetch(ticket.upload.url,{method:'POST',body:form,credentials:'omit',redirect:'error',signal:AbortSignal.timeout(300000)});
      if(!sent.ok)throw new Error('L’envoi a échoué. Annulez l’envoi en attente avant de recommencer.');
      setProgress('Vérification de l’intégrité…');
      await api<Attachment>(`attachments/${ticket.attachment.id}/confirm`,tenantId,{method:'POST',body:'{}'});
    });
    if(input.current)input.current.value='';if(camera.current)camera.current.value='';
  }
  async function download(file:Attachment){
    setError('');
    try{const result=await api<{url:string}>(`attachments/${file.id}/download`,tenantId);const link=document.createElement('a');link.href=result.url;link.rel='noreferrer';document.body.appendChild(link);link.click();link.remove();}
    catch(e){setError(message(e));}
  }
  async function showHistory(file:Attachment){
    const request=++historyGeneration.current;setError('');
    try{const events=await api<AttachmentEvent[]>(`attachments/${file.id}/history`,tenantId);if(request===historyGeneration.current)setHistory({filename:file.filename,events});}
    catch(e){if(request===historyGeneration.current)setError(message(e));}
  }
  return <section className="attachments-panel" aria-label="Pièces jointes"><div className="attachments-heading"><h3><Paperclip size={14}/> Pièces jointes</h3><div><button type="button" className="button" disabled={disabled||busy||!data?.canUpload} onClick={()=>input.current?.click()}><Upload size={13}/> Ajouter un fichier</button><button type="button" className="button attachment-camera" disabled={disabled||busy||!data?.canUpload} onClick={()=>camera.current?.click()}><Camera size={13}/> Photo</button><button type="button" className="icon-button" aria-label="Actualiser les fichiers" disabled={busy} onClick={()=>{setError('');void load().catch(e=>setError(message(e)));}}><RefreshCw size={14}/></button></div></div>
    <input ref={input} hidden type="file" accept={accepts} onChange={e=>{const file=e.target.files?.[0];if(file)void upload(file);}}/><input ref={camera} hidden type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" capture="environment" onChange={e=>{const file=e.target.files?.[0];if(file)void upload(file);}}/>
    <p className="attachments-hint">PDF, Word, Excel, texte ou photos · 10 Mo par fichier · 20 fichiers maximum.</p>
    {data&&!data.uploadEnabled&&<p className="attachments-hint">L’envoi de fichiers n’est pas disponible actuellement.</p>}
    {progress&&<p role="status" className="attachments-progress">{progress}</p>}{error&&<p role="alert" className="document-error">{error}</p>}
    {loading?<p className="attachments-hint">Chargement des fichiers…</p>:!data?.items.length?<p className="attachments-hint">Aucune pièce jointe accessible.</p>:<ul className="attachments-list">{data.items.map(file=><li key={file.id}><div className="attachment-info"><b>{file.filename}</b><span>{(file.size/1024).toFixed(1)} Ko · {file.status==='ready'?'Intégrité confirmée':file.status==='rejected'?'Fichier refusé':'Envoi en attente'}</span>{file.rejectionReason&&<small>{file.rejectionReason}</small>}{file.status==='ready'&&<code title={file.sha256}>SHA-256 : {file.sha256}</code>}</div><div className="attachment-buttons"><button type="button" className="icon-button" disabled={busy} aria-label={`Historique de ${file.filename}`} onClick={()=>void showHistory(file)}><Clock3 size={15}/></button>{file.status==='ready'&&<button type="button" className="icon-button" disabled={busy} aria-label={`Télécharger ${file.filename}`} onClick={()=>void download(file)}><Download size={15}/></button>}{file.canConfirm&&<button type="button" className="button" disabled={disabled||busy||!data.uploadEnabled} onClick={()=>void operation(async()=>{setProgress('Vérification de l’intégrité…');await api<Attachment>(`attachments/${file.id}/confirm`,tenantId,{method:'POST',body:'{}'});})}>Terminer</button>}{file.canRemove&&<button type="button" className="icon-button" disabled={disabled||busy} aria-label={file.status==='pending'?`Annuler l’envoi de ${file.filename}`:`Retirer ${file.filename}`} onClick={()=>{if(window.confirm(file.status==='pending'?'Annuler cet envoi ?':'Retirer ce fichier de la liste ?'))void operation(async()=>{await api(`attachments/${file.id}/remove`,tenantId,{method:'POST',body:JSON.stringify({revision:file.revision})});});}}><Trash2 size={15}/></button>}</div></li>)}</ul>}
    {history&&<div className="document-history"><h3>Historique · {history.filename}</h3>{history.events.map(event=><div key={event.id}><b>{event.operation==='INSERT'?'Envoi créé':event.after.status==='ready'?'Intégrité confirmée':event.after.status==='rejected'?'Fichier refusé':'Fichier retiré'}</b><span>{event.actorName} · {new Date(event.occurredAt).toLocaleString('fr-FR')}</span></div>)}</div>}
  </section>;
}
