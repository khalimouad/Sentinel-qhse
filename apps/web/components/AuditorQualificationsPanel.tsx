'use client';
import { useCallback,useEffect,useRef,useState } from 'react';
import type { AuditorQualification,AuditorQualificationList,QualityAudit,WorkspaceContext } from '@sentinelle/contracts';
import { api } from '../lib/use-workspace';
const statuses={valid:'Valide',future:'À venir',expired:'Expirée',revoked:'Révoquée'};
export default function AuditorQualificationsPanel({context,siteName,audit,disabled,onClose,onBusyChange,onDraftChange,onChanged}:{
  context:WorkspaceContext;siteName:string;audit?:QualityAudit;disabled:boolean;
  onClose:()=>void;onBusyChange:(busy:boolean)=>void;onDraftChange:(dirty:boolean)=>void;onChanged:()=>Promise<void>;
}) {
  const [siteId,setSiteId]=useState(audit?.siteId||context.sites.find(site=>site.name===siteName)?.id||context.sites[0]?.id||'');
  const [standard,setStandard]=useState(audit?.standard||'');
  const [person,setPerson]=useState(audit?.leadId||'');
  const [page,setPage]=useState(0);
  const [data,setData]=useState<AuditorQualificationList>({items:[],total:0});
  const [loading,setLoading]=useState(true);
  const [editing,setEditing]=useState(false);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const alive=useRef(true);
  const pending=useRef(false);
  const generation=useRef(0);
  const busy=disabled||saving;
  const name=(id:string)=>context.members.find(person=>person.id===id)?.name||id;
  const candidates=(context.documentReviewers[siteId]||[]).filter(person=>person.id!==context.actor.id);
  const load=useCallback(async(signal?:AbortSignal)=>{
    if(!siteId)return;const request=++generation.current;
    const params=new URLSearchParams({siteId,standard,limit:'20',offset:String(page*20)});if(person)params.set('userId',person);
    const result=await api<AuditorQualificationList>(`auditor-qualifications?${params}`,context.tenant.id,{signal});
    if(alive.current&&!signal?.aborted&&request===generation.current){setData(result);if(page>0&&page*20>=result.total)setPage(Math.max(0,Math.ceil(result.total/20)-1));}
  },[siteId,standard,person,page,context.tenant.id]);
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;generation.current++;};},[]);
  useEffect(()=>{onDraftChange(editing);return()=>onDraftChange(false);},[editing,onDraftChange]);
  useEffect(()=>{
    const controller=new AbortController();setLoading(true);
    const timer=setTimeout(()=>{void load(controller.signal).catch(e=>{if(!controller.signal.aborted)setError(e instanceof Error?e.message:'Chargement impossible.');}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});},200);
    return()=>{clearTimeout(timer);controller.abort();};
  },[load]);
  async function mutate(path:string,input:unknown){
    if(pending.current||busy)return;pending.current=true;setSaving(true);onBusyChange(true);setError('');setNotice('');
    try{
      await api<AuditorQualification>(path,context.tenant.id,{method:'POST',body:JSON.stringify(input)});
      if(alive.current){setEditing(false);setNotice('Enregistrement effectué.');await Promise.all([load(),onChanged()]).catch(()=>{if(alive.current)setError('Enregistrement effectué. Actualisez le registre et l’audit pour recharger leur état.');});}
    }catch(e){if(alive.current)setError(e instanceof Error?e.message:'Enregistrement impossible.');}
    finally{pending.current=false;onBusyChange(false);if(alive.current)setSaving(false);}
  }
  async function revoke(qualification:AuditorQualification){
    const reason=window.prompt('Motif de révocation (conservé dans le registre) :')?.trim();if(!reason)return;
    await mutate(`auditor-qualifications/${qualification.id}/revocations`,{reason});
  }
  return <section className="panel audit-template-panel" aria-label="Registre de qualification des auditeurs">
    <div className="audit-template-heading"><h2>Qualification des auditeurs</h2><button className="button button-outline" type="button" disabled={busy} onClick={()=>{if(!editing||window.confirm('Abandonner la saisie de qualification ?'))onClose();}}>Fermer</button></div>
    <p className="attachments-hint">Évaluation interne nominative, par site et référentiel/édition exacts. L’évaluateur doit être une autre personne habilitée. L’enregistrement ne vérifie pas automatiquement l’authenticité d’un certificat. Une révocation bloque les prochains démarrages ; les audits déjà démarrés conservent leur preuve initiale.</p>
    <div className="audit-template-filters"><label className="field-label">Site<select className="field-input" disabled={busy||editing||!!audit} value={siteId} onChange={e=>{setSiteId(e.target.value);setPerson('');setPage(0);}}>{context.sites.map(site=><option key={site.id} value={site.id}>{site.name}</option>)}</select></label><label className="field-label">Auditeur<select className="field-input" disabled={busy||editing} value={person} onChange={e=>{setPerson(e.target.value);setPage(0);}}><option value="">Tous</option>{context.members.map(member=><option key={member.id} value={member.id}>{member.name}</option>)}</select></label><label className="field-label">Référentiel exact<input className="field-input" maxLength={200} disabled={busy||editing||!!audit} value={standard} onChange={e=>{setStandard(e.target.value);setPage(0);}} placeholder="Tous les référentiels"/></label><button className="button" type="button" disabled={busy||editing||!siteId} onClick={()=>{setEditing(true);setNotice('');setError('');}}>Enregistrer une qualification</button></div>
    {audit&&<p className="attachments-hint">Pour démarrer cet audit, la qualification de {name(audit.leadId)} doit couvrir {audit.startsOn} → {audit.endsOn} et être valide à la date UTC du démarrage.</p>}
    {error&&<p className="document-error" role="alert">{error}</p>}{notice&&<p className="report-privacy" role="status">{notice}</p>}
    {editing&&<form className="audit-template-editor" onSubmit={event=>{event.preventDefault();const values=Object.fromEntries(new FormData(event.currentTarget).entries());void mutate('auditor-qualifications',{...values,siteId});}}><fieldset disabled={busy}><legend>Évaluation et justificatif</legend>
      <label className="field-label">Auditeur évalué<select className="field-input" name="userId" required defaultValue={candidates.some(candidate=>candidate.id===person)?person:''}><option value="" disabled>Choisir une autre personne</option>{candidates.map(candidate=><option value={candidate.id} key={candidate.id}>{candidate.name}</option>)}</select></label>
      <label className="field-label">Référentiel et édition<input className="field-input" name="standard" required maxLength={200} defaultValue={audit?.standard||standard}/></label>
      <div className="field-pair"><label className="field-label">Valide à partir du<input className="field-input" name="validFrom" type="date" required/></label><label className="field-label">Valide jusqu’au (inclus)<input className="field-input" name="validUntil" type="date" required/></label></div>
      <label className="field-label">Référence du justificatif<input className="field-input" name="evidenceReference" required maxLength={500} placeholder="Référence du certificat, dossier de formation ou évaluation"/></label>
      <label className="field-label">Conclusion de l’évaluation<textarea name="assessment" required rows={3} maxLength={4000}/></label>
      <p className="attachments-hint">Évaluateur : {context.actor.name}. L’évaluation sera conservée. Une correction nécessite sa révocation motivée puis un nouvel enregistrement.</p>
      {!candidates.length&&<p className="document-error">Aucun autre responsable habilité pour ce site.</p>}
      <div className="document-commands"><button className="button" disabled={!candidates.length} type="submit">Enregistrer l’évaluation</button><button className="button button-outline" type="button" onClick={()=>{if(window.confirm('Abandonner cette saisie ?'))setEditing(false);}}>Abandonner</button></div>
    </fieldset></form>}
    {loading?<p role="status" className="attachments-hint">Chargement du registre…</p>:<ul className="auditor-qualification-list">{data.items.map(qualification=><li key={qualification.id}><div className="audit-template-heading"><h3>{name(qualification.userId)} · {qualification.standard}</h3><span className={`document-status qualification-${qualification.status}`}>{statuses[qualification.status]}</span></div><p>Validité : {qualification.validFrom} → {qualification.validUntil}</p><p>Évalué par {name(qualification.assessedBy)} · {new Date(qualification.createdAt).toLocaleString('fr-FR')}</p><p>Justificatif : {qualification.evidenceReference}</p><details><summary>Évaluation et traçabilité</summary><p>{qualification.assessment}</p><small>ID : {qualification.id}</small>{qualification.revokedAt&&<p>Révoquée par {qualification.revokedBy?name(qualification.revokedBy):'—'} le {new Date(qualification.revokedAt).toLocaleString('fr-FR')}<br/>Motif : {qualification.revocationReason}</p>}</details>{!qualification.revokedAt&&<button className="button button-outline" type="button" disabled={busy||editing} onClick={()=>void revoke(qualification)}>Révoquer avec motif</button>}</li>)}{!data.items.length&&<li>Aucune qualification dans ce périmètre.</li>}</ul>}
    <div className="document-commands"><button className="button button-outline" type="button" disabled={busy||loading||page===0} onClick={()=>setPage(value=>value-1)}>Précédent</button><span className="attachments-hint">{data.total} évaluations · Page {page+1}</span><button className="button button-outline" type="button" disabled={busy||loading||(page+1)*20>=data.total} onClick={()=>setPage(value=>value+1)}>Suivant</button><button className="button button-outline" type="button" disabled={busy} onClick={()=>{void Promise.all([load(),onChanged()]).catch(e=>setError(e instanceof Error?e.message:'Actualisation impossible.'));}}>Actualiser</button></div>
  </section>;
}
