'use client';
import { useCallback,useEffect,useRef,useState } from 'react';
import { Check,Plus,Search } from 'lucide-react';
import type { Action,Risk,RiskCategory,RiskDetail,RiskList,RiskStatus,ReportEvent,WorkspaceContext } from '@sentinelle/contracts';
import { api } from '../lib/use-workspace';
import { downloadRegisterCsv } from '../lib/register-csv.mjs';
import ActionDiscussion from './ActionDiscussion';
const categories:Record<RiskCategory,string>={quality:'Qualité',safety:'Santé et sécurité',environment:'Environnement',compliance:'Conformité',governance:'Gouvernance',other:'Autre'};
const states:Record<RiskStatus,string>={active:'En traitement',accepted:'Accepté',archived:'Archivé'};
const empty:RiskList={items:[],total:0,scopeTotal:0,overdue:0,matrix:[]};
const level=(score:number):'low'|'moderate'|'high'|'critical'=>score<=4?'low':score<=9?'moderate':score<=16?'high':'critical';
const levels={low:'Faible',moderate:'Modéré',high:'Élevé',critical:'Critique'};
const message=(error:unknown)=>error instanceof Error?error.message:'L’opération a échoué.';
export default function RisksPage({context,siteName,initialRiskId,onActionsChanged}:{context:WorkspaceContext;siteName:string;initialRiskId?:string;onActionsChanged:()=>Promise<void>}) {
  const tenant=context.tenant.id;
  const [list,setList]=useState<RiskList>(empty);
  const [detail,setDetail]=useState<RiskDetail|null>(null);
  const [search,setSearch]=useState('');
  const [status,setStatus]=useState('');
  const [category,setCategory]=useState('');
  const [cell,setCell]=useState<{likelihood:number;severity:number}|null>(null);
  const [page,setPage]=useState(0);
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [editing,setEditing]=useState<'create'|'assessment'|null>(null);
  const [actionForm,setActionForm]=useState(false);
  const [discussion,setDiscussion]=useState<{id:string;title:string}|null>(null);
  const [history,setHistory]=useState<ReportEvent[]|null>(null);
  const generation=useRef(0);
  const listGeneration=useRef(0);
  const pending=useRef(false);
  const alive=useRef(true);
  const risk=detail?.risk;
  const actions=detail?.actions||[];
  const dirty=!!editing||actionForm;
  const name=(id:string|null)=>context.members.find(member=>member.id===id)?.name||id||'—';
  const load=useCallback(async(signal?:AbortSignal)=>{
    const request=++listGeneration.current;
    const params=new URLSearchParams({search,limit:'25',offset:String(page*25)});
    const site=context.sites.find(site=>site.name===siteName);
    if(site)params.set('siteId',site.id);if(status)params.set('status',status);if(category)params.set('category',category);
    if(cell){params.set('likelihood',String(cell.likelihood));params.set('severity',String(cell.severity));}
    const result=await api<RiskList>(`risks?${params}`,tenant,{signal});
    if(alive.current&&!signal?.aborted&&request===listGeneration.current){setList(result);if(page>0&&page*25>=result.total)setPage(Math.max(0,Math.ceil(result.total/25)-1));}
  },[tenant,context.sites,siteName,search,status,category,cell,page]);
  async function exportFiltered(){
    setBusy(true);setError('');
    try{const params=new URLSearchParams({search});const site=context.sites.find(site=>site.name===siteName);if(site)params.set('siteId',site.id);if(status)params.set('status',status);if(category)params.set('category',category);if(cell){params.set('likelihood',String(cell.likelihood));params.set('severity',String(cell.severity));}const result=await api<{items:Risk[];total:number}>(`risks/export?${params}`,tenant);downloadRegisterCsv('risks',result.items);}
    catch(e){setError(message(e));}finally{setBusy(false);}
  }
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;generation.current++;};},[]);
  useEffect(()=>{
    if(!context.canWrite){setLoading(false);return;}
    const controller=new AbortController();setLoading(true);
    const timer=setTimeout(()=>{void load(controller.signal).catch(e=>{if(!controller.signal.aborted){setList(empty);setError(message(e));}}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});},200);
    return()=>{clearTimeout(timer);controller.abort();};
  },[load,context.canWrite]);
  const fetchDetail=useCallback(async(id:string)=>{
    const request=++generation.current;setDetail(null);setHistory(null);setError('');
    try{const result=await api<RiskDetail>(`risks/${id}`,tenant);if(alive.current&&request===generation.current)setDetail(result);}
    catch(e){if(alive.current&&request===generation.current)setError(message(e));}
  },[tenant]);
  useEffect(()=>{if(initialRiskId&&context.canWrite)void fetchDetail(initialRiskId);},[initialRiskId,fetchDetail,context.canWrite]);
  function open(id:string){if(pending.current||(dirty&&!window.confirm('Abandonner la saisie non enregistrée ?')))return;setEditing(null);setActionForm(false);void fetchDetail(id);}
  async function mutate(path:string,input:unknown,method='POST',changesActions=false){
    if(pending.current)return;pending.current=true;setBusy(true);setError('');const request=++generation.current;
    try{
      const saved=await api<RiskDetail>(path,tenant,{method,body:JSON.stringify(input)});
      if(alive.current&&request===generation.current){setDetail(saved);setEditing(null);setActionForm(false);setHistory(null);await load().catch(()=>{if(alive.current)setError('Enregistrement effectué. Actualisez la liste pour la recharger.');});}
      if(changesActions)await onActionsChanged().catch(()=>{if(alive.current)setError('Action enregistrée. Actualisez le plan d’actions.');});
    }catch(e){if(alive.current&&request===generation.current)setError(message(e));}
    finally{pending.current=false;if(alive.current)setBusy(false);}
  }
  async function decide(command:'accept'|'reopen'|'archive'){
    if(!risk||busy||dirty)return;
    const note=window.prompt(command==='accept'?'Pourquoi le risque résiduel est-il acceptable ? Décrivez les preuves et conditions de cette décision.':command==='archive'?'Motif d’archivage du risque :':'Motif de retour en traitement :')?.trim();
    if(note)await mutate(`risks/${risk.id}/decisions`,{revision:risk.revision,command,note});
  }
  async function toggle(action:Action){
    if(!risk||pending.current||dirty)return;
    if(action.status==='closed'&&!window.confirm('Rouvrir cette action ? Le risque reviendra en traitement et son acceptation éventuelle sera invalidée.'))return;
    pending.current=true;setBusy(true);setError('');const request=++generation.current;let changed=false;
    try{
      await api<Action>(`actions/${action.id}`,tenant,{method:'PATCH',body:JSON.stringify({version:action.version,status:action.status==='open'?'closed':'open'})});changed=true;
      const saved=await api<RiskDetail>(`risks/${risk.id}`,tenant);
      if(alive.current&&request===generation.current){setDetail(saved);setHistory(null);await load();}await onActionsChanged();
    }catch(e){if(alive.current&&request===generation.current)setError(changed?'Action enregistrée. Actualisez le risque pour vérifier son état.':message(e));}
    finally{pending.current=false;if(alive.current)setBusy(false);}
  }
  async function showHistory(){
    if(!risk||pending.current)return;const request=generation.current;
    try{const events=await api<ReportEvent[]>(`risks/${risk.id}/history`,tenant);if(alive.current&&request===generation.current)setHistory(events);}
    catch(e){if(alive.current&&request===generation.current)setError(message(e));}
  }
  if(!context.canWrite)return <div className="module-page"><h1>Risques</h1><p className="report-privacy">Le registre opérationnel des risques est réservé aux responsables habilités du site.</p></div>;
  return <div className="module-page documents-page risks-page">
    <div className="module-header"><div><div className="eyebrow">MAÎTRISE DES RISQUES</div><h1>Registre des risques</h1><p>Évaluer, traiter et revoir les risques de vos sites.</p></div><button className="button" disabled={busy} onClick={()=>{if(!dirty||window.confirm('Abandonner la saisie non enregistrée ?')){generation.current++;setEditing('create');setActionForm(false);setDetail(null);setHistory(null);setError('');}}}><Plus size={14}/>Nouveau risque</button></div>
    {error&&<p role="alert" className="document-error">{error} <button type="button" disabled={busy} onClick={()=>{if(risk)open(risk.id);else void load().catch(e=>setError(message(e)));}}>Actualiser</button></p>}
    <section className="panel risk-matrix-panel" aria-label="Matrice des risques résiduels" aria-busy={loading}><div className="audit-template-heading"><h2>Cartographie résiduelle</h2><span>{loading?'Chargement…':`${list.scopeTotal} risques · ${list.overdue} revues en retard`}</span></div><p className="attachments-hint">Probabilité × gravité, échelles de 1 (minimum) à 5 (maximum). La matrice porte sur tous les risques autorisés correspondant au site, à la catégorie, au statut et à la recherche. Cliquez une case pour filtrer la liste.</p><div className="risk-matrix-wrap"><div className="risk-matrix-axis">Probabilité ↑</div><div className="risk-matrix">{[5,4,3,2,1].flatMap(likelihood=>[1,2,3,4,5].map(severity=>{
      const count=list.matrix.find(item=>item.likelihood===likelihood&&item.severity===severity)?.count||0;
      const selected=cell?.likelihood===likelihood&&cell.severity===severity;
      return <button type="button" key={`${likelihood}.${severity}`} className={`risk-cell risk-${level(likelihood*severity)} ${selected?'selected':''}`} disabled={busy||loading} aria-pressed={selected} aria-label={`Probabilité ${likelihood}, gravité ${severity}, score ${likelihood*severity} : ${count} risques`} onClick={()=>{setCell(selected?null:{likelihood,severity});setPage(0);}}><small>P{likelihood} × G{severity}</small><b>{count}</b><span>Score {likelihood*severity}</span></button>;
    }))}</div></div><p className="attachments-hint">Gravité → · Seuils initiaux : 1–4 faible, 5–9 modéré, 10–16 élevé, 17–25 critique. Ces niveaux ne constituent pas une décision d’acceptation automatique.</p>{cell&&<button type="button" className="button button-outline" disabled={busy} onClick={()=>{setCell(null);setPage(0);}}>Effacer la case sélectionnée</button>}</section>
    {editing&&<RiskForm key={editing==='create'?'create':`${risk?.id}.${risk?.revision}`} context={context} siteName={siteName} risk={editing==='assessment'?risk:undefined} busy={busy} onCancel={()=>setEditing(null)} onSave={input=>mutate(editing==='assessment'&&risk?`risks/${risk.id}/assessment`:'risks',{...input,...(editing==='assessment'&&risk?{revision:risk.revision}:{})},editing==='assessment'?'PATCH':'POST')}/>}
    <button type="button" className="button button-outline" disabled={busy||loading||!context.canWrite} onClick={()=>void exportFiltered()}>Exporter les risques filtrés · CSV</button><div className="documents-layout"><section className="panel documents-list" aria-label="Liste des risques"><label className="documents-toolbar"><Search size={14}/><input aria-label="Rechercher un risque" placeholder="Titre ou description…" value={search} disabled={busy} onChange={event=>{setSearch(event.target.value);setCell(null);setPage(0);}}/></label><label className="report-filter">Statut<select value={status} disabled={busy} onChange={event=>{setStatus(event.target.value);setCell(null);setPage(0);}}><option value="">Tous</option>{Object.entries(states).map(([value,label])=><option value={value} key={value}>{label}</option>)}</select></label><label className="report-filter">Catégorie<select value={category} disabled={busy} onChange={event=>{setCategory(event.target.value);setCell(null);setPage(0);}}><option value="">Toutes</option>{Object.entries(categories).map(([value,label])=><option value={value} key={value}>{label}</option>)}</select></label>
      {loading?<p className="documents-empty" role="status">Chargement…</p>:list.items.length?list.items.map(item=><button type="button" key={item.id} disabled={busy} className={`document-list-item ${risk?.id===item.id?'selected':''}`} onClick={()=>open(item.id)}><b>{item.title}</b><span className="document-list-meta">{item.siteName} · {states[item.status]}<span className={`risk-score risk-${level(item.residualScore)}`}>{levels[level(item.residualScore)]} · {item.residualScore}/25</span><span>Revue : {item.nextReviewOn}{item.reviewOverdue?' · En retard':''}</span></span></button>):<p className="documents-empty">Aucun risque dans cette vue.</p>}
      <p className="document-list-foot">{list.total} risques dans la liste · Page {page+1}</p><div className="audit-list-pagination"><button className="button button-outline" type="button" disabled={busy||loading||page===0} onClick={()=>setPage(value=>value-1)}>Précédent</button><button className="button button-outline" type="button" disabled={busy||loading||(page+1)*25>=list.total} onClick={()=>setPage(value=>value+1)}>Suivant</button></div>
    </section><section className="panel document-detail" aria-label="Détail du risque">{!risk?<div className="document-start"><h2>Du risque aux mesures de traitement</h2><p>Sélectionnez un risque ou créez sa première évaluation. Les mesures de traitement utilisent le plan d’actions partagé.</p></div>:<>
      <div className="document-title"><div><span className="document-code">{categories[risk.category]} · {risk.siteName}</span><h2>{risk.title}</h2></div><span className="document-status">{states[risk.status]}</span></div><div className="report-facts"><span>Responsable<b>{name(risk.ownerId)}</b></span><span>Prochaine revue<b>{risk.nextReviewOn}{risk.reviewOverdue?' · En retard':''}</b></span><span>Risque initial<b>{risk.inherentLikelihood} × {risk.inherentSeverity} = {risk.inherentScore}/25</b></span><span>Risque résiduel<b>{risk.residualLikelihood} × {risk.residualSeverity} = {risk.residualScore}/25</b></span></div><h3>Description</h3><p className="audit-scope">{risk.description}</p><h3>Mesures de maîtrise et justification de la cotation</h3><p className="audit-scope">{risk.controls}</p>
      {risk.acceptanceNote&&<div className="document-decision-note"><b>Acceptation du risque résiduel</b><p>{risk.acceptanceNote}</p><small>{name(risk.acceptedBy)} · {risk.acceptedAt&&new Date(risk.acceptedAt).toLocaleString('fr-FR')}</small></div>}
      <div className="document-commands">{risk.status==='active'&&<><button type="button" className="button" disabled={busy||dirty} onClick={()=>setEditing('assessment')}>Réévaluer</button><button type="button" className="button button-outline" disabled={busy||dirty} onClick={()=>setActionForm(true)}>Ajouter une action</button>{risk.ownerId!==context.actor.id&&<button type="button" className="button" disabled={busy||dirty||risk.reviewOverdue||actions.some(action=>action.status!=='closed')} onClick={()=>void decide('accept')}>Accepter le risque résiduel</button>}</>}{risk.status!=='active'&&<button type="button" className="button" disabled={busy||dirty} onClick={()=>void decide('reopen')}>Remettre en traitement</button>}{risk.status!=='archived'&&<button type="button" className="button button-outline" disabled={busy||dirty||actions.some(action=>action.status!=='closed')} onClick={()=>void decide('archive')}>Archiver avec motif</button>}<button type="button" className="button button-outline" disabled={busy} onClick={()=>void showHistory()}>Historique</button></div>
      <p className="attachments-hint">L’acceptation est réservée à une personne distincte du responsable, après clôture des actions et mise à jour de la date de revue. Une action rouverte remet automatiquement le risque en traitement. Révision {risk.revision}.</p>
      <section className="report-linked-actions"><h3>Actions de traitement · {actions.length}</h3>{actions.map(action=><div key={action.id}><button type="button" className={`check-action ${action.status==='closed'?'checked':''}`} disabled={busy||dirty} aria-label={action.status==='closed'?'Rouvrir l’action':'Clôturer l’action'} onClick={()=>void toggle(action)}>{action.status==='closed'&&<Check size={13}/>}</button><span><b>{action.title}</b><small>{action.ownerName} · {action.dueDate||'Sans échéance'}</small></span><em>{action.status==='closed'?'Clôturée':'En cours'}</em><button className="button button-outline" type="button" disabled={busy} onClick={()=>setDiscussion({id:action.id,title:action.title})}>Commentaires</button></div>)}{!actions.length&&<p>Aucune action liée.</p>}</section>
      {actionForm&&<form className="risk-action-form" onSubmit={event=>{event.preventDefault();const values=Object.fromEntries(new FormData(event.currentTarget).entries());if(!values.dueDate)delete values.dueDate;void mutate(`risks/${risk.id}/actions`,{...values,revision:risk.revision},'POST',true);}}><fieldset disabled={busy}><legend>Nouvelle action de traitement</legend><label className="field-label">Intitulé<input name="title" className="field-input" required maxLength={500}/></label><label className="field-label">Responsable<select name="ownerId" className="field-input" required defaultValue={(context.documentReviewers[risk.siteId]||[]).some(person=>person.id===risk.ownerId)?risk.ownerId:''}><option value="" disabled>Choisir</option>{(context.documentReviewers[risk.siteId]||[]).map(person=><option key={person.id} value={person.id}>{person.name}</option>)}</select></label><label className="field-label">Priorité<select name="priority" className="field-input"><option value="normal">Normale</option><option value="high">Haute</option></select></label><label className="field-label">Échéance<input name="dueDate" className="field-input" type="date"/></label><div className="document-commands"><button className="button" type="submit">Créer l’action</button><button className="button button-outline" type="button" onClick={()=>setActionForm(false)}>Fermer</button></div></fieldset></form>}
      {history&&<div className="document-history"><h3>Historique attribué (100 derniers événements)</h3>{history.map(event=><div key={event.id}><b>{String(event.after.last_change_note||event.operation)}</b><span>{name(event.actorId)} · {new Date(event.occurredAt).toLocaleString('fr-FR')}</span><span>Initial : {String(event.after.inherent_score)} · Résiduel : {String(event.after.residual_score)} · {states[event.after.status as RiskStatus]} · Révision {String(event.after.revision)}</span>{typeof event.after.acceptance_note==='string'&&<p>{event.after.acceptance_note}</p>}</div>)}</div>}
    </>}</section></div>
    {discussion&&<ActionDiscussion key={discussion.id} context={context} actionId={discussion.id} title={discussion.title} onClose={()=>setDiscussion(null)}/>}
  </div>;
}
function RiskForm({context,siteName,risk,busy,onSave,onCancel}:{context:WorkspaceContext;siteName:string;risk?:Risk;busy:boolean;onSave:(input:Record<string,unknown>)=>Promise<void>;onCancel:()=>void}) {
  const [siteId,setSiteId]=useState(risk?.siteId||context.sites.find(site=>site.name===siteName)?.id||context.sites[0]?.id||'');
  const people=context.documentReviewers[siteId]||[];
  const scores=[['inherentLikelihood','Probabilité initiale',risk?.inherentLikelihood],['inherentSeverity','Gravité initiale',risk?.inherentSeverity],['residualLikelihood','Probabilité résiduelle',risk?.residualLikelihood],['residualSeverity','Gravité résiduelle',risk?.residualSeverity]] as const;
  return <form className="panel audit-plan-form" onSubmit={event=>{event.preventDefault();const values:Record<string,unknown>=Object.fromEntries(new FormData(event.currentTarget).entries());for(const [key] of scores)values[key]=Number(values[key]);void onSave(values);}}><fieldset disabled={busy}><legend>{risk?'Réévaluer le risque':'Première évaluation du risque'}</legend><label className="field-label">Titre<input className="field-input" name="title" required maxLength={300} defaultValue={risk?.title}/></label><label className="field-label">Description du risque<textarea name="description" required maxLength={6000} rows={3} defaultValue={risk?.description}/></label><label className="field-label">Catégorie<select name="category" className="field-input" defaultValue={risk?.category||'quality'}>{Object.entries(categories).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>{!risk&&<label className="field-label">Site<select name="siteId" className="field-input" required value={siteId} onChange={event=>setSiteId(event.target.value)}>{context.sites.map(site=><option key={site.id} value={site.id}>{site.name}</option>)}</select></label>}<label className="field-label" key={siteId}>Responsable<select name="ownerId" className="field-input" required defaultValue={people.some(person=>person.id===(risk?.ownerId||context.actor.id))?(risk?.ownerId||context.actor.id):''}><option value="" disabled>Choisir</option>{risk&&!people.some(person=>person.id===risk.ownerId)&&<option value={risk.ownerId} disabled>Ancien responsable — choisir un remplaçant</option>}{people.map(person=><option key={person.id} value={person.id}>{person.name}</option>)}</select></label><div className="risk-score-fields">{scores.map(([key,label,value])=><label key={key} className="field-label">{label}<select className="field-input" name={key} defaultValue={value||3}>{[1,2,3,4,5].map(number=><option key={number} value={number}>{number}{number===1?' · Minimum':number===5?' · Maximum':''}</option>)}</select></label>)}</div><label className="field-label">Mesures de maîtrise et justification des cotations<textarea name="controls" required rows={3} maxLength={4000} defaultValue={risk?.controls}/></label><label className="field-label">Prochaine revue<input className="field-input" type="date" name="nextReviewOn" required defaultValue={risk?.nextReviewOn}/></label>{risk&&<label className="field-label">Motif de réévaluation<textarea name="reason" rows={2} required maxLength={4000}/></label>}<div className="document-commands"><button className="button" type="submit" disabled={!people.length}>Enregistrer l’évaluation</button><button className="button button-outline" type="button" onClick={onCancel}>Fermer</button></div><p className="attachments-hint">Échelles initiales fixes de 1 à 5. La cotation résiduelle est une évaluation humaine justifiée, pas une réduction calculée automatiquement.</p></fieldset></form>;
}
