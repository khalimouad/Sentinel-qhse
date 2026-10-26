'use client';
import { useCallback,useEffect,useRef,useState } from 'react';
import type { AuditTemplate,AuditTemplateList,QualityAudit,WorkspaceContext } from '@sentinelle/contracts';
import { api } from '../lib/use-workspace';
type Question={key:string;clause:string;question:string};
type Draft={source:AuditTemplate|null;code:string;title:string;standard:string;note:string;questions:Question[]};
const errorText=(error:unknown)=>error instanceof Error?error.message:'L’opération a échoué.';
export default function AuditTemplatesPanel({context,siteName,audit,disabled,allowApply,onApply,onClose,onBusyChange,onDraftChange}:{
  context:WorkspaceContext;siteName:string;audit?:QualityAudit;disabled:boolean;allowApply:boolean;
  onApply:(templateId:string,replace:boolean)=>Promise<void>;onClose:()=>void;
  onBusyChange:(busy:boolean)=>void;onDraftChange:(dirty:boolean)=>void;
}) {
  const [siteId,setSiteId]=useState(audit?.siteId||context.sites.find(site=>site.name===siteName)?.id||context.sites[0]?.id||'');
  const [result,setResult]=useState<AuditTemplateList>({items:[],total:0});
  const [search,setSearch]=useState('');
  const [page,setPage]=useState(0);
  const [loading,setLoading]=useState(false);
  const [publishing,setPublishing]=useState(false);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [selected,setSelected]=useState<AuditTemplate|null>(null);
  const [versions,setVersions]=useState<AuditTemplate[]|null>(null);
  const [draft,setDraft]=useState<Draft|null>(null);
  const alive=useRef(true);
  const request=useRef(0);
  const historyRequest=useRef(0);
  const saving=useRef(false);
  const busy=disabled||publishing;
  const canApply=!!audit&&audit.status==='planned'&&audit.leadId===context.actor.id;
  const load=useCallback(async(signal?:AbortSignal)=>{
    if(!siteId)return;const generation=++request.current;
    const params=new URLSearchParams({siteId,search,limit:'20',offset:String(page*20)});
    if(audit)params.set('standard',audit.standard);
    const items=await api<AuditTemplateList>(`audit-templates?${params}`,context.tenant.id,{signal});
    if(alive.current&&!signal?.aborted&&generation===request.current)setResult(items);
  },[siteId,search,page,audit?.standard,context.tenant.id]);
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;historyRequest.current++;};},[]);
  useEffect(()=>{onDraftChange(!!draft);return()=>onDraftChange(false);},[!!draft,onDraftChange]);
  useEffect(()=>{
    const controller=new AbortController();setLoading(true);
    const timer=setTimeout(()=>{void load(controller.signal).catch(e=>{if(!controller.signal.aborted)setError(errorText(e));}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});},200);
    return()=>{clearTimeout(timer);controller.abort();};
  },[load]);
  function edit(source:AuditTemplate|null){
    if(busy)return;
    if(draft&&!window.confirm('Abandonner le brouillon du modèle ?'))return;
    historyRequest.current++;setVersions(null);setSelected(null);setError('');setNotice('');
    setDraft({source,code:source?.code||'',title:source?.title||'',standard:source?.standard||audit?.standard||'',note:'',questions:source?.checklist.map(item=>({key:crypto.randomUUID(),clause:item.clause,question:item.question}))||[{key:crypto.randomUUID(),clause:'',question:''}]});
  }
  async function publish(){
    if(!draft||busy||saving.current)return;saving.current=true;setPublishing(true);onBusyChange(true);setError('');setNotice('');
    try{
      const saved=await api<AuditTemplate>('audit-templates',context.tenant.id,{method:'POST',body:JSON.stringify({siteId,code:draft.code,title:draft.title,standard:draft.standard,changeNote:draft.note,expectedVersion:draft.source?.number||0,questions:draft.questions.map(({clause,question})=>({clause,question}))})});
      if(alive.current){setDraft(null);setSelected(saved);setVersions(null);setNotice(`${saved.code} · Version ${saved.number} publiée.`);await load().catch(()=>{if(alive.current)setError('Version publiée. Actualisez la bibliothèque pour la retrouver.');});}
    }catch(e){if(alive.current)setError(errorText(e));}
    finally{saving.current=false;onBusyChange(false);if(alive.current)setPublishing(false);}
  }
  async function history(template:AuditTemplate){
    const generation=++historyRequest.current;setError('');setSelected(template);setVersions(null);
    try{const items=await api<AuditTemplate[]>(`audit-templates/${template.id}/versions`,context.tenant.id);if(alive.current&&generation===historyRequest.current)setVersions(items);}
    catch(e){if(alive.current&&generation===historyRequest.current)setError(errorText(e));}
  }
  function changeQuestion(key:string,patch:Partial<Question>){setDraft(current=>current?{...current,questions:current.questions.map(item=>item.key===key?{...item,...patch}:item)}:null);}
  return <section className="panel audit-template-panel" aria-label="Bibliothèque des modèles d’audit">
    <div className="audit-template-heading"><h2>Modèles de checklist</h2><button type="button" className="button button-outline" disabled={busy} onClick={()=>{if(!draft||window.confirm('Abandonner le brouillon du modèle ?'))onClose();}}>Fermer</button></div>
    <p className="attachments-hint">Versions publiées et conservées par site. Enregistrez les modifications de l’audit avant de copier un modèle. Copier un modèle crée des questions sans résultats ni preuves. Aucun contenu normatif sous licence n’est préchargé.</p>
    <div className="audit-template-filters"><label className="field-label">Site<select className="field-input" value={siteId} disabled={busy||!!audit||!!draft} onChange={e=>{historyRequest.current++;setSiteId(e.target.value);setPage(0);setSelected(null);setVersions(null);setResult({items:[],total:0});}}>{context.sites.map(site=><option key={site.id} value={site.id}>{site.name}</option>)}</select></label><label className="field-label">Rechercher<input className="field-input" value={search} disabled={busy} onChange={e=>{setSearch(e.target.value);setPage(0);}} placeholder="Code ou titre"/></label><button type="button" className="button" disabled={busy||!siteId} onClick={()=>edit(null)}>Créer un modèle</button></div>
    {audit&&<p className="attachments-hint">Référentiel exact : {audit.standard}. Seules les dernières versions correspondantes sont proposées.</p>}
    {error&&<p className="document-error" role="alert">{error} <button type="button" disabled={busy} onClick={()=>void load().catch(e=>setError(errorText(e)))}>Actualiser</button></p>}
    {notice&&<p role="status" className="report-privacy">{notice}</p>}
    {draft?<form className="audit-template-editor" onSubmit={e=>{e.preventDefault();void publish();}}><fieldset disabled={busy}><legend>{draft.source?`${draft.source.code} · Nouvelle version après V${draft.source.number}`:'Nouveau modèle'}</legend>
      <label className="field-label">Code<input className="field-input" value={draft.code} required minLength={2} maxLength={40} pattern="[A-Za-z0-9][A-Za-z0-9_-]{1,39}" readOnly={!!draft.source} onChange={e=>setDraft({...draft,code:e.target.value.toUpperCase()})}/></label>
      <label className="field-label">Titre<input className="field-input" required maxLength={300} value={draft.title} onChange={e=>setDraft({...draft,title:e.target.value})}/></label>
      <label className="field-label">Référentiel et édition<input className="field-input" required maxLength={200} value={draft.standard} onChange={e=>setDraft({...draft,standard:e.target.value})}/></label>
      <label className="field-label">Description de cette version<textarea required maxLength={2000} rows={2} value={draft.note} onChange={e=>setDraft({...draft,note:e.target.value})}/></label>
      {draft.questions.map((item,index)=><div className="audit-question" key={item.key}><div className="audit-question-heading"><b>Question {index+1}</b><button type="button" className="button button-outline" disabled={draft.questions.length===1} onClick={()=>setDraft({...draft,questions:draft.questions.filter(question=>question.key!==item.key)})}>Retirer</button></div><label className="field-label">Clause<input className="field-input" required maxLength={100} value={item.clause} onChange={e=>changeQuestion(item.key,{clause:e.target.value})}/></label><label className="field-label">Question<textarea required maxLength={500} rows={2} value={item.question} onChange={e=>changeQuestion(item.key,{question:e.target.value})}/></label></div>)}
      <div className="document-commands"><button type="button" className="button button-outline" disabled={draft.questions.length>=30} onClick={()=>setDraft({...draft,questions:[...draft.questions,{key:crypto.randomUUID(),clause:'',question:''}]})}>Ajouter une question ({draft.questions.length}/30)</button><button className="button" type="submit">Publier la version</button><button type="button" className="button button-outline" onClick={()=>{if(window.confirm('Abandonner ce brouillon ?'))setDraft(null);}}>Abandonner</button></div>
      <p className="attachments-hint">La publication conserve définitivement cette version. Une correction ultérieure nécessite une nouvelle version et ne modifie aucun audit existant.</p>
    </fieldset></form>:<>
      {loading?<p role="status" className="attachments-hint">Chargement des modèles…</p>:<ul className="audit-template-list">{result.items.map(template=><li key={template.id}><div><b>{template.code} · V{template.number} · {template.title}</b><span>{template.standard} · {template.checklist.length} questions</span></div><div className="document-commands"><button type="button" className="button button-outline" disabled={busy} onClick={()=>{historyRequest.current++;setSelected(template);setVersions(null);}}>Consulter</button><button type="button" className="button button-outline" disabled={busy} onClick={()=>edit(template)}>Nouvelle version</button>{canApply&&<button type="button" className="button" disabled={busy||!allowApply} onClick={()=>{const replace=!!audit?.checklist.length;if(window.confirm(replace?'Remplacer toutes les questions de cet audit par cette version du modèle ?':'Copier les questions de ce modèle dans l’audit ?'))void onApply(template.id,replace);}}>Copier dans l’audit</button>}</div></li>)}{!result.items.length&&<li>Aucun modèle publié dans ce périmètre.</li>}</ul>}
      <div className="document-commands"><button type="button" className="button button-outline" disabled={busy||loading||page===0} onClick={()=>setPage(current=>current-1)}>Précédent</button><span className="attachments-hint">{result.total} modèles · Page {page+1}</span><button type="button" className="button button-outline" disabled={busy||loading||(page+1)*20>=result.total} onClick={()=>setPage(current=>current+1)}>Suivant</button></div>
      {selected&&<div className="audit-template-preview"><h3>{selected.code} · Version {selected.number} · {selected.title}</h3><p className="attachments-hint">Publiée le {new Date(selected.createdAt).toLocaleString('fr-FR')} · {context.members.find(person=>person.id===selected.createdBy)?.name||selected.createdBy}</p><p>{selected.changeNote}</p><ol>{selected.checklist.map(item=><li key={item.id}><b>{item.clause}</b> · {item.question}</li>)}</ol><code>SHA-256 : {selected.contentSha256}</code><div className="document-commands"><button type="button" className="button button-outline" disabled={busy} onClick={()=>void history(selected)}>Historique des versions (100 dernières)</button></div>{versions&&<ul>{versions.map(version=><li key={version.id}><button type="button" disabled={busy} onClick={()=>setSelected(version)}>V{version.number} · {new Date(version.createdAt).toLocaleDateString('fr-FR')} · {version.title}</button><p>{version.changeNote}</p></li>)}</ul>}</div>}
    </>}
  </section>;
}
