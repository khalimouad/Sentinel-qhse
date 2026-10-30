'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Action, ActionList, AuditEvent, WorkspaceContext } from '@sentinelle/contracts';
import { api } from '../lib/use-workspace';
import ActionDiscussion from './ActionDiscussion';

const PAGE_SIZE = 25;
const message = (error: unknown) => error instanceof Error ? error.message : 'L’opération a échoué.';
export default function ActionsPage({context, siteName, revision, onCreate, onChanged}: {context: WorkspaceContext; siteName: string; revision: number; onCreate: () => void; onChanged: () => Promise<void>}) {
  const [list,setList]=useState<ActionList>({items:[],total:0});
  const [status,setStatus]=useState('');
  const [search,setSearch]=useState('');
  const [page,setPage]=useState(0);
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [history,setHistory]=useState<{action:Action; events:AuditEvent[]} | null>(null);
  const [discussion,setDiscussion]=useState<Action | null>(null);
  const sequence=useRef(0);
  const siteId=context.sites.find(site=>site.name===siteName)?.id;
  const load=useCallback(async (signal?:AbortSignal)=>{
    const request=++sequence.current;
    setLoading(true); setError('');
    const params=new URLSearchParams({limit:String(PAGE_SIZE),offset:String(page*PAGE_SIZE)});
    if(siteId)params.set('siteId',siteId);
    if(status)params.set('status',status);
    if(search.trim())params.set('search',search.trim());
    try {
      const result=await api<ActionList>(`actions?${params}`,context.tenant.id,{signal});
      if(signal?.aborted || request!==sequence.current)return;
      if(page>0 && page*PAGE_SIZE>=result.total){setPage(Math.max(0,Math.ceil(result.total/PAGE_SIZE)-1));return;}
      setList(result);
    } catch(e) {if(!signal?.aborted && request===sequence.current)setError(message(e));}
    finally {if(!signal?.aborted && request===sequence.current)setLoading(false);}
  },[context.tenant.id,siteId,status,search,page,revision]);
  useEffect(()=>{const controller=new AbortController();void load(controller.signal);return ()=>controller.abort();},[load]);
  async function toggle(action:Action){
    if(action.status==='closed' && (action.reportId||action.riskId||action.obligationId) && !window.confirm('La réouverture peut remettre le dossier associé en traitement. Continuer ?'))return;
    setBusy(true);setError('');
    try {await api(`actions/${action.id}`,context.tenant.id,{method:'PATCH',body:JSON.stringify({version:action.version,status:action.status==='open'?'closed':'open'})});await load();await onChanged();}
    catch(e){setError(message(e));if((e as {status?:number}).status===409)await load();}
    finally{setBusy(false);}
  }
  async function showHistory(action:Action){setBusy(true);setError('');try{const events=await api<AuditEvent[]>(`actions/${action.id}/history`,context.tenant.id);setHistory({action,events});}catch(e){setError(message(e));}finally{setBusy(false);}}
  function exportPage(){const url=URL.createObjectURL(new Blob([JSON.stringify(list.items,null,2)],{type:'application/json'}));const link=document.createElement('a');link.href=url;link.download=`sentinelle-actions-page-${page+1}.json`;link.click();window.setTimeout(()=>URL.revokeObjectURL(url),1000);}
  return <div className="module-page">
    <div className="module-header"><div><div className="eyebrow">SUIVI OPÉRATIONNEL</div><h1>Mes actions</h1><p className="welcome-sub">Suivez les actions de votre organisation et de vos sites autorisés.</p></div><button className="button button-primary" disabled={!context.canWrite||busy} onClick={onCreate}>Nouvelle action</button></div>
    <div className="panel module-table-panel">
      <div className="module-toolbar"><div className="tabs">{[['','Tout'],['open','En cours'],['closed','Terminées']].map(([value,label])=><button key={value} className={status===value?'tab-active':''} onClick={()=>{setStatus(value);setPage(0);}}>{label}</button>)}</div><div className="table-tools"><label>Rechercher <input aria-label="Rechercher dans les intitulés" maxLength={200} value={search} onChange={e=>{setSearch(e.target.value);setPage(0);}} /></label><button className="button button-outline" disabled={loading||!!error||!list.items.length} onClick={exportPage}>Exporter la page JSON</button></div></div>
      {error&&<p className="document-error" role="alert">{error} <button type="button" onClick={()=>void load()}>Réessayer</button></p>}
      {loading?<p role="status">Chargement des actions…</p>:!error&&<><div className="data-table"><div className="table-header"><span>ACTION</span><span>SITE</span><span>STATUT</span><span>ÉCHÉANCE</span><span>SUIVI</span></div>{list.items.map(action=><div className="data-row" key={action.id}><div className="data-title"><button className={`check-action ${action.status==='closed'?'checked':''}`} disabled={!context.canWrite||busy} onClick={()=>void toggle(action)} aria-label={action.status==='closed'?'Rouvrir l’action':'Clôturer l’action'}>{action.status==='closed'?'✓':''}</button><span><b>{action.title}</b><small>{action.origin} · {action.ownerName}</small></span></div><span>{action.siteName}</span><span>{action.status==='closed'?'Clôturée':action.priority==='high'?'Prioritaire':'En cours'}</span><span>{action.dueDate||'À planifier'}</span><span><button type="button" disabled={busy} onClick={()=>void showHistory(action)}>Historique</button> <button type="button" disabled={busy} onClick={()=>setDiscussion(action)}>Commentaires</button></span></div>)}</div>{!list.total&&<p>Aucune action ne correspond aux filtres.</p>}<div className="pagination"><span>{list.total} résultat(s) · page {page+1} sur {Math.max(1,Math.ceil(list.total/PAGE_SIZE))}</span><button className="button button-outline" disabled={busy||page===0} onClick={()=>setPage(value=>value-1)}>Précédent</button><button className="button button-outline" disabled={busy||(page+1)*PAGE_SIZE>=list.total} onClick={()=>setPage(value=>value+1)}>Suivant</button></div></>}
    </div>
    {history&&<div className="modal-backdrop" onClick={()=>setHistory(null)}><section className="modal history-modal" role="dialog" aria-modal="true" aria-label="Historique de l’action" onClick={e=>e.stopPropagation()}><button className="modal-close" aria-label="Fermer" onClick={()=>setHistory(null)}>×</button><h2>Historique : {history.action.title}</h2><p>Les 100 derniers événements sont affichés.</p>{history.events.length?<ol className="history-list">{history.events.map(event=><li key={event.id}><b>{event.operation==='INSERT'?'Action créée':'Action mise à jour'}</b><span>{context.members.find(member=>member.id===event.actorId)?.name||'Membre autorisé'} · {new Date(event.occurredAt).toLocaleString('fr-FR')}</span></li>)}</ol>:<p>Aucun événement disponible.</p>}</section></div>}
    {discussion&&<ActionDiscussion context={context} actionId={discussion.id} title={discussion.title} onClose={()=>setDiscussion(null)}/>}
  </div>;
}
