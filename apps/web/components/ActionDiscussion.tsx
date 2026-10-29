'use client';
import { useEffect,useRef,useState } from 'react';
import { createPortal } from 'react-dom';
import type { ActionComment,ActionCommentList,WorkspaceContext } from '@sentinelle/contracts';
import { api } from '../lib/use-workspace';
export default function ActionDiscussion({actionId,title,context,onClose}:{actionId:string;title:string;context:WorkspaceContext;onClose:()=>void}) {
  const dialog=useRef<HTMLDialogElement>(null);
  const pending=useRef(false);
  const alive=useRef(true);
  const submission=useRef<{id:string;body:string}|null>(null);
  const [data,setData]=useState<ActionCommentList>({items:[],total:0});
  const [page,setPage]=useState(0);
  const [reload,setReload]=useState(0);
  const [draft,setDraft]=useState('');
  const [posting,setPosting]=useState(false);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [loadError,setLoadError]=useState('');
  const [notice,setNotice]=useState('');
  const tenant=context.tenant.id;
  useEffect(()=>{
    alive.current=true;const element=dialog.current;element?.showModal();
    return()=>{alive.current=false;element?.close();};
  },[]);
  useEffect(()=>{
    const controller=new AbortController();setLoading(true);setLoadError('');
    void api<ActionCommentList>(`actions/${actionId}/comments?limit=20&offset=${page*20}`,tenant,{signal:controller.signal})
      .then(result=>{if(!controller.signal.aborted){setData(result);if(page>0&&page*20>=result.total)setPage(Math.max(0,Math.ceil(result.total/20)-1));}})
      .catch(e=>{if(!controller.signal.aborted){setData({items:[],total:0});setLoadError(e instanceof Error?e.message:'Impossible de charger les commentaires.');}})
      .finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return()=>controller.abort();
  },[tenant,actionId,page,reload]);
  function close(){
    if(pending.current)return;
    if(draft.trim()&&!window.confirm('Abandonner le commentaire non envoyé ?'))return;
    onClose();
  }
  async function send(){
    const body=draft.trim();if(pending.current||!body||!context.canWrite)return;
    pending.current=true;setPosting(true);setError('');setNotice('');
    let attempt=submission.current;
    if(!attempt||attempt.body!==body)attempt={id:crypto.randomUUID(),body};
    submission.current=attempt;
    try{
      await api<ActionComment>(`actions/${actionId}/comments`,tenant,{method:'POST',body:JSON.stringify({body:attempt.body,idempotencyKey:attempt.id})});
      if(alive.current){setDraft('');submission.current=null;setNotice('Commentaire enregistré.');setPage(0);setReload(value=>value+1);}
    }catch(e){if(alive.current)setError(e instanceof Error?e.message:'Envoi impossible. Vous pouvez réessayer.');}
    finally{pending.current=false;if(alive.current)setPosting(false);}
  }
  return createPortal(<dialog ref={dialog} className="action-discussion-dialog" aria-labelledby="action-discussion-title" onCancel={event=>{event.preventDefault();close();}}>
    <header className="action-discussion-header"><div><p className="section-kicker">SUIVI DE L’ACTION</p><h2 id="action-discussion-title">Commentaires</h2><p>{title}</p></div><button type="button" className="button button-outline" disabled={posting} onClick={close}>Fermer</button></header>
    <p className="attachments-hint">Les commentaires sont conservés avec leur auteur et leur date. Pour corriger un commentaire, ajoutez un nouveau message. Ils ne remplacent pas la validation d’efficacité ni la clôture de l’action.</p>
    {context.canWrite?<form onSubmit={event=>{event.preventDefault();void send();}}><label className="field-label">Ajouter un commentaire<textarea required rows={4} maxLength={4000} disabled={posting} value={draft} onChange={event=>setDraft(event.target.value)} placeholder="Avancement, précision ou point à traiter…"/></label><div className="action-discussion-tools"><small>{draft.length}/4 000 caractères</small><button type="submit" className="button" disabled={posting||!draft.trim()}>{posting?'Enregistrement…':'Ajouter le commentaire'}</button></div></form>:<p className="report-privacy">Consultation uniquement. Les responsables habilités peuvent ajouter des commentaires.</p>}
    {notice&&<p role="status" className="report-privacy">{notice}</p>}
    {loadError&&<p role="alert" className="document-error">{loadError}</p>}
    {error&&<p role="alert" className="document-error">{error}</p>}
    <div className="action-discussion-tools"><h3>{data.total} commentaire{data.total===1?'':'s'}</h3><button type="button" className="button button-outline" disabled={posting||loading} onClick={()=>setReload(value=>value+1)}>Actualiser</button></div>
    {loading?<p role="status">Chargement…</p>:loadError?<p className="attachments-hint">Les commentaires ne sont pas disponibles. Réessayez avec Actualiser.</p>:data.items.length?<ol className="action-discussion-list">{data.items.map(comment=><li key={comment.id}><div><b>{comment.authorName}</b><time dateTime={comment.createdAt}>{new Date(comment.createdAt).toLocaleString('fr-FR')}</time></div><p>{comment.body}</p></li>)}</ol>:<p className="attachments-hint">Aucun commentaire pour cette action.</p>}
    <div className="action-discussion-tools"><button type="button" className="button button-outline" disabled={posting||loading||page===0} onClick={()=>setPage(value=>value-1)}>Plus récents</button><span className="attachments-hint">Page {page+1} · Du plus récent au plus ancien</span><button type="button" className="button button-outline" disabled={posting||loading||(page+1)*20>=data.total} onClick={()=>setPage(value=>value+1)}>Plus anciens</button></div>
  </dialog>,document.body);
}
