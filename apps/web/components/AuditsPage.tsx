'use client';
import { useCallback,useEffect,useRef,useState } from 'react';
import { ClipboardCheck,Plus,Search } from 'lucide-react';
import type { AuditChecklistItem,QualityAudit,QualityAuditDetail,QualityAuditList,ReportCurrency,ReportEvent,ReportSeverity,WorkspaceContext } from '@sentinelle/contracts';
import AuditReport from './AuditReport';
import { api } from '../lib/use-workspace';
const states={planned:'Planifié',in_progress:'En cours',completed:'Rapport finalisé',cancelled:'Annulé'};
const reportStates={reported:'Déclarée',in_analysis:'En analyse',action_plan:'Plan d’actions',effectiveness_review:'Vérification d’efficacité',closed:'Clôturée'};
const message=(error:unknown)=>error instanceof Error?error.message:'L’opération a échoué.';
export default function AuditsPage({context,siteName,onOpenReport}:{context:WorkspaceContext;siteName:string;onOpenReport:(id:string)=>void}) {
  const tenant=context.tenant.id;
  const [list,setList]=useState<QualityAuditList>({items:[],total:0});
  const [detail,setDetail]=useState<QualityAuditDetail|null>(null);
  const [checklist,setChecklist]=useState<AuditChecklistItem[]>([]);
  const [search,setSearch]=useState('');
  const [status,setStatus]=useState('');
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [creating,setCreating]=useState(false);
  const [editingPlan,setEditingPlan]=useState(false);
  const [showReport,setShowReport]=useState(false);
  const [history,setHistory]=useState<ReportEvent[]|null>(null);
  const [severity,setSeverity]=useState<ReportSeverity>('medium');
  const [currency,setCurrency]=useState<ReportCurrency>('EUR');
  const generation=useRef(0);
  const pending=useRef(false);
  const alive=useRef(true);
  const listGeneration=useRef(0);
  const audit=detail?.audit;
  const findings=detail?.findings||[];
  const dirty=editingPlan||(!!audit&&JSON.stringify(checklist)!==JSON.stringify(audit.checklist));
  const lead=!!audit&&audit.leadId===context.actor.id;
  const editable=!editingPlan&&lead&&['planned','in_progress'].includes(audit?.status||'');
  const name=(id:string)=>context.members.find(person=>person.id===id)?.name||'Ancien membre';
  const load=useCallback(async(signal?:AbortSignal)=>{
    const request=++listGeneration.current;
    const params=new URLSearchParams({search,limit:'100'});
    const site=context.sites.find(site=>site.name===siteName);
    if(site)params.set('siteId',site.id);
    if(status)params.set('status',status);
    const result=await api<QualityAuditList>(`audits?${params}`,tenant,{signal});
    if(alive.current&&!signal?.aborted&&request===listGeneration.current)setList(result);
  },[tenant,siteName,context.sites,search,status]);
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;generation.current++;};},[]);
  useEffect(()=>{
    if(!context.canWrite){setLoading(false);return;}
    const controller=new AbortController();setLoading(true);
    const timer=setTimeout(()=>{void load(controller.signal).catch(e=>{if(!controller.signal.aborted)setError(message(e));}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});},200);
    return()=>{clearTimeout(timer);controller.abort();};
  },[load,context.canWrite]);
  function accept(saved:QualityAuditDetail){setDetail(saved);setChecklist(saved.audit.checklist);setHistory(null);setEditingPlan(false);setShowReport(false);}
  async function open(id:string){
    if(pending.current||(dirty&&!window.confirm('Abandonner les modifications non enregistrées ?')))return;
    const request=++generation.current;setError('');setDetail(null);setHistory(null);setEditingPlan(false);setCreating(false);
    try{const result=await api<QualityAuditDetail>(`audits/${id}`,tenant);if(alive.current&&request===generation.current)accept(result);}
    catch(e){if(alive.current&&request===generation.current)setError(message(e));}
  }
  async function mutate(path:string,input:unknown,method='POST'){
    if(pending.current)return;pending.current=true;setBusy(true);setError('');const request=++generation.current;
    try{
      const result=await api<QualityAuditDetail>(path,tenant,{method,body:JSON.stringify(input)});
      if(alive.current&&request===generation.current){
        accept(result);setCreating(false);
        await load().catch(()=>{if(alive.current)setError('Enregistrement effectué. Rechargez la liste pour l’actualiser.');});
      }
    }catch(e){if(alive.current&&request===generation.current)setError(message(e));}
    finally{pending.current=false;if(alive.current)setBusy(false);}
  }
  async function decide(command:'start'|'complete'|'cancel'){
    if(!audit||busy)return;
    if(dirty){setError('Enregistrez la checklist avant de poursuivre.');return;}
    let conclusion:string|undefined;
    if(command!=='start'){
      conclusion=window.prompt(command==='complete'?'Conclusion de l’audit (le rapport sera figé, les non-conformités restent suivies séparément) :':'Motif d’annulation :')?.trim();
      if(!conclusion)return;
    }
    await mutate(`audits/${audit.id}/decisions`,{revision:audit.revision,command,...(conclusion?{conclusion}:{})});
  }
  function updateItem(id:string,patch:Partial<AuditChecklistItem>){setChecklist(items=>items.map(item=>item.id===id?{...item,...patch}:item));}
  async function showHistory(){
    if(!audit||pending.current)return;const request=generation.current;
    try{const result=await api<ReportEvent[]>(`audits/${audit.id}/history`,tenant);if(alive.current&&request===generation.current)setHistory(result);}
    catch(e){if(alive.current&&request===generation.current)setError(message(e));}
  }
  function download(){
    if(!audit?.reportSnapshot)return;
    const url=URL.createObjectURL(new Blob([JSON.stringify(audit.reportSnapshot,null,2)],{type:'application/json'}));
    const link=document.createElement('a');link.href=url;link.download=`audit-${audit.id}.json`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  if(!context.canWrite)return <div className="module-page"><h1>Audits</h1><p className="report-privacy">La préparation et la réalisation des audits sont réservées aux responsables habilités sur les sites concernés.</p></div>;
  return <div className="module-page documents-page audits-page">
    <div className="module-header"><div><div className="eyebrow">AMÉLIORATION CONTINUE</div><h1>Audits</h1><p>Planifier, documenter les preuves et suivre les écarts.</p></div><button className="button" disabled={busy} onClick={()=>{if(!dirty||window.confirm('Abandonner les modifications non enregistrées ?')){generation.current++;setCreating(true);setDetail(null);setHistory(null);setEditingPlan(false);setError('');}}}><Plus size={14}/>Planifier un audit</button></div>
    {error&&<div className="document-error" role="alert">{error} <button type="button" onClick={()=>{if(audit)void open(audit.id);else void load().catch(e=>setError(message(e)));}}>Actualiser</button></div>}
    {creating&&<AuditForm context={context} siteName={siteName} busy={busy} onCancel={()=>setCreating(false)} onSave={values=>mutate('audits',values)}/>}
    <div className="documents-layout">
      <section className="panel documents-list" aria-label="Liste des audits">
        <label className="documents-toolbar"><Search size={14}/><input aria-label="Rechercher un audit" placeholder="Titre ou référentiel…" value={search} disabled={busy} onChange={e=>setSearch(e.target.value)}/></label>
        <label className="report-filter">Statut<select value={status} disabled={busy} onChange={e=>setStatus(e.target.value)}><option value="">Tous</option>{Object.entries(states).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
        {loading?<p className="documents-empty" role="status">Chargement…</p>:list.items.length?list.items.map(item=><button type="button" disabled={busy} key={item.id} className={`document-list-item ${audit?.id===item.id?'selected':''}`} onClick={()=>void open(item.id)}><span className="document-code">{item.standard}</span><b>{item.title}</b><span className="document-list-meta">{item.siteName} · {item.startsOn}<span className={`document-status status-${item.status}`}>{states[item.status]}</span></span></button>):<p className="documents-empty">Aucun audit dans ce périmètre.</p>}
        <p className="document-list-foot">{list.items.length} sur {list.total} audits · 100 maximum affichés</p>
      </section>
      <section className="panel document-detail" aria-label="Détail de l’audit">
        {!audit?<div className="document-start"><ClipboardCheck size={30}/><h2>Du programme au constat</h2><p>Choisissez un audit ou planifiez une mission. Les écarts alimentent le registre des non-conformités et son plan d’actions.</p></div>:<>
          <div className="document-title"><div><span className="document-code">{audit.standard}</span><h2>{audit.title}</h2></div><span className={`document-status status-${audit.status}`}>{states[audit.status]}</span></div>
          <div className="report-facts"><span>Site<b>{audit.siteName}</b></span><span>Période<b>{audit.startsOn} → {audit.endsOn}</b></span><span>Responsable d’audit<b>{name(audit.leadId)}</b></span><span>Responsable audité<b>{name(audit.auditeeId)}</b></span></div>
          {editingPlan&&<AuditForm key={`${audit.id}.${audit.revision}`} context={context} siteName={siteName} initialAudit={audit} busy={busy} onCancel={()=>setEditingPlan(false)} onSave={values=>mutate(`audits/${audit.id}/plan`,{...values,revision:audit.revision},'PATCH')}/>}
          <p className="audit-scope">{audit.scope}</p>
          <p className="attachments-hint">Les questions et clauses sont figées au démarrage. Chaque résultat nécessite une preuve ou une justification. La finalisation du rapport ne clôture pas les actions correctives.</p>
          {!lead&&['planned','in_progress'].includes(audit.status)&&<p className="report-privacy">La checklist et les décisions de réalisation sont réservées à {name(audit.leadId)}.</p>}
          <form onSubmit={e=>{e.preventDefault();void mutate(`audits/${audit.id}/checklist`,{revision:audit.revision,checklist},'PATCH');}}>
            <fieldset className="audit-checklist" disabled={!editable||busy}>
              <legend>Checklist · {checklist.filter(item=>item.result!=='pending').length}/{checklist.length} évalués</legend>
              {checklist.map((item,index)=>{
                const finding=findings.find(f=>f.itemId===item.id);
                return <div className="audit-question" key={item.id}>
                  <div className="audit-question-heading"><b>Point {index+1}</b>{audit.status==='planned'&&<button className="button button-outline" type="button" onClick={()=>setChecklist(items=>items.filter(row=>row.id!==item.id))}>Retirer</button>}</div>
                  <label className="field-label">Clause<input className="field-input" required maxLength={100} value={item.clause} readOnly={audit.status!=='planned'} onChange={e=>updateItem(item.id,{clause:e.target.value})}/></label>
                  <label className="field-label">Question<textarea rows={2} required maxLength={500} value={item.question} readOnly={audit.status!=='planned'} onChange={e=>updateItem(item.id,{question:e.target.value})}/></label>
                  {audit.status!=='planned'&&<><label className="field-label">Résultat<select className="field-input" value={item.result} disabled={!!finding||!editable||busy} onChange={e=>updateItem(item.id,{result:e.target.value as AuditChecklistItem['result']})}><option value="pending">À évaluer</option><option value="conform">Conforme</option><option value="nonconform">Non conforme</option><option value="not_applicable">Non applicable</option></select></label><label className="field-label">Preuve observée / justification<textarea rows={3} maxLength={1000} value={item.evidence} onChange={e=>updateItem(item.id,{evidence:e.target.value})}/></label></>}
                </div>;
              })}
              {audit.status==='planned'&&<button type="button" className="button button-outline" disabled={checklist.length>=30} onClick={()=>setChecklist(items=>[...items,{id:crypto.randomUUID(),clause:'',question:'',result:'pending',evidence:''}])}><Plus size={13}/>Question ({checklist.length}/30)</button>}
              {editable&&<button className="button" type="submit" disabled={!dirty||busy}>Enregistrer la checklist</button>}
            </fieldset>
          </form>
          {!!findings.length&&<div className="report-linked-actions"><h3>Non-conformités issues de l’audit</h3>{findings.map(f=><div key={f.id}><span><b>Clause {audit.checklist.find(item=>item.id===f.itemId)?.clause}</b><small>{reportStates[f.reportStatus]} · {f.reportId.slice(0,8)}</small></span><button type="button" className="button button-outline" disabled={busy||dirty} onClick={()=>onOpenReport(f.reportId)}>Ouvrir le suivi</button></div>)}</div>}
          {lead&&audit.status==='in_progress'&&audit.checklist.some(item=>item.result==='nonconform'&&!findings.some(f=>f.itemId===item.id))&&<div className="audit-findings">
            <h3>Enregistrer les écarts constatés</h3><p>Enregistrez la checklist avant de créer les non-conformités.</p>
            <label className="field-label">Gravité<select className="field-input" value={severity} disabled={busy} onChange={e=>setSeverity(e.target.value as ReportSeverity)}><option value="low">Faible</option><option value="medium">Modérée</option><option value="high">Élevée</option><option value="critical">Critique</option></select></label>
            <label className="field-label">Devise du suivi des coûts<select className="field-input" value={currency} disabled={busy} onChange={e=>setCurrency(e.target.value as ReportCurrency)}>{['XOF','XAF','MAD','EUR','USD','GBP'].map(value=><option key={value}>{value}</option>)}</select></label>
            {audit.checklist.filter(item=>item.result==='nonconform'&&!findings.some(f=>f.itemId===item.id)).map(item=><button type="button" className="button button-outline" key={item.id} disabled={dirty||busy||!item.evidence.trim()} onClick={()=>{if(window.confirm(`Créer une non-conformité pour la clause ${item.clause} ?`))void mutate(`audits/${audit.id}/findings`,{revision:audit.revision,itemId:item.id,severity,currency});}}>Créer la NC · {item.clause}</button>)}
          </div>}
          {audit.conclusion&&<div className="document-decision-note"><b>{audit.status==='cancelled'?'Motif d’annulation':'Conclusion'}</b><p>{audit.conclusion}</p></div>}
          <div className="document-commands">
            {lead&&audit.status==='planned'&&<button type="button" className="button" disabled={busy||dirty||!audit.checklist.length} onClick={()=>void decide('start')}>Démarrer l’audit</button>}
            {lead&&audit.status==='in_progress'&&<button type="button" className="button" disabled={busy||dirty} onClick={()=>void decide('complete')}>Finaliser le rapport</button>}
            {audit.status==='planned'&&<button type="button" className="button button-outline" disabled={busy||dirty} onClick={()=>setEditingPlan(true)}>Modifier la planification</button>}
            {audit.status==='planned'&&<button type="button" className="button button-outline" disabled={busy||dirty} onClick={()=>void decide('cancel')}>Annuler l’audit</button>}
            {!!audit.reportSnapshot&&<button type="button" className="button button-outline" onClick={()=>setShowReport(true)}>Consulter / imprimer le rapport</button>}
            {!!audit.reportSnapshot&&<button type="button" className="button button-outline" onClick={download}>Exporter le rapport JSON</button>}
            <button type="button" className="button button-outline" disabled={busy} onClick={()=>void showHistory()}>Historique</button>
          </div>
          <p className="attachments-hint">Révision {audit.revision}{dirty?' · Modifications non enregistrées':''}{audit.completedAt?` · Finalisé le ${new Date(audit.completedAt).toLocaleString('fr-FR')}`:''}</p>
          {history&&<div className="document-history"><h3>Historique attribué</h3>{history.map(event=><div key={event.id}><b>{event.operation==='INSERT'?'Planification':event.operation==='REPLAN'?'Replanification':'Mise à jour'} · {name(event.actorId)}</b><span>{new Date(event.occurredAt).toLocaleString('fr-FR')} · Révision {String(event.after.revision)}</span><span>Statut : {states[event.after.status as keyof typeof states]||String(event.after.status)}</span>{event.operation==='REPLAN'&&<><p className="audit-history-reason">Motif : {String(event.after.replan_reason)}</p><ul>{planChanges(event).map(change=><li key={change}>{change}</li>)}</ul></>}</div>)}</div>}
        </>}
      </section>
    </div>
    {showReport&&audit?.reportSnapshot&&<AuditReport snapshot={audit.reportSnapshot} auditId={audit.id} onClose={()=>setShowReport(false)}/>}
  </div>;
}
function AuditForm({context,siteName,busy,onSave,onCancel,initialAudit}:{context:WorkspaceContext;siteName:string;busy:boolean;initialAudit?:QualityAudit;onSave:(values:Record<string,string>)=>Promise<void>;onCancel:()=>void}) {
  const initial=context.sites.find(site=>site.name===siteName)||context.sites[0];
  const [siteId,setSiteId]=useState(initialAudit?.siteId||initial?.id||'');
  const eligible=context.documentReviewers[siteId]||[];
  return <form className="panel audit-plan-form" onSubmit={e=>{e.preventDefault();const data=Object.fromEntries(new FormData(e.currentTarget).entries()) as Record<string,string>;void onSave(data);}}>
    <fieldset disabled={busy}><legend>{initialAudit?'Modifier la planification':'Nouvelle mission d’audit'}</legend>
      <label className="field-label">Titre<input name="title" defaultValue={initialAudit?.title} className="field-input" required maxLength={300}/></label>
      <label className="field-label">Référentiel et édition<input name="standard" defaultValue={initialAudit?.standard} className="field-input" required maxLength={200} placeholder="Ex. ISO 9001:2015"/></label>
      <label className="field-label">Périmètre et objectifs<textarea name="scope" defaultValue={initialAudit?.scope} required maxLength={4000} rows={3}/></label>
      {initialAudit?<p className="attachments-hint">Site : {initialAudit.siteName} · Le site ne peut pas être modifié.</p>:<label className="field-label">Site<select name="siteId" className="field-input" value={siteId} required onChange={e=>setSiteId(e.target.value)}>{context.sites.map(site=><option value={site.id} key={site.id}>{site.name}</option>)}</select></label>}
      <div className="field-pair"><label className="field-label">Début<input name="startsOn" defaultValue={initialAudit?.startsOn} className="field-input" type="date" required/></label><label className="field-label">Fin<input name="endsOn" defaultValue={initialAudit?.endsOn} className="field-input" type="date" required/></label></div>
      <div className="field-pair" key={siteId}><label className="field-label">Responsable d’audit<select name="leadId" className="field-input" defaultValue={initialAudit?.leadId||''} required><option value="" disabled>Choisir</option>{initialAudit&&!eligible.some(person=>person.id===initialAudit.leadId)&&<option value={initialAudit.leadId} disabled>Responsable non disponible — choisir un remplaçant</option>}{eligible.map(person=><option value={person.id} key={person.id}>{person.name}</option>)}</select></label><label className="field-label">Responsable audité<select name="auditeeId" className="field-input" defaultValue={initialAudit?.auditeeId||''} required><option value="" disabled>Choisir une autre personne</option>{initialAudit&&!eligible.some(person=>person.id===initialAudit.auditeeId)&&<option value={initialAudit.auditeeId} disabled>Responsable non disponible — choisir un remplaçant</option>}{eligible.map(person=><option value={person.id} key={person.id}>{person.name}</option>)}</select></label></div>
      {initialAudit&&<label className="field-label">Motif du changement<textarea name="reason" required maxLength={2000} rows={3} placeholder="Pourquoi modifier les dates, le périmètre ou les participants ?"/></label>}
      <p className="attachments-hint">Les deux responsables doivent être différents et habilités sur ce site. Les dates, participants et objectifs peuvent être modifiés avec un motif avant le démarrage. La checklist est conservée; vérifiez son adéquation au nouveau périmètre.</p>
      <div className="document-commands"><button className="button" disabled={eligible.length<2}>{initialAudit?'Enregistrer les modifications':'Enregistrer le programme'}</button><button className="button button-outline" type="button" onClick={onCancel}>Fermer</button></div>
    </fieldset>
  </form>;
}

function planChanges(event:ReportEvent):string[] {
  const labels:Record<string,string>={title:'Titre',standard:'Référentiel',scope:'Périmètre',starts_on:'Début',ends_on:'Fin',lead_id:'Responsable d’audit (ID)',auditee_id:'Responsable audité (ID)'};
  return Object.entries(labels).filter(([key])=>event.before?.[key]!==event.after[key]).map(([key,label])=>`${label} : ${String(event.before?.[key]??'—')} → ${String(event.after[key])}`);
}
