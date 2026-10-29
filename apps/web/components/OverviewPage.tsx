'use client';
import { useEffect,useRef,useState } from 'react';
import type { ReactNode } from 'react';
import { ArrowRight,CalendarDays,Check,ClipboardCheck,FileText,ListChecks,Plus,ShieldAlert } from 'lucide-react';
import type { Action,OverviewSummary,WorkspaceContext } from '@sentinelle/contracts';
import { api } from '../lib/use-workspace';
import ActionDiscussion from './ActionDiscussion';
export default function OverviewPage({context,siteName,onNavigate,onCreateAction,onActionChanged,reload}:{
  context:WorkspaceContext|null;siteName:string;reload:number;onNavigate:(page:string)=>void;onCreateAction:()=>void;onActionChanged:()=>Promise<void>;
}) {
  const [data,setData]=useState<OverviewSummary|null>(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [revision,setRevision]=useState(0);
  const [busy,setBusy]=useState(false);
  const [discussion,setDiscussion]=useState<Action|null>(null);
  const alive=useRef(true);
  const pending=useRef(false);
  const tenant=context?.tenant.id;
  const siteId=context?.sites.find(site=>site.name===siteName)?.id;
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
  useEffect(()=>{
    const controller=new AbortController();setData(null);setError('');setLoading(true);
    if(!tenant)return()=>controller.abort();
    if(siteName!=='Tous les sites'&&!siteId){setLoading(false);setError('Ce site n’est plus accessible. Sélectionnez un site autorisé.');return()=>controller.abort();}
    const params=new URLSearchParams();if(siteId)params.set('siteId',siteId);
    void api<OverviewSummary>(`overview?${params}`,tenant,{signal:controller.signal})
      .then(result=>{if(!controller.signal.aborted)setData(result);})
      .catch(e=>{if(!controller.signal.aborted)setError(e instanceof Error?e.message:'Impossible de charger les indicateurs.');})
      .finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return()=>controller.abort();
  },[tenant,siteId,siteName,revision,reload]);
  async function complete(action:Action){
    if(!context||!context.canWrite||pending.current)return;pending.current=true;setBusy(true);setError('');setNotice('');
    try{
      await api<Action>(`actions/${action.id}`,context.tenant.id,{method:'PATCH',body:JSON.stringify({version:action.version,status:'closed'})});
      await onActionChanged().catch(()=>{if(alive.current)setNotice('Action clôturée. Actualisez le plan d’actions pour le recharger.');});
      if(alive.current)setRevision(value=>value+1);
    }catch(e){if(alive.current){setError(e instanceof Error?e.message:'Mise à jour impossible.');}}
    finally{pending.current=false;if(alive.current)setBusy(false);}
  }
  return <div className="page-content overview-live">
    <section className="welcome-row"><div><div className="eyebrow"><span className="live-dot"/>SUIVI OPÉRATIONNEL · {siteName}</div><h1>Bonjour {context?.actor.name.split(' ')[0]||'à vous'}</h1><p className="welcome-sub">Les points à suivre sur vos sites autorisés.</p></div><div className="welcome-actions"><button className="button button-quiet" disabled={busy||loading||!context} onClick={()=>setRevision(value=>value+1)}>Actualiser</button><button className="button button-primary" disabled={busy||!context?.canWrite} onClick={onCreateAction}><Plus size={15}/>Nouvelle action</button></div></section>
    {notice&&<p className="report-privacy" role="status">{notice}</p>}
    {error&&<p className="document-error" role="alert">{error} <button type="button" disabled={busy} onClick={()=>setRevision(value=>value+1)}>Réessayer</button></p>}
    {loading?<section className="panel overview-loading" role="status">Chargement des indicateurs…</section>:!data?<section className="panel overview-loading">Les indicateurs ne sont pas disponibles. Actualisez la page ou réessayez.</section>:<>
      <section className="kpi-grid" aria-label="Indicateurs opérationnels"><Metric label="Actions ouvertes" value={data.actions.open} detail={`${data.actions.owners} responsables · ${data.actions.total} actions au total`} icon={<ListChecks size={17}/>} tone="icon-lilac"/><Metric label="Actions en retard" value={data.actions.overdue} detail={`Échéance antérieure au ${data.asOfDate} (UTC)`} icon={<CalendarDays size={17}/>} tone="icon-peach"/><Metric label="Actions à échéance proche" value={data.actions.dueSoon} detail="30 jours à partir d’aujourd’hui, inclus" icon={<CalendarDays size={17}/>} tone="icon-sage"/><Metric label="Risques résiduels critiques" value={data.risks?.critical??null} detail={data.risks?'Score ≥ 17 · Hors risques archivés':'Réservé aux responsables habilités'} icon={<ShieldAlert size={17}/>} tone="icon-rose"/></section>
      <section className="overview-panels"><article className="panel overview-module"><div className="panel-heading"><div><div className="section-kicker">PLAN D’ACTIONS</div><h2>À suivre en priorité</h2><p>Retards d’abord, puis priorité et échéance.</p></div><button className="text-link" onClick={()=>onNavigate('Mes actions')}>Voir le plan <ArrowRight size={13}/></button></div><div className="overview-priority-list">{data.nextActions.length?data.nextActions.map(action=><div key={action.id}><button type="button" className="check-action" disabled={busy||!context?.canWrite} aria-label={`Clôturer : ${action.title}`} onClick={()=>void complete(action)}><Check size={12}/></button><div><b>{action.title}</b><span>{action.siteName} · {action.ownerName} · {action.priority==='high'?'Priorité haute':'Priorité normale'}</span><small>{action.dueDate?`Échéance : ${action.dueDate}`:'Sans échéance'} · {action.origin}</small></div><button type="button" className="button button-outline" disabled={busy} onClick={()=>setDiscussion(action)}>Suivi</button></div>):<p className="documents-empty">Aucune action ouverte dans ce périmètre.</p>}</div><p className="attachments-hint overview-panel-note">Les compteurs incluent toutes les actions visibles. Cette sélection présente au maximum six actions ouvertes ; la liste du plan d’actions reste limitée aux 100 plus récentes.</p></article>
      <article className="panel overview-module"><div className="panel-heading"><div><div className="section-kicker">REGISTRE DES RISQUES</div><h2>Répartition résiduelle</h2></div>{data.risks&&<button className="text-link" onClick={()=>onNavigate('Risques')}>Ouvrir <ArrowRight size={13}/></button>}</div>{data.risks?<><div className="overview-risk-levels">{([['critical','Critique'],['high','Élevé'],['moderate','Modéré'],['low','Faible']] as const).map(([key,label])=><div className={`risk-${key}`} key={key}><span>{label}</span><b>{data.risks?.[key]}</b></div>)}</div><p className="overview-summary-line">{data.risks.tracked} risques suivis, acceptés ou en traitement · {data.risks.reviewOverdue} revues dépassées</p><p className="attachments-hint overview-panel-note">Risques archivés exclus. Un risque accepté reste suivi jusqu’à son archivage. Les seuils sont ceux de la matrice initiale du registre.</p></>:<p className="documents-empty">La cartographie est réservée aux responsables habilités du site.</p>}</article></section>
      <section className="overview-followups" aria-label="Autres suivis métier"><article className="panel"><FileText size={20}/><h2>Publications documentaires</h2><b>{data.documents.published}</b><p>{data.documents.unread} sans votre accusé de lecture</p><small>Publications accessibles, sans présumer d’une obligation de lecture nominative.</small><button className="text-link" onClick={()=>onNavigate('Documents')}>Consulter les documents <ArrowRight size={13}/></button></article><article className="panel"><ListChecks size={20}/><h2>{context?.canWrite?'Signalements ouverts':'Vos signalements ouverts'}</h2><b>{data.reports.open}</b><p>{data.reports.criticalOpen} de gravité critique</p><small>{context?.canWrite?'Déclarations visibles sur vos sites.':'Seules vos propres déclarations accessibles sont comptées.'}</small><button className="text-link" onClick={()=>onNavigate('Incidents & NC')}>Consulter les signalements <ArrowRight size={13}/></button></article><article className="panel"><ClipboardCheck size={20}/><h2>Audits</h2>{data.audits?<><b>{data.audits.planned+data.audits.inProgress}</b><p>{data.audits.planned} planifiés · {data.audits.inProgress} en cours</p><small>{data.audits.overdue} missions avec début ou fin dépassés</small><button className="text-link" onClick={()=>onNavigate('Audits')}>Consulter le planning <ArrowRight size={13}/></button></>:<p>Suivi réservé aux responsables habilités.</p>}</article></section>
      <footer className="page-footer"><span>{data.siteCount} site{data.siteCount===1?'':'s'} dans ce périmètre · {data.notificationUnread} notifications non lues dans ce périmètre</span><span>Actualisé le {new Date(data.asOf).toLocaleString('fr-FR',{timeZone:'Europe/Paris'})} (Europe/Paris)</span></footer><p className="attachments-hint">Les échéances et retards utilisent la date UTC du serveur ({data.asOfDate}). Aucun taux de conformité n’est calculé tant que le registre des obligations n’est pas connecté.</p>
    </>}
    {context&&discussion&&<ActionDiscussion key={`${context.tenant.id}.${discussion.id}`} context={context} actionId={discussion.id} title={discussion.title} onClose={()=>setDiscussion(null)}/>}
  </div>;
}
function Metric({label,value,detail,icon,tone}:{label:string;value:number|null;detail:string;icon:ReactNode;tone:string}){
  return <article className="kpi-card"><div className="kpi-top"><span>{label}</span><span className={`kpi-icon ${tone}`}>{icon}</span></div><div className="kpi-value">{value??'—'}</div><div className="kpi-bottom"><span>{detail}</span></div></article>;
}
