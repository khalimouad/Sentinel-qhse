'use client';

import React, { useState } from 'react';
import { Activity, ArrowDownRight, ArrowRight, ArrowUpRight, BookOpenCheck, CalendarDays, Check, CheckCheck, ChevronDown, ChevronLeft, ChevronRight, CircleAlert, ClipboardCheck, Clock3, Download, FileCheck2, FileText, Filter, Globe2, LayoutDashboard, ListChecks, LockKeyhole, Menu, MoreHorizontal, Plus, Search, Settings2, Shield, ShieldAlert, ShieldCheck, SlidersHorizontal, Sparkles, Users, X, Zap } from 'lucide-react';
import { useWorkspace } from '../lib/use-workspace';
import DocumentsPage from './DocumentsPage';
import ReportsPage from './ReportsPage';
import AuditsPage from './AuditsPage';
import ActionDiscussion from './ActionDiscussion';
import NotificationCenter from './NotificationCenter';
import RisksPage from './RisksPage';
import OverviewPage from './OverviewPage';
import ObligationsPage from './ObligationsPage';
import ActionsPage from './ActionsPage';

const nav = [
  { label: 'Vue d’ensemble', icon: LayoutDashboard }, { label: 'Mes actions', icon: ListChecks },
  { label: 'Conformité', icon: BookOpenCheck }, { label: 'Risques', icon: Activity },
  { label: 'Audits', icon: ClipboardCheck }, { label: 'Documents', icon: FileText }, { label: 'Incidents & NC', icon: CircleAlert },
];

function Brand() { return <div className="brand"><div className="brand-mark"><ShieldCheck size={18} strokeWidth={1.9} /></div><span>sentinelle<span className="brand-dot">.</span></span></div>; }

export default function App() {
  const workspace = useWorkspace();
  const context = workspace.context;
  const actorInitials = context?.actor.name.split(' ').map(part=>part[0]).join('').slice(0,2) || '—';
  const [page, setPage] = useState('Vue d’ensemble');
  const [reportToOpen,setReportToOpen] = useState(undefined);
  const [riskToOpen,setRiskToOpen] = useState(undefined);
  const [obligationToOpen,setObligationToOpen] = useState(undefined);
  const [activeSite, setActiveSite] = useState('Tous les sites');
  const [siteOpen, setSiteOpen] = useState(false);
  const [orgOpen, setOrgOpen] = useState(false);
  const [showAction, setShowAction] = useState(false);
  const [overviewRevision,setOverviewRevision] = useState(0);
  const [mobileNav, setMobileNav] = useState(false);
  const [toast, setToast] = useState('');
  const [discussion,setDiscussion] = useState(null);


  const notify = (message) => { setToast(message); window.setTimeout(() => setToast(''), 2600); };
  const addAction = async values => {
    try {
      await workspace.createAction({ title: values.title.trim(), siteId: values.siteId, ownerId: values.ownerId, priority: values.priority, ...(values.dueDate ? { dueDate: values.dueDate } : {}) });
      setShowAction(false);setOverviewRevision(value=>value+1); notify('Action enregistrée');
    } catch (error) { notify(error.message); }
  };

  const handleNav = label => { setObligationToOpen(undefined); setRiskToOpen(undefined); setReportToOpen(undefined); setPage(label); setMobileNav(false); };

  return <div className="app-shell">
    <aside className={`sidebar ${mobileNav ? 'sidebar-open' : ''}`}>
      <div className="sidebar-top"><Brand /><button className="icon-button sidebar-close" onClick={() => setMobileNav(false)} aria-label="Fermer le menu"><X size={18} /></button></div>
      <button className="org-switch" disabled={workspace.loading || workspace.pending} onClick={()=>setOrgOpen(!orgOpen)}><span className="org-avatar">A</span><span className="org-text"><b>{context?.tenant.name || 'Votre organisation'}</b><small>Offre Entreprise</small></span><ChevronDown size={15} /></button>
      {orgOpen && <div className="dropdown org-dropdown">{workspace.tenants.map(tenant=><button key={tenant.id} onClick={()=>{workspace.switchTenant(tenant.id);setOrgOpen(false);setActiveSite('Tous les sites');setPage('Vue d’ensemble');}}>{tenant.name}{tenant.id===context?.tenant.id && <Check size={14}/>}</button>)}</div>}
      <div className="nav-caption">ESPACE DE TRAVAIL</div>
      <nav className="nav-list">{nav.map(item => <button key={item.label} className={`nav-item ${page === item.label ? 'nav-active' : ''}`} onClick={() => handleNav(item.label)}><item.icon size={17} strokeWidth={1.8} /><span>{item.label}</span></button>)}</nav>
      <div className="nav-caption modules-caption">VOS RÉFÉRENTIELS <button className="mini-plus" aria-label="Ajouter un référentiel" onClick={() => notify('Les référentiels se configurent depuis les paramètres')}><Plus size={14} /></button></div>
      <div className="standard-list">
        <button onClick={() => handleNav('Qualité · ISO 9001')}><span className="standard-dot dot-blue" /> ISO 9001 <span className="standard-tag">Q</span></button>
        <button onClick={() => handleNav('Sécurité alimentaire')}><span className="standard-dot dot-green" /> ISO 22000 <span className="standard-tag">SA</span></button>
        <button onClick={() => handleNav('Environnement')}><span className="standard-dot dot-orange" /> ISO 14001 <span className="standard-tag">E</span></button>
        <button onClick={() => handleNav('Santé & sécurité')}><span className="standard-dot dot-purple" /> ISO 45001 <span className="standard-tag">S</span></button>
        <button onClick={() => handleNav('Anticorruption')}><span className="standard-dot dot-red" /> ISO 37001 <span className="standard-tag">AC</span></button>
      </div>
      <div className="sidebar-bottom">
        <div className="help-card"><div className="help-icon"><Sparkles size={15} /></div><b>Un coup de main ?</b><p>Découvrez nos guides pour démarrer.</p><button onClick={() => notify('Le centre d’aide sera bientôt disponible')}>Explorer le centre d’aide <ArrowRight size={13} /></button></div>
        <button className="nav-item settings-item" onClick={() => handleNav('Paramètres')}><Settings2 size={17} /><span>Paramètres</span></button>
        {workspace.authentication==='demo'?<a className="logout-button" href="/">Quitter la démonstration</a>:<form action="/auth/logout" method="post"><button className="logout-button">Se déconnecter</button></form>}<div className="profile"><div className="profile-avatar">{actorInitials}</div><span className="profile-text"><b>{context?.actor.name || 'Votre compte'}</b><small>{context?.tenant.role || 'Non connecté'}</small></span><MoreHorizontal size={18} /></div>
      </div>
    </aside>
    {mobileNav && <button className="scrim" onClick={() => setMobileNav(false)} aria-label="Fermer le menu" />}

    <main className="main-area">
      {workspace.loading && <div className="workspace-banner" role="status">Chargement de votre espace…</div>}
      {workspace.error && <div className="workspace-banner workspace-error" role="alert"><span>{workspace.error}</span><a href="/admin">Administration de la plateforme</a>{workspace.needsLogin ? <a href="/auth/login">Se connecter</a> : <button onClick={workspace.refresh}>Réessayer</button>}</div>}
      {context && <div className="workspace-banner">Vos données sont limitées à votre organisation et à vos sites autorisés. Les obligations de conformité sont référencées et évaluées par vos responsables.</div>}
      {workspace.authentication === 'development' && <div className="workspace-banner">Espace local de démonstration · les actions, documents, audits, risques et signalements sont enregistrés sur le serveur.</div>}

      <header className="topbar">
        <button className="icon-button mobile-menu" onClick={() => setMobileNav(true)} aria-label="Ouvrir le menu"><Menu size={19} /></button>
        <div className="breadcrumb"><span>{context?.tenant.name || 'Votre organisation'}</span><ChevronRight size={14} /><b>{page}</b></div>
        <div className="topbar-right">
          <div className="site-selector-wrap"><button className="site-selector" onClick={() => setSiteOpen(!siteOpen)}><span className="site-pulse" />{activeSite}<ChevronDown size={14} /></button>{siteOpen && <div className="dropdown site-dropdown">{['Tous les sites', ...(context?.sites.map(site => site.name) || [])].map(s => <button key={s} onClick={() => { setActiveSite(s); setSiteOpen(false); }}>{s}{activeSite === s && <Check size={14} />}</button>)}</div>}</div>
          <span className="topbar-divider" />
          {context&&<NotificationCenter key={context.tenant.id} context={context} onOpen={notification=>{setActiveSite('Tous les sites');if(notification.obligationId){setObligationToOpen(notification.obligationId);setPage('Conformité');}else if(notification.riskId){setRiskToOpen(notification.riskId);setPage('Risques');}else if(notification.reportId){setReportToOpen(notification.reportId);setPage('Incidents & NC');}else{setPage('Mes actions');}setDiscussion({tenantId:context.tenant.id,actionId:notification.actionId,title:notification.actionTitle});}}/>}
          <div className="top-avatar">{actorInitials}</div>
        </div>
      </header>

      {!context ? <section className="module-page workspace-unavailable" aria-live="polite"><div className="panel"><h1>{workspace.loading?'Ouverture de votre espace…':workspace.needsLogin?'Connexion requise':'Votre espace est indisponible'}</h1><p>{workspace.loading?'Vérification de la connexion et de vos accès.':workspace.error||'Aucune organisation accessible. Contactez l’administrateur de la plateforme.'}</p>{!workspace.loading&&<div className="document-commands">{workspace.needsLogin?<a className="button button-primary" href="/auth/login">Se connecter</a>:<button type="button" className="button button-primary" onClick={workspace.refresh}>Réessayer</button>}<a className="button button-outline" href="/demo">Essayer la démonstration</a><a className="button button-outline" href="/admin">Administration de la plateforme</a></div>}</div></section> : page === 'Vue d’ensemble' ? <OverviewPage key={`${context?.tenant.id||'loading'}.${activeSite}`} reload={overviewRevision} context={context} siteName={activeSite} onNavigate={handleNav} onCreateAction={()=>setShowAction(true)} onActionChanged={workspace.refreshActions} /> : page==='Conformité' ? context ? <ObligationsPage key={`${context.tenant.id}.${activeSite}.${obligationToOpen||'list'}`} initialObligationId={obligationToOpen} context={context} siteName={activeSite} onActionsChanged={workspace.refreshActions} /> : <div className="module-page"><p>Chargement du registre des obligations…</p></div> : page==='Risques' ? context ? <RisksPage key={`${context.tenant.id}.${activeSite}.${riskToOpen||'list'}`} initialRiskId={riskToOpen} context={context} siteName={activeSite} onActionsChanged={workspace.refreshActions} /> : <div className="module-page"><p>Chargement du registre des risques…</p></div> : page==='Audits' ? context ? <AuditsPage key={`${context.tenant.id}.${activeSite}`} context={context} siteName={activeSite} onOpenReport={id=>{setReportToOpen(id);setPage('Incidents & NC');}} /> : <div className="module-page"><p>Chargement des audits…</p></div> : page==='Incidents & NC' ? context ? <ReportsPage key={`${context.tenant.id}.${reportToOpen || "list"}`} initialReportId={reportToOpen} context={context} siteName={activeSite} onActionsChanged={workspace.refreshActions} /> : <div className="module-page"><p>Chargement de vos signalements…</p></div> : page==='Documents' ? context ? <DocumentsPage key={context.tenant.id} context={context} siteName={activeSite} /> : <div className="module-page"><p>Chargement de votre espace documentaire…</p></div> : page==='Mes actions' ? <ActionsPage key={`${context.tenant.id}.${activeSite}`} context={context} siteName={activeSite} revision={overviewRevision} onCreate={()=>setShowAction(true)} onChanged={workspace.refreshActions} /> : <div className="module-page"><div className="panel planned-module"><h1>{page}</h1><p>Ce module fait partie de la prochaine étape du déploiement.</p><button className="button" onClick={()=>setPage('Vue d’ensemble')}>Retour à la vue d’ensemble</button></div></div>}
    </main>

    {showAction && <div className="modal-backdrop" onClick={()=>setShowAction(false)}><form className="modal action-modal" onSubmit={e=>{e.preventDefault();const form=new FormData(e.currentTarget);addAction({title:form.get('title'),ownerId:form.get('ownerId'),priority:form.get('priority'),siteId:form.get('siteId'),dueDate:form.get('dueDate')});}} onClick={e=>e.stopPropagation()}><button type="button" className="modal-close" onClick={()=>setShowAction(false)} aria-label="Fermer"><X size={18}/></button><div className="modal-symbol icon-lilac"><ListChecks size={20}/></div><div className="section-kicker">PLAN D’ACTIONS UNIQUE</div><h2>Créer une action</h2><p className="modal-reference">Reliez chaque action à son origine pour garder une traçabilité complète.</p><label className="field-label">Intitulé de l’action<input name="title" required placeholder="Ex. Mettre à jour la procédure de contrôle" autoFocus /></label><div className="field-pair"><label className="field-label">Responsable<select name="ownerId" required defaultValue={context?.actor.id}>{context?.members.map(member=><option key={member.id} value={member.id}>{member.name}</option>)}</select></label><label className="field-label">Priorité<select name="priority" defaultValue="normal"><option value="normal">Normale</option><option value="high">Haute</option></select></label></div><label className="field-label">Site<select name="siteId" required defaultValue={context?.sites.find(site=>site.name===activeSite)?.id || context?.sites[0]?.id}>{context?.sites.map(site=><option key={site.id} value={site.id}>{site.name}</option>)}</select></label><label className="field-label">Échéance<input name="dueDate" type="date" /></label><div className="modal-actions"><button type="button" className="button button-quiet" onClick={()=>setShowAction(false)}>Annuler</button><button disabled={workspace.pending} className="button button-primary"><Plus size={15}/> Créer l’action</button></div></form></div>}
    {context&&discussion?.tenantId===context.tenant.id&&<ActionDiscussion key={`${context.tenant.id}.${discussion.actionId}`} context={context} actionId={discussion.actionId} title={discussion.title} onClose={()=>setDiscussion(null)}/>}
    {toast && <div className="toast"><CheckCheck size={16}/>{toast}</div>}
  </div>;
}

