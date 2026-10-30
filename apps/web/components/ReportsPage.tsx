'use client';
import { useCallback,useEffect,useRef,useState } from 'react';
import { Check,Clock3,Plus,Search,ShieldCheck,X } from 'lucide-react';
import type { Action,Report,ReportCommand,ReportDetail,ReportEvent,ReportKind,ReportStatus,WorkspaceContext } from '@sentinelle/contracts';
import { api } from '../lib/use-workspace';
import AttachmentsPanel from './AttachmentsPanel';
import ActionDiscussion from './ActionDiscussion';
import { downloadRegisterCsv } from '../lib/register-csv.mjs';

const kinds:Record<ReportKind,string>={ incident:'Incident',near_miss:'Presque-accident',nonconformity:'Non-conformité',complaint:'Réclamation' };
const causeFamilies=[['people','Main-d’œuvre'],['methods','Méthodes'],['machines','Machines'],['materials','Matières'],['environment','Milieu'],['measurement','Mesures']] as const;
const states:Record<ReportStatus,string>={ reported:'Déclaré',in_analysis:'En analyse',action_plan:'Plan d’actions',effectiveness_review:'Vérification d’efficacité',closed:'Clôturé' };
const severities={ low:'Faible',medium:'Modérée',high:'Élevée',critical:'Critique' };
const errorMessage=(e:unknown)=>e instanceof Error ? e.message : 'L’opération a échoué.';
export default function ReportsPage({ context,siteName,onActionsChanged,initialReportId }: { context:WorkspaceContext;siteName:string;onActionsChanged:()=>Promise<void>;initialReportId?:string }) {
  const tenant=context.tenant.id;
  const [reports,setReports]=useState<Report[]>([]);
  const [page,setPage]=useState(0);
  const [total,setTotal]=useState(0);
  const [detail,setDetail]=useState<ReportDetail|null>(null);
  const [search,setSearch]=useState('');
  const [status,setStatus]=useState('');
  const [loading,setLoading]=useState(true);
  const [pending,setPending]=useState(false);
  const [fileBusy,setFileBusy]=useState(false);
  const [analysisDirty,setAnalysisDirty]=useState(false);
  const [error,setError]=useState('');
  const [form,setForm]=useState<'report'|'action'|null>(null);
  const [history,setHistory]=useState<ReportEvent[]|null>(null);
  const [discussion,setDiscussion]=useState<{id:string;title:string}|null>(null);
  const selection=useRef(0);
  const listScope=useRef('');
  listScope.current=`${tenant}|${siteName}|${search}|${status}|${page}`;
  const report=detail?.report;
  const name=(id:string|null)=>context.members.find(member=>member.id===id)?.name || 'À désigner';
  const eligible=report ? context.documentReviewers[report.siteId] || [] : [];
  const loadList=useCallback(async(signal?:AbortSignal)=>{
    const scope=`${tenant}|${siteName}|${search}|${status}|${page}`;
    const params=new URLSearchParams({ search,limit:'25',offset:String(page*25) });
    const site=context.sites.find(item=>item.name===siteName);
    if(site) params.set('siteId',site.id);
    if(status) params.set('status',status);
    const result=await api<{ items:Report[];total:number }>(`reports?${params}`,tenant,{ signal });
    if(!signal?.aborted&&listScope.current===scope) {setReports(result.items);setTotal(result.total);if(page>0&&page*25>=result.total)setPage(Math.max(0,Math.ceil(result.total/25)-1));}
  },[tenant,context.sites,siteName,search,status,page]);
  useEffect(()=>{
    const controller=new AbortController(); setLoading(true); setError('');
    const timer=setTimeout(()=>{ void loadList(controller.signal).catch(e=>{if(!controller.signal.aborted) setError(errorMessage(e));}).finally(()=>{if(!controller.signal.aborted) setLoading(false);}); },200);
    return()=>{clearTimeout(timer);controller.abort();};
  },[loadList]);
  useEffect(()=>{selection.current++;setDetail(null);setHistory(null);setForm(null);setAnalysisDirty(false);setDiscussion(null);setPage(0);},[siteName]);
  useEffect(()=>()=>{selection.current++;},[]);
  const openReport=useCallback(async(id:string)=>{
    const request=++selection.current;setError('');setHistory(null);setDetail(null);setAnalysisDirty(false);
    try{const saved=await api<ReportDetail>(`reports/${id}`,tenant);if(request===selection.current) setDetail(saved);}
    catch(e){if(request===selection.current) setError(errorMessage(e));}
  },[tenant]);
  useEffect(()=>{if(initialReportId)void openReport(initialReportId);},[initialReportId,openReport]);
  async function mutate(path:string,input:unknown,method='POST',changesActions=false){
    if(pending||fileBusy)return;const request=++selection.current;setPending(true);setError('');
    try{
      const saved=await api<ReportDetail>(path,tenant,{method,body:JSON.stringify(input)});
      if(request===selection.current){
        setDetail(saved);setForm(null);setHistory(null);setAnalysisDirty(false);
        await loadList().catch(()=>setError('Enregistrement effectué. Actualisez la liste pour la recharger.'));
      }
      if(changesActions)await onActionsChanged().catch(()=>{if(request===selection.current)setError('Action enregistrée. Actualisez le plan d’actions pour le recharger.');});
    }catch(e){
      if(request!==selection.current)return;
      if(report){try{const refreshed=await api<ReportDetail>(`reports/${report.id}`,tenant);if(request===selection.current)setDetail(refreshed);}catch{}}
      if(request===selection.current)setError(errorMessage(e));
    }finally{setPending(false);}
  }
  async function decide(command:ReportCommand){
    if(!report||pending||fileBusy)return;
    if(analysisDirty){setError('Enregistrez l’analyse avant de poursuivre.');return;}
    let note:string|undefined;
    if(['close','return_for_action','reopen'].includes(command)){
      note=window.prompt(command==='close'?'Décrivez les preuves et résultats confirmant l’efficacité des actions :':command==='return_for_action'?'Pourquoi les actions ne sont-elles pas efficaces ?':'Motif de réouverture :')?.trim();
      if(!note)return;
    }else if(!window.confirm('Confirmer le passage à l’étape suivante ?'))return;
    await mutate(`reports/${report.id}/decisions`,{revision:report.revision,command,...(note?{note}:{})});
  }
  async function toggleAction(action:Action){
    if(!report||pending||fileBusy||analysisDirty)return;
    if(action.status==='closed'&&!window.confirm('Rouvrir cette action ? Cela réouvrira aussi le signalement s’il est clôturé ou en vérification.'))return;
    const request=++selection.current;let changed=false;setPending(true);setError('');
    try{
      await api<Action>(`actions/${action.id}`,tenant,{method:'PATCH',body:JSON.stringify({version:action.version,status:action.status==='open'?'closed':'open'})});
      changed=true;const refreshed=await api<ReportDetail>(`reports/${report.id}`,tenant);
      if(request===selection.current){setDetail(refreshed);setHistory(null);await loadList();}await onActionsChanged();
    }catch(e){if(request===selection.current){try{const refreshed=await api<ReportDetail>(`reports/${report.id}`,tenant);if(request===selection.current)setDetail(refreshed);}catch{}if(request===selection.current)setError(changed?'Action enregistrée. Actualisez les données pour vérifier son statut.':errorMessage(e));}}
    finally{setPending(false);}
  }
  async function refreshFiles(){
    if(!report)return;const request=selection.current;
    const saved=await api<ReportDetail>(`reports/${report.id}`,tenant);
    if(request===selection.current){setDetail(saved);setHistory(null);await loadList();}
  }
  async function exportFiltered(){
    setPending(true);setError('');
    try{const params=new URLSearchParams({search});const site=context.sites.find(item=>item.name===siteName);if(site)params.set('siteId',site.id);if(status)params.set('status',status);
      const result=await api<{items:Report[];total:number}>(`reports/export?${params}`,tenant);downloadRegisterCsv('reports',result.items);
    }catch(e){setError(errorMessage(e));}finally{setPending(false);}
  }
  return <div className="module-page reports-page">
    <div className="module-header"><div><div className="eyebrow"><span className="live-dot"/> SOCLE COMMUN · AMÉLIORATION CONTINUE</div><h1>Incidents & non-conformités</h1><p className="welcome-sub">Déclarer, comprendre les causes, agir et vérifier l’efficacité.</p></div><button className="button button-primary" disabled={pending||fileBusy||!context.sites.length} onClick={()=>{setForm('report');setError('');}}><Plus size={15}/> Déclarer</button></div>
    {!context.canWrite&&<p className="report-privacy">Vous pouvez déclarer un événement et suivre vos propres signalements. Les responsables habilités traitent leur analyse et leur clôture.</p>}
    {fileBusy&&<p className="attachments-progress" role="status">Une opération sur les pièces jointes est en cours.</p>}
    {error&&<p className="document-error" role="alert">{error}</p>}
    <button type="button" className="button button-outline" disabled={loading||pending||fileBusy||!total} onClick={()=>void exportFiltered()}>Exporter les signalements filtrés · CSV</button>
    <div className="documents-layout">
      <section className="panel documents-list" aria-label="Liste des signalements"><div className="documents-toolbar"><Search size={15}/><input aria-label="Rechercher un signalement" value={search} onChange={e=>{setSearch(e.target.value);setPage(0);}} placeholder="Rechercher un titre"/></div><label className="report-filter">Statut<select value={status} onChange={e=>{setStatus(e.target.value);setPage(0);}}><option value="">Tous</option>{Object.entries(states).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
        {loading?<p className="documents-empty" role="status">Chargement…</p>:reports.length?reports.map(item=><button key={item.id} disabled={pending||fileBusy} className={`document-list-item ${report?.id===item.id?'selected':''}`} onClick={()=>void openReport(item.id)}><span className="document-code">{kinds[item.kind]} · {severities[item.severity]}</span><b>{item.title}</b><span className="document-list-meta"><span>{item.siteName}</span><span className={`document-status ${item.status==='closed'?'status-published':''}`}>{states[item.status]}</span></span></button>):<p className="documents-empty">Aucun signalement accessible dans ce périmètre.</p>}<div className="pagination"><span>{total} signalement(s) · page {page+1} sur {Math.max(1,Math.ceil(total/25))}</span><button type="button" className="button button-outline" disabled={loading||pending||fileBusy||page===0} onClick={()=>setPage(value=>value-1)}>Précédent</button><button type="button" className="button button-outline" disabled={loading||pending||fileBusy||(page+1)*25>=total} onClick={()=>setPage(value=>value+1)}>Suivant</button></div>
      </section>
      <section className="panel document-detail" aria-label="Détail du signalement">
        {!report||!detail?<div className="document-start"><ShieldCheck size={32}/><h2>De la déclaration à la prévention</h2><p>Déclarez un événement ou sélectionnez un signalement pour suivre son traitement.</p><div className="document-flow">Déclaration → Analyse → Actions → Efficacité → Clôture</div></div>:<>
          <div className="document-title"><div><span className="section-kicker">{kinds[report.kind]} · {report.siteName}</span><h2>{report.title}</h2></div><span className={`document-status ${report.status==='closed'?'status-published':''}`}>{states[report.status]}</span></div>
          <div className="report-facts"><span>Survenu le <b>{new Date(report.occurredAt).toLocaleString('fr-FR')}</b></span><span>Déclaré par <b>{name(report.reportedBy)}</b></span><span>Gravité <b>{severities[report.severity]}</b></span></div><p className="document-content">{report.description}</p>
          {context.canWrite&&['reported','in_analysis','action_plan'].includes(report.status)?<form key={`${report.id}-${report.revision}`} className="report-analysis" onChange={()=>setAnalysisDirty(true)} onSubmit={e=>{
            e.preventDefault();const values=new FormData(e.currentTarget);
            void mutate(`reports/${report.id}/analysis`,{revision:report.revision,ownerId:String(values.get('ownerId')),verifierId:String(values.get('verifierId')),correction:String(values.get('correction')),rootCause:String(values.get('rootCause')),fiveWhys:values.getAll('why').map(String).map(value=>value.trim()).filter(Boolean),ishikawa:Object.fromEntries(causeFamilies.map(([key])=>[key,String(values.get(`cause-${key}`)||'').trim()])),costAmount:String(values.get('costAmount')),currency:String(values.get('currency'))},'PATCH');
          }}><fieldset disabled={pending||fileBusy}><h3>Analyse & traitement</h3><div className="field-pair"><label className="field-label">Responsable<select name="ownerId" defaultValue={report.ownerId||''} required><option value="" disabled>Choisir</option>{eligible.map(member=><option key={member.id} value={member.id}>{member.name}</option>)}</select></label><label className="field-label">Vérificateur d’efficacité<select name="verifierId" defaultValue={report.verifierId||''} required><option value="" disabled>Choisir une autre personne</option>{eligible.map(member=><option key={member.id} value={member.id}>{member.name}</option>)}</select></label></div>
            <label className="field-label">Correction immédiate<textarea name="correction" maxLength={4000} rows={3} defaultValue={report.correction}/></label><details className="report-whys"><summary>Analyse des causes : les 5 pourquoi</summary>{Array.from({length:5},(_,i)=><label key={i} className="field-label">Pourquoi {i+1} ?<input name="why" maxLength={1000} defaultValue={report.fiveWhys[i]||''}/></label>)}</details><details className="report-whys"><summary>Analyse Ishikawa · 6 familles de causes</summary>{causeFamilies.map(([key,label])=><label key={key} className="field-label">{label}<textarea name={`cause-${key}`} maxLength={1000} rows={2} defaultValue={report.ishikawa?.[key]||''}/></label>)}</details><label className="field-label">Cause racine retenue<textarea name="rootCause" maxLength={4000} rows={3} defaultValue={report.rootCause}/></label>
            <div className="field-pair"><label className="field-label">Coût de non-qualité<input name="costAmount" inputMode="decimal" required pattern="[0-9]{1,12}([.][0-9]{1,2})?" defaultValue={report.costAmount}/></label><label className="field-label">Devise<select name="currency" defaultValue={report.currency}>{['XOF','XAF','MAD','EUR','USD','GBP'].map(currency=><option key={currency}>{currency}</option>)}</select></label></div><button className="button" disabled={pending||fileBusy}>Enregistrer l’analyse</button></fieldset>
          </form>:<div className="report-read-analysis"><h3>Analyse & traitement</h3><p><b>Responsable :</b> {name(report.ownerId)} · <b>Vérificateur :</b> {name(report.verifierId)}</p><h4>Correction immédiate</h4><p>{report.correction||'À renseigner'}</p><h4>Cause racine</h4><p>{report.rootCause||'Analyse en cours'}</p>{report.fiveWhys.length>0&&<ol>{report.fiveWhys.map((why,i)=><li key={i}>{why}</li>)}</ol>}<h4>Analyse Ishikawa</h4><ul>{causeFamilies.filter(([key])=>report.ishikawa?.[key]).map(([key,label])=><li key={key}><b>{label} :</b> {report.ishikawa[key]}</li>)}</ul><p><b>Coût de non-qualité :</b> {report.costAmount} {report.currency}</p></div>}
          <AttachmentsPanel key={report.id} tenantId={tenant} parentType="report" parentId={report.id} disabled={pending||analysisDirty} onChanged={refreshFiles} onBusyChange={setFileBusy}/>
          {analysisDirty&&<p className="attachments-hint">Enregistrez l’analyse avant de gérer les pièces jointes ou de poursuivre le traitement.</p>}
          <div className="document-commands">
            {context.canWrite&&report.status==='reported'&&<button className="button button-primary" disabled={pending||fileBusy||analysisDirty||!report.ownerId||!report.verifierId} onClick={()=>void decide('start_analysis')}>Démarrer l’analyse</button>}
            {context.canWrite&&report.status==='in_analysis'&&<button className="button button-primary" disabled={pending||fileBusy||analysisDirty||!report.rootCause||!report.correction} onClick={()=>void decide('plan_actions')}>Ouvrir le plan d’actions</button>}
            {context.canWrite&&report.status==='action_plan'&&<><button className="button" disabled={pending||fileBusy||analysisDirty} onClick={()=>{setForm('action');setError('');}}><Plus size={14}/> Action corrective</button><button className="button button-primary" disabled={pending||fileBusy||analysisDirty||!detail.actions.length||detail.actions.some(action=>action.status!=='closed')} onClick={()=>void decide('request_review')}>Demander la vérification d’efficacité</button></>}
            {context.canWrite&&report.status==='effectiveness_review'&&report.verifierId===context.actor.id&&<><button className="button" disabled={pending||fileBusy} onClick={()=>void decide('return_for_action')}>Actions non efficaces</button><button className="button button-primary" disabled={pending||fileBusy} onClick={()=>void decide('close')}><ShieldCheck size={14}/> Confirmer l’efficacité et clôturer</button></>}
            {context.canWrite&&report.status==='closed'&&<button className="button" disabled={pending||fileBusy} onClick={()=>void decide('reopen')}>Rouvrir le signalement</button>}
            <button className="button" disabled={pending||fileBusy} onClick={()=>{const request=selection.current;void api<ReportEvent[]>(`reports/${report.id}/history`,tenant).then(events=>{if(request===selection.current)setHistory(events);}).catch(e=>{if(request===selection.current)setError(errorMessage(e));});}}><Clock3 size={14}/> Historique</button>
          </div>
          <section className="report-linked-actions"><h3>Actions liées au plan unique <span>{detail.actions.length}</span></h3>{detail.actions.length?detail.actions.map(action=><div key={action.id}><button className={`check-action ${action.status==='closed'?'checked':''}`} disabled={!context.canWrite||pending||fileBusy||analysisDirty} aria-label={action.status==='open'?'Clôturer l’action':'Rouvrir l’action'} onClick={()=>void toggleAction(action)}>{action.status==='closed'&&<Check size={13}/>}</button><span><b>{action.title}</b><small>{action.ownerName} · {action.dueDate||'Échéance non définie'}</small></span><em>{action.status==='closed'?'Clôturée':'En cours'}</em><button type="button" className="button button-outline" disabled={pending||fileBusy} onClick={()=>setDiscussion({id:action.id,title:action.title})}>Commentaires</button></div>):<p>Aucune action corrective liée pour le moment.</p>}</section>
          {report.effectivenessNote&&<div className="document-decision-note"><b>{report.effectiveness==='effective'?'Efficacité confirmée':'Efficacité non démontrée'}</b><p>{report.effectivenessNote}</p><small>{name(report.reviewedBy)} · {report.reviewedAt&&new Date(report.reviewedAt).toLocaleString('fr-FR')}</small></div>}
          <div className="document-evidence"><span>Empreinte des pièces jointes</span><code>{report.attachmentsSha256}</code></div>
          {history&&<div className="document-history"><h3>Historique du signalement</h3>{history.map(event=><div key={event.id}><b>{event.operation==='INSERT'?'Signalement déclaré':String(event.after.last_change_note||'Traitement mis à jour')}</b><span>{name(event.actorId)} · {new Date(event.occurredAt).toLocaleString('fr-FR')}</span></div>)}</div>}
        </>}
      </section>
    </div>
    {discussion&&<ActionDiscussion key={discussion.id} context={context} actionId={discussion.id} title={discussion.title} onClose={()=>setDiscussion(null)}/>}
    {form&&<div className="modal-backdrop"><form className="modal document-form" role="dialog" aria-modal="true" aria-labelledby="report-form-title" onSubmit={e=>{
      e.preventDefault();const values=new FormData(e.currentTarget);
      if(form==='report')void mutate('reports',{title:String(values.get('title')),description:String(values.get('description')),siteId:String(values.get('siteId')),kind:String(values.get('kind')),severity:String(values.get('severity')),occurredAt:new Date(String(values.get('occurredAt'))).toISOString(),correction:String(values.get('correction')),currency:String(values.get('currency'))});
      else if(report)void mutate(`reports/${report.id}/actions`,{revision:report.revision,title:String(values.get('title')),ownerId:String(values.get('ownerId')),priority:String(values.get('priority')),...(values.get('dueDate')?{dueDate:String(values.get('dueDate'))}:{})},'POST',true);
    }}><button type="button" className="modal-close" disabled={pending||fileBusy} aria-label="Fermer" onClick={()=>setForm(null)}><X size={18}/></button><div className="section-kicker">AMÉLIORATION CONTINUE</div><h2 id="report-form-title">{form==='report'?'Déclarer un événement':'Créer une action corrective'}</h2>{error&&<p className="document-error" role="alert">{error}</p>}<label className="field-label">Intitulé<input name="title" required maxLength={form==='report'?300:500}/></label>
      {form==='report'?<><div className="field-pair"><label className="field-label">Nature<select name="kind" defaultValue="nonconformity">{Object.entries(kinds).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label><label className="field-label">Gravité<select name="severity" defaultValue="medium">{Object.entries(severities).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label></div><label className="field-label">Site<select name="siteId" required defaultValue={context.sites.find(site=>site.name===siteName)?.id||context.sites[0]?.id}>{context.sites.map(site=><option key={site.id} value={site.id}>{site.name}</option>)}</select></label><label className="field-label">Date et heure de survenue<input type="datetime-local" name="occurredAt" required/></label><label className="field-label">Description factuelle<textarea name="description" required maxLength={10000} rows={5}/></label><label className="field-label">Premières mesures prises<textarea name="correction" maxLength={4000} rows={3}/></label><label className="field-label">Devise du suivi de coût<select name="currency" defaultValue="XOF">{['XOF','XAF','MAD','EUR','USD','GBP'].map(currency=><option key={currency}>{currency}</option>)}</select></label></>:<><label className="field-label">Responsable<select name="ownerId" required defaultValue={report?.ownerId||''}>{eligible.map(member=><option key={member.id} value={member.id}>{member.name}</option>)}</select></label><div className="field-pair"><label className="field-label">Priorité<select name="priority"><option value="normal">Normale</option><option value="high">Haute</option></select></label><label className="field-label">Échéance<input name="dueDate" type="date"/></label></div></>}
      <div className="modal-actions"><button className="button" type="button" disabled={pending||fileBusy} onClick={()=>setForm(null)}>Annuler</button><button className="button button-primary" disabled={pending||fileBusy}>{pending?'Enregistrement…':form==='report'?'Déclarer':'Créer l’action'}</button></div>
    </form></div>}
  </div>;
}
