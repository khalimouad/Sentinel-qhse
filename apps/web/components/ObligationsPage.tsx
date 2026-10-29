'use client';
import { useCallback,useEffect,useRef,useState } from 'react';
import { Check,Plus,Search } from 'lucide-react';
import type { Action,ObligationActionList,Obligation,ObligationAssessmentStatus,ObligationList,ReportEvent,WorkspaceContext } from '@sentinelle/contracts';
import ActionDiscussion from './ActionDiscussion';
import { api } from '../lib/use-workspace';
const states:Record<ObligationAssessmentStatus,string>={not_assessed:'À évaluer',compliant:'Conforme selon évaluation',partial:'Partiellement conforme',noncompliant:'Non conforme',not_applicable:'Non applicable selon évaluation'};
const operations:Record<string,string>={INSERT:'Référence créée',VERIFY_SOURCE:'Référence vérifiée',ASSESS:'Évaluation enregistrée',TREATMENT:'Plan de traitement modifié',ARCHIVE:'Archivage',REOPEN:'Réouverture'};
const emptyActions:ObligationActionList={items:[],total:0,open:0};
const empty:ObligationList={items:[],total:0,unverified:0,overdue:0};
const message=(error:unknown)=>error instanceof Error?error.message:'L’opération a échoué.';
export default function ObligationsPage({context,siteName,initialObligationId,onActionsChanged}:{context:WorkspaceContext;siteName:string;initialObligationId?:string;onActionsChanged:()=>Promise<void>}) {
  const tenant=context.tenant.id;
  const [list,setList]=useState<ObligationList>(empty);
  const [detail,setDetail]=useState<Obligation|null>(null);
  const [search,setSearch]=useState('');
  const [lifecycle,setLifecycle]=useState('active');
  const [status,setStatus]=useState('');
  const [page,setPage]=useState(0);
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [creating,setCreating]=useState(false);
  const [assessing,setAssessing]=useState(false);
  const [actionForm,setActionForm]=useState(false);
  const [actionList,setActionList]=useState<ObligationActionList>(emptyActions);
  const [actionPage,setActionPage]=useState(0);
  const [actionsLoading,setActionsLoading]=useState(true);
  const [actionsError,setActionsError]=useState('');
  const [discussion,setDiscussion]=useState<Action|null>(null);
  const [history,setHistory]=useState<ReportEvent[]|null>(null);
  const alive=useRef(true);
  const pending=useRef(false);
  const generation=useRef(0);
  const listGeneration=useRef(0);
  const dirty=creating||assessing||actionForm;
  const selectedId=detail?.id;
  const selectedRevision=detail?.revision;
  const name=(id:string|null)=>context.members.find(member=>member.id===id)?.name||id||'—';
  const load=useCallback(async(signal?:AbortSignal)=>{
    const request=++listGeneration.current;
    const params=new URLSearchParams({search,lifecycle,limit:'25',offset:String(page*25)});
    const site=context.sites.find(site=>site.name===siteName);if(site)params.set('siteId',site.id);if(status)params.set('status',status);
    const result=await api<ObligationList>(`obligations?${params}`,tenant,{signal});
    if(alive.current&&!signal?.aborted&&request===listGeneration.current){setList(result);if(page>0&&page*25>=result.total)setPage(Math.max(0,Math.ceil(result.total/25)-1));}
  },[tenant,context.sites,siteName,search,lifecycle,status,page]);
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;generation.current++;};},[]);
  useEffect(()=>{
    if(!context.canWrite){setLoading(false);return;}
    const controller=new AbortController();setLoading(true);
    const timer=setTimeout(()=>{void load(controller.signal).catch(e=>{if(!controller.signal.aborted){setList(empty);setError(message(e));}}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});},200);
    return()=>{clearTimeout(timer);controller.abort();};
  },[load,context.canWrite]);
  useEffect(()=>{
    if(!selectedId)return;
    const controller=new AbortController();setActionsLoading(true);setActionsError('');
    void api<ObligationActionList>(`obligations/${selectedId}/actions?limit=25&offset=${actionPage*25}`,tenant,{signal:controller.signal})
      .then(result=>{if(!controller.signal.aborted){setActionList(result);if(actionPage>0&&actionPage*25>=result.total)setActionPage(Math.max(0,Math.ceil(result.total/25)-1));}})
      .catch(e=>{if(!controller.signal.aborted){setActionList(emptyActions);setActionsError(message(e));}})
      .finally(()=>{if(!controller.signal.aborted)setActionsLoading(false);});
    return()=>controller.abort();
  },[tenant,selectedId,selectedRevision,actionPage]);
  const fetchDetail=useCallback(async(id:string)=>{
    const request=++generation.current;setDetail(null);setHistory(null);setCreating(false);setAssessing(false);setActionForm(false);setActionList(emptyActions);setActionsLoading(true);setActionPage(0);setError('');
    try{const saved=await api<Obligation>(`obligations/${id}`,tenant);if(alive.current&&request===generation.current)setDetail(saved);}
    catch(e){if(alive.current&&request===generation.current)setError(message(e));}
  },[tenant]);
  useEffect(()=>{if(initialObligationId&&context.canWrite)void fetchDetail(initialObligationId);},[initialObligationId,context.canWrite,fetchDetail]);
  async function open(id:string){
    if(pending.current||(dirty&&!window.confirm('Abandonner la saisie non enregistrée ?')))return;
    await fetchDetail(id);
  }
  async function mutate(path:string,input:unknown,changesActions=false){
    if(pending.current)return;pending.current=true;setBusy(true);setError('');const request=++generation.current;
    try{
      const saved=await api<Obligation>(path,tenant,{method:'POST',body:JSON.stringify(input)});
      if(alive.current&&request===generation.current){setDetail(saved);setCreating(false);setAssessing(false);setActionForm(false);setActionList(emptyActions);setActionsLoading(true);setActionPage(0);setHistory(null);await load().catch(()=>{if(alive.current)setError('Enregistrement effectué. Actualisez la liste pour la recharger.');});}
      if(changesActions)await onActionsChanged().catch(()=>{if(alive.current)setError('Action enregistrée. Actualisez le plan d’actions pour le recharger.');});
    }catch(e){if(alive.current&&request===generation.current)setError(message(e));}
    finally{pending.current=false;if(alive.current)setBusy(false);}
  }
  async function decide(command:'verify_source'|'archive'|'reopen'){
    if(!detail||busy||dirty)return;
    const note=window.prompt(command==='verify_source'?'Décrivez le contrôle de la source, de la version et de l’article que vous venez d’effectuer :':command==='archive'?'Motif d’archivage de cette référence :':'Motif de réouverture (une nouvelle évaluation sera nécessaire) :')?.trim();
    if(note)await mutate(`obligations/${detail.id}/decisions`,{revision:detail.revision,command,note});
  }
  async function toggleAction(action:Action){
    if(!detail||pending.current||dirty)return;
    if(action.status==='closed'&&!window.confirm('Rouvrir cette action ? L’obligation sera remise à évaluer et réactivée si elle était archivée.'))return;
    pending.current=true;setBusy(true);setError('');const request=++generation.current;let changed=false;
    try{
      await api<Action>(`actions/${action.id}`,tenant,{method:'PATCH',body:JSON.stringify({version:action.version,status:action.status==='closed'?'open':'closed'})});changed=true;
      const saved=await api<Obligation>(`obligations/${detail.id}`,tenant);
      if(alive.current&&request===generation.current){setDetail(saved);setHistory(null);await load();}await onActionsChanged();
    }catch(e){if(alive.current&&request===generation.current)setError(changed?'Action enregistrée. Actualisez l’obligation pour vérifier son état.':message(e));}
    finally{pending.current=false;if(alive.current)setBusy(false);}
  }
  async function showHistory(){
    if(!detail||pending.current)return;const request=generation.current;
    try{const events=await api<ReportEvent[]>(`obligations/${detail.id}/history`,tenant);if(alive.current&&request===generation.current)setHistory(events);}
    catch(e){if(alive.current&&request===generation.current)setError(message(e));}
  }
  if(!context.canWrite)return <div className="module-page"><h1>Conformité</h1><p className="report-privacy">Le registre des obligations est réservé aux responsables habilités du site.</p></div>;
  return <div className="module-page documents-page obligations-page">
    <div className="module-header"><div><div className="eyebrow">RÉFÉRENCES ET ÉVALUATIONS HUMAINES</div><h1>Obligations de conformité</h1><p>Référencer les textes, vérifier leur provenance et documenter vos évaluations.</p></div><button className="button" disabled={busy} onClick={()=>{if(!dirty||window.confirm('Abandonner la saisie non enregistrée ?')){generation.current++;setDetail(null);setCreating(true);setAssessing(false);setActionForm(false);setHistory(null);setError('');}}}><Plus size={14}/>Nouvelle référence</button></div>
    <p className="report-privacy">Les références sont saisies et vérifiées par vos responsables. La veille automatique n’est pas connectée. Les évaluations portent sur les obligations enregistrées, sans garantir l’exhaustivité du référentiel applicable.</p>
    {error&&<p className="document-error" role="alert">{error} <button type="button" disabled={busy} onClick={()=>{if(detail)void open(detail.id);else void load().catch(e=>setError(message(e)));}}>Actualiser</button></p>}
    {creating&&<CreateObligationForm context={context} siteName={siteName} busy={busy} onCancel={()=>setCreating(false)} onSave={input=>mutate('obligations',input)}/>}
    <div className="documents-layout"><section className="panel documents-list" aria-label="Liste des obligations"><label className="documents-toolbar"><Search size={14}/><input aria-label="Rechercher une obligation" value={search} disabled={busy} onChange={event=>{setSearch(event.target.value);setPage(0);}} placeholder="Titre, texte ou juridiction…"/></label><label className="report-filter">État<select value={lifecycle} disabled={busy} onChange={event=>{setLifecycle(event.target.value);setPage(0);}}><option value="active">Actives</option><option value="archived">Archivées</option></select></label><label className="report-filter">Évaluation<select value={status} disabled={busy} onChange={event=>{setStatus(event.target.value);setPage(0);}}><option value="">Toutes</option>{Object.entries(states).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label><p className="document-list-foot">Dans cette vue : {list.unverified} références à vérifier · {list.overdue} revues dépassées</p>
      {loading?<p className="documents-empty" role="status">Chargement…</p>:list.items.length?list.items.map(item=><button type="button" key={item.id} disabled={busy} className={`document-list-item ${detail?.id===item.id?'selected':''}`} onClick={()=>void open(item.id)}><span className="document-code">{item.jurisdiction} · {item.siteName}</span><b>{item.title}</b><span className="document-list-meta"><span>{item.sourceStatus==='verified'?'Référence vérifiée':'Référence à vérifier'}</span><span>{states[item.assessmentStatus]}</span><span>Revue : {item.nextReviewOn}{item.reviewOverdue?' · En retard':''}</span></span></button>):<p className="documents-empty">Aucune obligation dans cette vue.</p>}
      <p className="document-list-foot">{list.total} références · Page {page+1}</p><div className="audit-list-pagination"><button type="button" className="button button-outline" disabled={busy||loading||page===0} onClick={()=>setPage(value=>value-1)}>Précédent</button><button type="button" className="button button-outline" disabled={busy||loading||(page+1)*25>=list.total} onClick={()=>setPage(value=>value+1)}>Suivant</button></div>
    </section><section className="panel document-detail" aria-label="Détail de l’obligation">{!detail?<div className="document-start"><h2>Une référence traçable avant l’évaluation</h2><p>Sélectionnez une obligation ou ajoutez une référence avec son texte, sa version et son article.</p></div>:<>
      <div className="document-title"><div><span className="document-code">{detail.jurisdiction} · {detail.siteName}</span><h2>{detail.title}</h2></div><span className="document-status">{detail.lifecycle==='archived'?'Archivée':states[detail.assessmentStatus]}</span></div><div className="report-facts"><span>Responsable<b>{name(detail.ownerId)}</b></span><span>Prochaine revue<b>{detail.nextReviewOn}{detail.reviewOverdue?' · En retard':''}</b></span><span>Créée par<b>{name(detail.createdBy)}</b></span></div>
      <section className="obligation-source"><h3>{detail.sourceTitle}</h3><p>Version : {detail.sourceVersion} · Article : {detail.article}</p><a href={detail.sourceUrl} target="_blank" rel="noopener noreferrer">{detail.sourceUrl}</a><blockquote>{detail.excerpt}</blockquote><div className="document-evidence"><span>Empreinte de la référence enregistrée</span><code>{detail.sourceSha256}</code></div><p className="attachments-hint">Le texte, la version, l’article, la juridiction et le lien sont conservés sans modification. Pour corriger une référence, archivez cette fiche et enregistrez-en une nouvelle.</p></section>
      {detail.sourceStatus==='verified'?<div className="document-decision-note"><b>Référence vérifiée par {name(detail.verifiedBy)}</b><p>{detail.verificationNote}</p><small>{detail.verifiedAt&&new Date(detail.verifiedAt).toLocaleString('fr-FR')}</small></div>:<p className="document-error">Référence non vérifiée. {detail.createdBy===context.actor.id?'Un autre responsable habilité doit contrôler la source avant toute évaluation.':'Contrôlez la source, sa version et son article avant de confirmer la vérification.'}</p>}
      {detail.assessmentNote&&<div className="obligation-assessment"><h3>{states[detail.assessmentStatus]}</h3><p>{detail.assessmentNote}</p><h4>Preuves / références du dossier</h4><p>{detail.evidenceReference}</p><small>Évalué par {name(detail.assessedBy)} · {detail.assessedAt&&new Date(detail.assessedAt).toLocaleString('fr-FR')}</small></div>}
      <div className="document-commands">{detail.lifecycle==='active'&&detail.sourceStatus==='unverified'&&detail.createdBy!==context.actor.id&&<button type="button" className="button" disabled={busy||dirty} onClick={()=>void decide('verify_source')}>Confirmer la vérification de la référence</button>}{detail.lifecycle==='active'&&detail.sourceStatus==='verified'&&<button type="button" className="button" disabled={busy||dirty||actionsLoading||!!actionsError} onClick={()=>setAssessing(true)}>Enregistrer une évaluation</button>}<button type="button" className="button button-outline" disabled={busy||dirty||(detail.lifecycle==='active'&&(actionsLoading||!!actionsError||actionList.open>0))} onClick={()=>void decide(detail.lifecycle==='active'?'archive':'reopen')}>{detail.lifecycle==='active'?'Archiver avec motif':'Rouvrir et réévaluer'}</button><button type="button" className="button button-outline" disabled={busy} onClick={()=>void showHistory()}>Historique</button></div>
      <section className="report-linked-actions"><h3>Actions de traitement · {actionList.total}<span>{actionList.open} ouvertes</span></h3><p>Une action ajoutée ou rouverte remet l’obligation à évaluer. La fin des actions ne conclut pas automatiquement à la conformité.</p>{detail.lifecycle==='active'&&detail.sourceStatus==='verified'&&<button type="button" className="button button-outline" disabled={busy||dirty||actionsLoading||!!actionsError} onClick={()=>setActionForm(true)}>Ajouter une action de traitement</button>}{actionsError&&<p className="document-error" role="alert">{actionsError} <button type="button" disabled={busy} onClick={()=>void open(detail.id)}>Actualiser</button></p>}{actionsLoading?<p role="status">Chargement des actions…</p>:!actionsError&&actionList.items.map(action=><div key={action.id}><button type="button" className={`check-action ${action.status==='closed'?'checked':''}`} disabled={busy||dirty} aria-label={action.status==='closed'?'Rouvrir l’action':'Clôturer l’action'} onClick={()=>void toggleAction(action)}>{action.status==='closed'&&<Check size={13}/>}</button><span><b>{action.title}</b><small>{action.ownerName} · {action.dueDate||'Sans échéance'}</small></span><em>{action.status==='closed'?'Clôturée':'En cours'}</em><button type="button" className="button button-outline" disabled={busy} onClick={()=>setDiscussion(action)}>Commentaires</button></div>)}{!actionsLoading&&!actionsError&&!actionList.total&&<p>Aucune action liée.</p>}<div className="document-commands"><button type="button" className="button button-outline" disabled={busy||dirty||actionsLoading||actionPage===0} onClick={()=>setActionPage(value=>value-1)}>Précédent</button><small>Page {actionPage+1}</small><button type="button" className="button button-outline" disabled={busy||dirty||actionsLoading||(actionPage+1)*25>=actionList.total} onClick={()=>setActionPage(value=>value+1)}>Suivant</button></div></section>
      {actionForm&&<ObligationTreatmentForm context={context} obligation={detail} busy={busy} onCancel={()=>setActionForm(false)} onSave={input=>mutate(`obligations/${detail.id}/actions`,{...input,revision:detail.revision},true)}/>}
      {assessing&&<AssessmentForm key={`${detail.id}.${detail.revision}`} context={context} obligation={detail} openActions={actionList.open} busy={busy} onCancel={()=>setAssessing(false)} onSave={input=>mutate(`obligations/${detail.id}/assessments`,{...input,revision:detail.revision})}/>}
      <p className="attachments-hint">Une conclusion conforme/non applicable et l’archivage exigent des actions liées terminées. Révision {detail.revision} · La vérification de la référence est distincte de l’évaluation de conformité. Aucun taux de conformité global n’est déduit de cette fiche.</p>
      {history&&<div className="document-history"><h3>Historique (100 derniers événements)</h3>{history.map(event=><div key={event.id}><b>{operations[event.operation]||event.operation} · {name(event.actorId)}</b><span>{new Date(event.occurredAt).toLocaleString('fr-FR')} · Révision {String(event.after.revision)}</span><p>{String(event.after.last_change_note||'')}</p>{event.operation==='ASSESS'&&<><span>{states[event.after.assessment_status as ObligationAssessmentStatus]}</span><p>Preuves : {String(event.after.evidence_reference||'')}</p></>}</div>)}</div>}
    </>}</section></div>
    {discussion&&<ActionDiscussion key={discussion.id} context={context} actionId={discussion.id} title={discussion.title} onClose={()=>setDiscussion(null)}/>}
  </div>;
}
function CreateObligationForm({context,siteName,busy,onSave,onCancel}:{context:WorkspaceContext;siteName:string;busy:boolean;onSave:(input:Record<string,FormDataEntryValue>)=>Promise<void>;onCancel:()=>void}) {
  const [siteId,setSiteId]=useState(context.sites.find(site=>site.name===siteName)?.id||context.sites[0]?.id||'');
  const people=context.documentReviewers[siteId]||[];
  return <form className="panel audit-plan-form" onSubmit={event=>{event.preventDefault();void onSave(Object.fromEntries(new FormData(event.currentTarget).entries()));}}><fieldset disabled={busy}><legend>Nouvelle référence à vérifier</legend><label className="field-label">Intitulé de l’obligation<input name="title" className="field-input" required maxLength={300}/></label><label className="field-label">Site<select name="siteId" className="field-input" required value={siteId} onChange={event=>setSiteId(event.target.value)}>{context.sites.map(site=><option key={site.id} value={site.id}>{site.name}</option>)}</select></label><label className="field-label">Juridiction<input name="jurisdiction" className="field-input" required minLength={2} maxLength={20} pattern="[A-Za-z][A-Za-z0-9_-]{1,19}" placeholder="Code de pays ou ensemble régional"/></label><label className="field-label">Titre du texte<input name="sourceTitle" className="field-input" required maxLength={500}/></label><label className="field-label">Version / édition / date du texte<input name="sourceVersion" className="field-input" required maxLength={200}/></label><label className="field-label">Article ou disposition<input name="article" className="field-input" required maxLength={200}/></label><label className="field-label">Lien de la source officielle<input name="sourceUrl" className="field-input" type="url" pattern="https://.+" required maxLength={2000} placeholder="https://…"/></label><label className="field-label">Extrait exact de la disposition<textarea name="excerpt" rows={5} required maxLength={8000}/></label><label className="field-label" key={siteId}>Responsable<select name="ownerId" className="field-input" required defaultValue={people.some(person=>person.id===context.actor.id)?context.actor.id:''}><option value="" disabled>Choisir</option>{people.map(person=><option key={person.id} value={person.id}>{person.name}</option>)}</select></label><label className="field-label">Prochaine revue<input name="nextReviewOn" className="field-input" type="date" required/></label><p className="attachments-hint">La référence sera enregistrée comme non vérifiée. Un autre responsable doit contrôler sa provenance avant son évaluation. Aucun texte réglementaire n’est préchargé.</p><div className="document-commands"><button type="submit" className="button" disabled={!people.length}>Enregistrer la référence</button><button type="button" className="button button-outline" onClick={onCancel}>Fermer</button></div></fieldset></form>;
}
function AssessmentForm({context,obligation,busy,onSave,onCancel,openActions}:{context:WorkspaceContext;obligation:Obligation;openActions:number;busy:boolean;onSave:(input:Record<string,FormDataEntryValue>)=>Promise<void>;onCancel:()=>void}) {
  const people=context.documentReviewers[obligation.siteId]||[];
  return <form className="obligation-assessment-form" onSubmit={event=>{event.preventDefault();void onSave(Object.fromEntries(new FormData(event.currentTarget).entries()));}}><fieldset disabled={busy}><legend>Évaluation nominative</legend><label className="field-label">Conclusion<select name="status" className="field-input" required defaultValue={obligation.assessmentStatus==='not_assessed'?'':obligation.assessmentStatus}><option value="" disabled>Choisir une conclusion</option>{Object.entries(states).filter(([value])=>value!=='not_assessed').map(([value,label])=><option key={value} value={value} disabled={openActions>0&&['compliant','not_applicable'].includes(value)}>{label}</option>)}</select></label><label className="field-label">Conclusion et justification d’applicabilité<textarea name="note" required rows={4} maxLength={4000} defaultValue={obligation.assessmentNote||''}/></label><label className="field-label">Preuves / références du dossier<textarea name="evidenceReference" required rows={3} maxLength={2000} defaultValue={obligation.evidenceReference||''}/></label><label className="field-label">Responsable<select name="ownerId" className="field-input" required defaultValue={people.some(person=>person.id===obligation.ownerId)?obligation.ownerId:''}><option value="" disabled>Choisir</option>{people.map(person=><option key={person.id} value={person.id}>{person.name}</option>)}</select></label><label className="field-label">Prochaine revue<input name="nextReviewOn" className="field-input" type="date" required defaultValue={obligation.nextReviewOn}/></label><p className="attachments-hint">Évaluateur : {context.actor.name}. Cette décision et ses preuves référencées seront conservées dans l’historique. Une non-applicabilité doit être motivée.</p><div className="document-commands"><button type="submit" className="button" disabled={!people.length}>Enregistrer l’évaluation</button><button type="button" className="button button-outline" onClick={onCancel}>Fermer</button></div></fieldset></form>;
}

function ObligationTreatmentForm({context,obligation,busy,onCancel,onSave}:{context:WorkspaceContext;obligation:Obligation;busy:boolean;onCancel:()=>void;onSave:(input:Record<string,FormDataEntryValue>)=>Promise<void>}) {
  const people=context.documentReviewers[obligation.siteId]||[];
  return <form className="obligation-assessment-form" onSubmit={event=>{event.preventDefault();const values=Object.fromEntries(new FormData(event.currentTarget).entries());if(!values.dueDate)delete values.dueDate;void onSave(values);}}><fieldset disabled={busy}><legend>Nouvelle action de traitement</legend><label className="field-label">Intitulé<input name="title" className="field-input" required maxLength={500}/></label><label className="field-label">Responsable<select name="ownerId" className="field-input" required defaultValue={people.some(person=>person.id===obligation.ownerId)?obligation.ownerId:''}><option value="" disabled>Choisir</option>{people.map(person=><option key={person.id} value={person.id}>{person.name}</option>)}</select></label><label className="field-label">Priorité<select name="priority" className="field-input"><option value="normal">Normale</option><option value="high">Haute</option></select></label><label className="field-label">Échéance<input name="dueDate" className="field-input" type="date"/></label><p className="attachments-hint">L’ajout remet l’évaluation courante à « À évaluer ». La décision précédente restera dans l’historique.</p><div className="document-commands"><button type="submit" className="button" disabled={!people.length}>Créer l’action</button><button type="button" className="button button-outline" onClick={onCancel}>Fermer</button></div></fieldset></form>;
}
