'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Clock3, FileText, Plus, Search, ShieldCheck, X } from 'lucide-react';
import type { DocumentCommand, DocumentDetail, DocumentEvent, DocumentStatus, DocumentSummary, WorkspaceContext } from '@sentinelle/contracts';
import { api } from '../lib/use-workspace';
import AttachmentsPanel from './AttachmentsPanel';

const labels: Record<DocumentStatus,string> = { draft: 'Brouillon', in_review: 'En vérification', pending_approval: 'À approuver', published: 'Publié', rejected: 'À reprendre', archived: 'Archivé' };
const message = (error: unknown) => error instanceof Error ? error.message : 'Une erreur est survenue.';

export default function DocumentsPage({ context,siteName }: { context: WorkspaceContext; siteName: string }) {
  const [documents,setDocuments] = useState<DocumentSummary[]>([]);
  const [detail,setDetail] = useState<DocumentDetail | null>(null);
  const [selectedVersion,setSelectedVersion] = useState('');
  const [search,setSearch] = useState('');
  const [error,setError] = useState('');
  const [loading,setLoading] = useState(true);
  const [pending,setPending] = useState(false);
  const [fileBusy,setFileBusy] = useState(false);
  const [form,setForm] = useState<'create' | 'version' | null>(null);
  const [content,setContent] = useState('');
  const [draftSite,setDraftSite] = useState(context.sites.find(site=>site.name===siteName)?.id || context.sites[0]?.id || '');
  const [history,setHistory] = useState<DocumentEvent[] | null>(null);
  const selection = useRef(0);
  const listScope=useRef('');
  const tenant = context.tenant.id;
  listScope.current=`${tenant}|${siteName}|${search}`;
  const version = detail?.versions.find(item=>item.id===selectedVersion) || detail?.versions[0];
  const eligibleReviewers = (context.documentReviewers[form==='version' ? detail?.document.siteId || '' : draftSite] || []).filter(member=>member.id!==context.actor.id);
  const name = (id: string) => context.members.find(member=>member.id===id)?.name || 'Membre autorisé';
  const loadList = useCallback(async (signal?: AbortSignal) => {
    const scope=`${tenant}|${siteName}|${search}`;
    const params = new URLSearchParams({ search,limit: '100' });
    const site = context.sites.find(item=>item.name===siteName);
    if (site) params.set('siteId',site.id);
    const result = await api<{ items: DocumentSummary[] }>(`documents?${params}`,tenant,{ signal });
    if (!signal?.aborted&&listScope.current===scope) setDocuments(result.items);
  },[tenant,siteName,search,context.sites]);
  useEffect(()=>{
    const controller = new AbortController();
    setLoading(true); setError('');
    const timer = setTimeout(()=>{ void loadList(controller.signal).catch(e=>{ if (!controller.signal.aborted) setError(message(e)); }).finally(()=>{ if (!controller.signal.aborted) setLoading(false); }); },200);
    return ()=>{ clearTimeout(timer); controller.abort(); };
  },[loadList]);
  useEffect(()=>{ setContent(version?.content || ''); },[version?.id,version?.revision,version?.content]);
  useEffect(()=>{ selection.current++; setDetail(null); setHistory(null); setForm(null); },[siteName]);
  useEffect(()=>()=>{ selection.current++; },[]);

  async function openDocument(id: string) {
    const request = ++selection.current;
    setError(''); setHistory(null); setDetail(null);
    try {
      const saved = await api<DocumentDetail>(`documents/${id}`,tenant);
      if (request===selection.current) { setDetail(saved); setSelectedVersion(saved.versions[0]?.id || ''); }
    } catch (e) { if (request===selection.current) setError(message(e)); }
  }
  async function mutate(path: string,input: unknown,method='POST') {
    if (pending||fileBusy) return;
    const request=++selection.current;setPending(true); setError('');
    try {
      const saved = await api<DocumentDetail>(path,tenant,{ method,body: JSON.stringify(input) });
      if(request===selection.current){setDetail(saved);setSelectedVersion(saved.versions[0]?.id||'');setForm(null);setHistory(null);await loadList().catch(()=>setError('Enregistrement effectué. Actualisez la liste.'));}
    } catch (e) {
      if(request!==selection.current)return;
      if (detail) {
        try { const current=await api<DocumentDetail>(`documents/${detail.document.id}`,tenant); if(request===selection.current)setDetail(current); } catch {}
      }
      if(request===selection.current)setError(message(e));
    } finally { setPending(false); }
  }
  async function decide(command: DocumentCommand) {
    if (!detail || !version) return;
    let note: string | undefined;
    if (command==='reject') { note=window.prompt('Motif du retour à l’auteur :')?.trim(); if (!note) return; }
    else if (!window.confirm(command==='approve' ? 'J’approuve cette version et autorise sa publication sous mon identité.' : command==='verify' ? 'Je confirme avoir vérifié cette version.' : 'Soumettre cette version ? Son contenu sera figé.')) return;
    await mutate(`documents/${detail.document.id}/versions/${version.id}/decisions`,{ revision: version.revision,command,...(note ? { note } : {}) });
  }
  async function refreshFiles() {
    if(!detail)return;const id=detail.document.id,request=selection.current;
    const saved=await api<DocumentDetail>(`documents/${id}`,tenant);
    if(request===selection.current){setDetail(saved);await loadList();}
  }
  async function showHistory() {
    if (!detail) return;
    setError('');const request=selection.current;
    try { const events=await api<DocumentEvent[]>(`documents/${detail.document.id}/history`,tenant);if(request===selection.current)setHistory(events); }
    catch (e) { if(request===selection.current)setError(message(e)); }
  }

  return <div className="module-page documents-page">
    <div className="module-header"><div><div className="eyebrow"><span className="live-dot" /> SOCLE COMMUN · GESTION DOCUMENTAIRE</div><h1>Documents</h1><p className="welcome-sub">Une version maîtrisée, une décision tracée, une lecture confirmée.</p></div><button className="button button-primary" disabled={!context.canWrite || pending||fileBusy} onClick={()=>{ setDraftSite(context.sites.find(site=>site.name===siteName)?.id || context.sites[0]?.id || ''); setForm('create'); setError(''); }}><Plus size={15} /> Nouveau document</button></div>
    {fileBusy&&<p className="attachments-progress" role="status">Une opération sur les pièces jointes est en cours.</p>}
    {error && <div role="alert" className="document-error">{error}</div>}
    <div className="documents-layout">
      <section className="panel documents-list" aria-label="Liste des documents">
        <div className="documents-toolbar"><Search size={15} /><input aria-label="Rechercher un document" placeholder="Code ou titre du document" value={search} onChange={e=>setSearch(e.target.value)} /></div>
        {loading ? <p className="documents-empty" role="status">Chargement des documents…</p> : documents.length ? documents.map(document=><button key={document.id} disabled={pending||fileBusy} className={`document-list-item ${detail?.document.id===document.id ? 'selected' : ''}`} onClick={()=>void openDocument(document.id)}><span className="document-code"><FileText size={13} /> {document.code}</span><b>{document.title}</b><span className="document-list-meta"><span>{document.siteName}</span><span className={`document-status status-${document.status}`}>{labels[document.status]}</span></span></button>) : <p className="documents-empty">Aucun document accessible dans ce périmètre.</p>}
        <p className="document-list-foot">100 documents les plus récents au maximum.</p>
      </section>
      <section className="panel document-detail" aria-label="Contenu du document">
        {!detail || !version ? <div className="document-start"><FileText size={32} /><h2>Votre référentiel documentaire</h2><p>Sélectionnez un document ou créez un premier brouillon pour démarrer son circuit de validation.</p><div className="document-flow">Rédaction <span>→</span> Vérification <span>→</span> Approbation <span>→</span> Diffusion</div></div> : <>
          <div className="document-title"><div><span className="section-kicker">{detail.document.code} · {detail.document.siteName}</span><h2>{detail.document.title}</h2></div><button className="button" disabled={pending||fileBusy || !context.canWrite || !['published','rejected'].includes(detail.versions[0].status) || detail.versions[0].number!==detail.document.lastVersion} onClick={()=>setForm('version')}><Plus size={14} /> Nouvelle version</button></div>
          <div className="version-bar"><label>Version <select value={version.id} disabled={pending||fileBusy} onChange={e=>{ setSelectedVersion(e.target.value); setHistory(null); }}>{detail.versions.map(item=><option key={item.id} value={item.id}>v{item.number} · {labels[item.status]}</option>)}</select></label><span className={`document-status status-${version.status}`}>{labels[version.status]}</span></div>
          <div className="document-people"><span>Auteur <b>{name(version.authorId)}</b></span><span>Vérificateur <b>{name(version.reviewerId)}</b></span><span>Approbateur <b>{name(version.approverId)}</b></span></div>
          {version.status==='draft' && version.authorId===context.actor.id && context.canWrite ? <label className="field-label">Contenu du brouillon<textarea maxLength={15000} rows={15} value={content} onChange={e=>setContent(e.target.value)} disabled={pending||fileBusy} /></label> : <pre className="document-content">{version.content}</pre>}
          {version.decisionNote && <div className="document-decision-note"><b>Commentaire de décision</b><p>{version.decisionNote}</p></div>}
          <AttachmentsPanel key={version.id} tenantId={tenant} parentType="document_version" parentId={version.id} disabled={pending||content.trim()!==version.content} onChanged={refreshFiles} onBusyChange={setFileBusy}/>
          {version.status==='draft'&&content.trim()!==version.content&&<p className="attachments-hint">Enregistrez le contenu avant de gérer les pièces jointes.</p>}
          <div className="document-commands">
            {context.canWrite && version.status==='draft' && version.authorId===context.actor.id && <><button className="button" disabled={pending||fileBusy || content.trim()===version.content || !content.trim()} onClick={()=>void mutate(`documents/${detail.document.id}/versions/${version.id}`,{ revision: version.revision,content },'PATCH')}>Enregistrer</button><button className="button button-primary" disabled={pending||fileBusy || content.trim()!==version.content} onClick={()=>void decide('submit')}>Soumettre pour vérification</button></>}
            {context.canWrite && version.status==='in_review' && version.reviewerId===context.actor.id && <><button className="button" disabled={pending||fileBusy} onClick={()=>void decide('reject')}>Retourner à l’auteur</button><button className="button button-primary" disabled={pending||fileBusy} onClick={()=>void decide('verify')}><Check size={14} /> Vérifier</button></>}
            {context.canWrite && version.status==='pending_approval' && version.approverId===context.actor.id && <><button className="button" disabled={pending||fileBusy} onClick={()=>void decide('reject')}>Retourner à l’auteur</button><button className="button button-primary" disabled={pending||fileBusy} onClick={()=>void decide('approve')}><ShieldCheck size={14} /> Approuver et publier</button></>}
            {version.status==='published' && <button className="button button-primary" disabled={pending||fileBusy || version.acknowledged} onClick={()=>{ if(window.confirm('Je confirme avoir pris connaissance de cette version.')) void mutate(`documents/${detail.document.id}/versions/${version.id}/acknowledgements`,{}); }}><Check size={14} /> {version.acknowledged ? 'Lecture confirmée' : 'Confirmer ma lecture'}</button>}
            <button className="button" disabled={pending||fileBusy} onClick={()=>void showHistory()}><Clock3 size={14} /> Historique</button>
          </div>
          <div className="document-evidence"><span>Empreinte SHA-256</span><code>{version.contentSha256}</code><span>Empreinte du manifeste des pièces jointes</span><code>{version.attachmentsSha256}</code>{version.reviewedAt && <span>Vérifié le {new Date(version.reviewedAt).toLocaleString('fr-FR')}</span>}{version.approvedAt && <span>Approuvé le {new Date(version.approvedAt).toLocaleString('fr-FR')}</span>}</div>
          {history && <div className="document-history"><h3>Historique des versions</h3>{history.length ? history.map(event=><div key={event.id}><b>{event.operation==='INSERT' ? 'Version créée' : `${labels[event.before?.status as DocumentStatus] || 'Brouillon'} → ${labels[event.after.status as DocumentStatus] || 'Brouillon'}`}</b><span>{name(event.actorId)} · {new Date(event.occurredAt).toLocaleString('fr-FR')}</span></div>) : <p>Aucun événement accessible.</p>}</div>}
        </>}
      </section>
    </div>
    {form && <div className="modal-backdrop"><form className="modal document-form" role="dialog" aria-modal="true" aria-labelledby="document-form-title" onSubmit={e=>{
      e.preventDefault(); const values=new FormData(e.currentTarget);
      const input={ content:String(values.get('content')),reviewerId:String(values.get('reviewerId')),approverId:String(values.get('approverId')) };
      if (form==='create') void mutate('documents',{ ...input,code:String(values.get('code')),title:String(values.get('title')),siteId:String(values.get('siteId')) });
      else if(detail) void mutate(`documents/${detail.document.id}/versions`,{ ...input,expectedLastVersion:detail.document.lastVersion });
    }}><button className="modal-close" type="button" disabled={pending||fileBusy} aria-label="Fermer" onClick={()=>setForm(null)}><X size={18} /></button><div className="section-kicker">GESTION DOCUMENTAIRE</div><h2 id="document-form-title">{form==='create' ? 'Nouveau document' : 'Nouvelle version'}</h2>{form==='version'&&<p className="attachments-hint">Les pièces jointes doivent être ajoutées à cette nouvelle version avant sa soumission.</p>}<p className="modal-reference">Choisissez deux responsables habilités, différents de l’auteur et l’un de l’autre.</p>{error && <p className="document-error" role="alert">{error}</p>}
      {form==='create' && <><div className="field-pair"><label className="field-label">Code<input name="code" required maxLength={50} pattern="[A-Z0-9][A-Z0-9._\-]*" placeholder="PRO-QUA-001" /></label><label className="field-label">Site<select name="siteId" required value={draftSite} onChange={e=>setDraftSite(e.target.value)}>{context.sites.map(site=><option key={site.id} value={site.id}>{site.name}</option>)}</select></label></div><label className="field-label">Titre<input name="title" required maxLength={200} /></label></>}
      <div className="field-pair"><label className="field-label">Vérificateur<select key={`review-${draftSite}-${form}`} required name="reviewerId" defaultValue=""><option value="" disabled>Choisir</option>{eligibleReviewers.map(member=><option key={member.id} value={member.id}>{member.name}</option>)}</select></label><label className="field-label">Approbateur<select key={`approve-${draftSite}-${form}`} required name="approverId" defaultValue=""><option value="" disabled>Choisir</option>{eligibleReviewers.map(member=><option key={member.id} value={member.id}>{member.name}</option>)}</select></label></div>
      <label className="field-label">Contenu texte<textarea name="content" required maxLength={15000} rows={8} defaultValue={form==='version' ? version?.content : ''} /></label><div className="modal-actions"><button type="button" className="button" disabled={pending||fileBusy} onClick={()=>setForm(null)}>Annuler</button><button className="button button-primary" disabled={pending||fileBusy}>{pending ? 'Enregistrement…' : 'Créer le brouillon'}</button></div>
    </form></div>}
  </div>;
}
