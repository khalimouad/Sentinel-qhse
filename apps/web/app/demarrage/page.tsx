'use client';

import { useEffect, useMemo, useState } from 'react';
import styles from './simple.module.css';

type Section = 'home' | 'reports' | 'actions' | 'norms' | 'compliance';
type ReportKind = 'quality' | 'safety' | 'environment' | 'complaint';
type Issue = { id: string; kind: ReportKind; title: string; site: string; date: string; description: string; detail?: string; status: string };
type Action = { id: string; title: string; owner: string; due: string; done: boolean };
type Obligation = { id: string; title: string; source: string; status: string; due: string };
type Workspace = { company: string; country: string; activity: string; norms: string[]; issues: Issue[]; actions: Action[]; obligations: Obligation[]; checked: string[] };

const KEY = 'sentinelle-simple-v1';
const standards = [
  { id: '9001', name: 'ISO 9001', title: 'Qualité', text: 'Améliorer la qualité des produits et services.' },
  { id: '22000', name: 'ISO 22000', title: 'Sécurité alimentaire', text: 'Maîtriser les dangers liés aux aliments.' },
  { id: '45001', name: 'ISO 45001', title: 'Santé et sécurité', text: 'Prévenir les accidents et protéger les équipes.' },
  { id: '14001', name: 'ISO 14001', title: 'Environnement', text: 'Réduire et suivre les impacts environnementaux.' },
  { id: '37301', name: 'ISO 37301', title: 'Conformité', text: 'Identifier et évaluer les obligations applicables.' },
  { id: '37001', name: 'ISO 37001', title: 'Anticorruption', text: 'Prévenir et traiter les risques de corruption.' },
];
const kinds: { id: ReportKind; title: string; hint: string; color: string }[] = [
  { id: 'quality', title: 'Problème qualité', hint: 'Produit, service ou procédure', color: 'blue' },
  { id: 'safety', title: 'Danger ou incident', hint: 'Accident, presque-accident ou danger', color: 'orange' },
  { id: 'environment', title: 'Problème environnemental', hint: 'Déchet, fuite, rejet ou consommation', color: 'green' },
  { id: 'complaint', title: 'Réclamation client', hint: 'Insatisfaction ou demande client', color: 'purple' },
];
const empty: Workspace = { company: '', country: 'Maroc', activity: '', norms: ['9001', '45001'], issues: [{ id: 'demo-issue-1', kind: 'safety', title: 'Sol glissant près de l’entrée', site: 'Site principal', date: new Date().toISOString().slice(0, 10), description: 'Exemple de signalement à remplacer par votre situation.', status: 'À traiter' }], actions: [{ id: 'demo-action-1', title: 'Installer un panneau de sol glissant', owner: 'Responsable du site', due: '', done: false }], obligations: [], checked: [] };

export default function SimpleStartPage() {
  const [data, setData] = useState<Workspace>(empty);
  const [ready, setReady] = useState(false);
  const [section, setSection] = useState<Section>('home');
  const [showSetup, setShowSetup] = useState(false);
  const [showIssue, setShowIssue] = useState(false);
  const [kind, setKind] = useState<ReportKind>('quality');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    try {
      const saved = localStorage.getItem(KEY);
      if (saved) setData({ ...empty, ...JSON.parse(saved) });
      else setShowSetup(true);
    } catch { setShowSetup(true); }
    setReady(true);
  }, []);
  useEffect(() => { if (ready) localStorage.setItem(KEY, JSON.stringify(data)); }, [data, ready]);

  const activeStandards = useMemo(() => standards.filter(item => data.norms.includes(item.id)), [data.norms]);
  const openActions = data.actions.filter(item => !item.done).length;
  const toggleNorm = (id: string) => setData(old => ({ ...old, norms: old.norms.includes(id) ? old.norms.filter(x => x !== id) : [...old.norms, id] }));
  const toggleCheck = (id: string) => setData(old => ({ ...old, checked: old.checked.includes(id) ? old.checked.filter(x => x !== id) : [...old.checked, id] }));
  const saveIssue = (form: FormData) => {
    const title = String(form.get('title') || '').trim();
    if (!title) return;
    const detailField = kind === 'quality' ? 'object' : kind === 'safety' ? 'immediate' : kind === 'environment' ? 'impact' : 'customer';
    const report: Issue = { id: crypto.randomUUID(), kind, title, site: String(form.get('site') || 'Site principal'), date: String(form.get('date') || new Date().toISOString().slice(0, 10)), description: String(form.get('description') || ''), detail: String(form.get(detailField) || ''), status: 'À traiter' };
    setData(old => ({ ...old, issues: [report, ...old.issues] })); setShowIssue(false); flash('Signalement enregistré');
  };
  const saveAction = (form: FormData) => {
    const title = String(form.get('title') || '').trim(); if (!title) return;
    setData(old => ({ ...old, actions: [{ id: crypto.randomUUID(), title, owner: String(form.get('owner') || ''), due: String(form.get('due') || ''), done: false }, ...old.actions] })); flash('Action ajoutée');
  };
  const saveObligation = (form: FormData) => {
    const title = String(form.get('title') || '').trim(); if (!title) return;
    setData(old => ({ ...old, obligations: [{ id: crypto.randomUUID(), title, source: String(form.get('source') || ''), status: 'À évaluer', due: String(form.get('due') || '') }, ...old.obligations] })); flash('Obligation enregistrée');
  };
  const flash = (text: string) => { setNotice(text); window.setTimeout(() => setNotice(''), 2400); };
  const reset = () => { if (window.confirm('Effacer toutes les données de cette démonstration ?')) { setData(empty); setShowSetup(true); } };

  if (!ready) return <main className={styles.loading}>Ouverture de votre espace…</main>;
  const pageTitle: Record<Section, string> = { home: 'Vue d’ensemble', reports: 'Signalements', actions: 'Actions à suivre', norms: 'Mes normes', compliance: 'Conformité' };
  return <main className={styles.app}>
    <aside className={styles.sidebar}>
      <a className={styles.brand} href="/demarrage"><span className={styles.brandMark}>S</span><span>sentinelle<span className={styles.dot}>.</span><small>ESPACE SIMPLE</small></span></a>
      <div className={styles.org}><span className={styles.orgIcon}>{(data.company || 'E').slice(0, 1).toUpperCase()}</span><span><b>{data.company || 'Mon organisation'}</b><small>{data.country} · espace local</small></span><button aria-label="Modifier mon organisation" onClick={() => setShowSetup(true)}>⌄</button></div>
      <span className={styles.navLabel}>MON ESPACE</span>
      <nav className={styles.nav}>
        {(['home', 'reports', 'actions', 'norms', 'compliance'] as Section[]).map((item, i) => <button key={item} className={section === item ? styles.active : ''} onClick={() => setSection(item)}><span className={styles.navIcon}>{['⌂', '＋', '✓', '◎', '◇'][i]}</span>{pageTitle[item]}{item === 'actions' && openActions > 0 && <em>{openActions}</em>}</button>)}
      </nav>
      <div className={styles.sidebarBottom}><span className={styles.localBadge}><i/> Démo locale</span><button className={styles.reset} onClick={reset}>Réinitialiser les données</button></div>
    </aside>
    <section className={styles.main}>
      <header className={styles.topbar}><div><span>Mon espace</span><b> / {pageTitle[section]}</b></div><button className={styles.help} onClick={() => setShowSetup(true)}>⚙ <span>Mon organisation</span></button></header>
      <div className={styles.content}>
        {notice && <div className={styles.toast} role="status">✓ {notice}</div>}
        <div className={styles.heading}><div><p className={styles.eyebrow}>ESPACE DE TRAVAIL · {data.country.toUpperCase()}</p><h1>{section === 'home' ? `Bonjour${data.company ? ',' : ''} ${data.company || 'et bienvenue'}` : pageTitle[section]}</h1><p className={styles.sub}>{section === 'home' ? 'Voici les sujets à suivre dans votre organisation.' : section === 'norms' ? 'Choisissez les référentiels qui correspondent à votre activité.' : 'Retrouvez ici les éléments enregistrés pour votre organisation.'}</p></div><button className={styles.primary} onClick={() => { setKind('quality'); setShowIssue(true); }}>＋ <span>Signaler un problème</span></button></div>

        {section === 'home' && <>
          <div className={styles.stats}><Stat label="Signalements ouverts" number={data.issues.filter(x => x.status !== 'Clôturé').length} detail="À analyser ou à traiter"/><Stat label="Actions en cours" number={openActions} detail="Avec un responsable et une échéance"/><Stat label="Normes sélectionnées" number={data.norms.length} detail="Configurées pour votre espace"/></div>
          <div className={styles.columns}><article className={styles.card}><div className={styles.cardHead}><div><p className={styles.eyebrow}>À FAIRE EN PREMIER</p><h2>Vos actions</h2></div><button className={styles.textButton} onClick={() => setSection('actions')}>Tout voir →</button></div>{data.actions.filter(a => !a.done).slice(0, 4).map(a => <ActionRow key={a.id} action={a} toggle={() => setData(old => ({ ...old, actions: old.actions.map(x => x.id === a.id ? { ...x, done: !x.done } : x) }))}/>)}{openActions === 0 && <p className={styles.empty}>Aucune action en attente. Vous êtes à jour.</p>}</article>
            <article className={styles.card}><div className={styles.cardHead}><div><p className={styles.eyebrow}>VOTRE DÉMARCHE</p><h2>Normes choisies</h2></div><button className={styles.textButton} onClick={() => setSection('norms')}>Modifier →</button></div>{activeStandards.length ? activeStandards.map(n => <div className={styles.standardRow} key={n.id}><span className={styles.standardCheck}>✓</span><span><b>{n.name} · {n.title}</b><small>{n.text}</small></span></div>) : <p className={styles.empty}>Choisissez vos référentiels pour personnaliser votre espace.</p>}</article></div>
          <article className={styles.card}><div className={styles.cardHead}><div><p className={styles.eyebrow}>DERNIÈRES DÉCLARATIONS</p><h2>Signalements récents</h2></div><button className={styles.textButton} onClick={() => setSection('reports')}>Tout voir →</button></div><IssueTable issues={data.issues.slice(0, 4)} close={closeIssue => setData(old => ({ ...old, issues: old.issues.map(x => x.id === closeIssue ? { ...x, status: 'Clôturé' } : x) }))}/></article>
        </>}

        {section === 'reports' && <article className={styles.card}><div className={styles.cardHead}><div><p className={styles.eyebrow}>AMÉLIORATION CONTINUE</p><h2>Tous les signalements</h2></div><button className={styles.primarySmall} onClick={() => setShowIssue(true)}>＋ Déclarer</button></div><IssueTable issues={data.issues} close={id => setData(old => ({ ...old, issues: old.issues.map(x => x.id === id ? { ...x, status: 'Clôturé' } : x) }))}/></article>}

        {section === 'actions' && <article className={styles.card}><div className={styles.cardHead}><div><p className={styles.eyebrow}>PLAN DE SUIVI</p><h2>Actions correctives et d’amélioration</h2></div><button className={styles.primarySmall} onClick={() => setNotice('Utilisez le formulaire ci-dessous pour ajouter une action.')}>＋ Ajouter une action</button></div>
          <form className={styles.inlineForm} onSubmit={e => { e.preventDefault(); saveAction(new FormData(e.currentTarget)); e.currentTarget.reset(); }}><label>Action à réaliser<input name="title" required placeholder="Ex. Remplacer le panneau de sécurité"/></label><label>Responsable<input name="owner" placeholder="Nom du responsable"/></label><label>Échéance<input name="due" type="date"/></label><button className={styles.primarySmall}>Ajouter</button></form>
          {data.actions.length ? data.actions.map(a => <ActionRow key={a.id} action={a} toggle={() => setData(old => ({ ...old, actions: old.actions.map(x => x.id === a.id ? { ...x, done: !x.done } : x) }))}/>) : <p className={styles.empty}>Aucune action pour le moment. Ajoutez une action ou créez-en une depuis un signalement.</p>}</article>}

        {section === 'norms' && <><div className={styles.info}><b>Vous n’avez pas besoin de connaître les normes à l’avance.</b><span>Sélectionnez celles qui correspondent à vos objectifs. Vous pourrez modifier ce choix plus tard.</span></div><div className={styles.normGrid}>{standards.map(n => <button key={n.id} className={`${styles.normCard} ${data.norms.includes(n.id) ? styles.normSelected : ''}`} onClick={() => toggleNorm(n.id)}><span className={styles.normCheck}>{data.norms.includes(n.id) ? '✓' : '+'}</span><small>{n.name}</small><b>{n.title}</b><span>{n.text}</span></button>)}</div><article className={styles.card}><div className={styles.cardHead}><div><p className={styles.eyebrow}>AUTOÉVALUATION SIMPLE</p><h2>Où en êtes-vous ?</h2></div></div><p className={styles.sub}>Cochez les pratiques déjà en place. Ce suivi vous aide à voir les sujets à travailler ; il ne vaut pas audit de certification.</p>{activeStandards.length ? activeStandards.map(n => <label className={styles.checkRow} key={n.id}><input type="checkbox" checked={data.checked.includes(n.id)} onChange={() => toggleCheck(n.id)}/><span><b>{n.name} · {n.title}</b><small>Nous avons identifié les exigences applicables et désigné un responsable.</small></span></label>) : <p className={styles.empty}>Sélectionnez d’abord au moins une norme.</p>}</article></>}

        {section === 'compliance' && <article className={styles.card}><div className={styles.cardHead}><div><p className={styles.eyebrow}>OBLIGATIONS DE L’ORGANISATION</p><h2>Registre de conformité</h2></div></div><div className={styles.info}><b>Ajoutez les textes que vous devez suivre.</b><span>Cette version ne télécharge pas automatiquement les lois et ne confirme pas leur applicabilité. Faites vérifier chaque référence par une personne compétente.</span></div><form className={styles.complianceForm} onSubmit={e => { e.preventDefault(); saveObligation(new FormData(e.currentTarget)); e.currentTarget.reset(); }}><label>Nom de l’obligation<input name="title" required placeholder="Ex. Autorisation d’exploitation"/></label><label>Source officielle ou référence<input name="source" placeholder="Lien ou référence du texte"/></label><label>Prochaine vérification<input name="due" type="date"/></label><button className={styles.primarySmall}>＋ Enregistrer</button></form>{data.obligations.length ? data.obligations.map(o => <div className={styles.obligationRow} key={o.id}><div><b>{o.title}</b><small>{o.source || 'Référence à compléter'}{o.due ? ` · Revue : ${o.due}` : ''}</small></div><select value={o.status} onChange={e => setData(old => ({ ...old, obligations: old.obligations.map(x => x.id === o.id ? { ...x, status: e.target.value } : x) }))}><option>À évaluer</option><option>Conforme</option><option>À corriger</option><option>Non applicable</option></select><button className={styles.delete} aria-label={`Supprimer ${o.title}`} onClick={() => setData(old => ({ ...old, obligations: old.obligations.filter(x => x.id !== o.id) }))}>×</button></div>) : <p className={styles.empty}>Aucune obligation enregistrée.</p>}</article>}

        <footer className={styles.footer}>Version de démarrage · Les données restent dans ce navigateur. <a href="/demo">Ouvrir la démonstration Sentinelle complète</a></footer>
      </div>
    </section>

    {showSetup && <Modal title="Configurons votre espace" close={() => setShowSetup(false)}><p className={styles.modalIntro}>Quelques informations suffisent pour adapter le menu à votre organisation.</p><form className={styles.modalForm} onSubmit={e => { e.preventDefault(); const f = new FormData(e.currentTarget); const company = String(f.get('company') || '').trim(); if (company) setData(old => ({ ...old, company, country: String(f.get('country')), activity: String(f.get('activity')) })); setShowSetup(false); }}><label>Nom de l’organisation<input name="company" defaultValue={data.company} required placeholder="Ex. Atlas Agro"/></label><div className={styles.formPair}><label>Pays<select name="country" defaultValue={data.country}>{['Maroc','Côte d’Ivoire','Sénégal','France','Autre'].map(x => <option key={x}>{x}</option>)}</select></label><label>Secteur d’activité<select name="activity" defaultValue={data.activity}><option value="">Choisir</option>{['Agroalimentaire','Industrie','Santé','Cosmétique','Services','BTP','Autre'].map(x => <option key={x}>{x}</option>)}</select></label></div><div className={styles.formActions}><button type="button" className={styles.secondary} onClick={() => setShowSetup(false)}>Plus tard</button><button className={styles.primary}>Continuer</button></div></form></Modal>}
    {showIssue && <Modal title="Que souhaitez-vous signaler ?" close={() => setShowIssue(false)}><div className={styles.kindGrid}>{kinds.map(x => <button type="button" key={x.id} className={`${styles.kindCard} ${styles[x.color]} ${kind === x.id ? styles.kindSelected : ''}`} onClick={() => setKind(x.id)}><b>{x.title}</b><small>{x.hint}</small></button>)}</div><form className={styles.modalForm} onSubmit={e => { e.preventDefault(); saveIssue(new FormData(e.currentTarget)); }}><label>Intitulé<input name="title" required placeholder={kind === 'safety' ? 'Ex. Sol glissant près de l’entrée' : kind === 'complaint' ? 'Ex. Retard de livraison signalé par un client' : 'Décrivez le problème en quelques mots'}/></label><div className={styles.formPair}><label>Site<input name="site" placeholder="Site principal"/></label><label>Date<input name="date" type="date" defaultValue={new Date().toISOString().slice(0, 10)}/></label></div>{kind === 'quality' && <label>Produit, service ou processus concerné<input name="object" placeholder="Référence, lot ou processus"/></label>}{kind === 'safety' && <label>Y a-t-il un danger immédiat ?<select name="immediate"><option>Non</option><option>Oui, une mesure urgente est nécessaire</option></select></label>}{kind === 'environment' && <label>Type d’impact<select name="impact"><option>Déchet</option><option>Fuite ou déversement</option><option>Rejet ou émission</option><option>Consommation anormale</option></select></label>}{kind === 'complaint' && <label>Client ou référence de commande<input name="customer" placeholder="Nom du client / commande"/></label>}<label>Description<textarea name="description" rows={3} required placeholder="Que s’est-il passé ?"/></label><div className={styles.formActions}><button type="button" className={styles.secondary} onClick={() => setShowIssue(false)}>Annuler</button><button className={styles.primary}>Enregistrer le signalement</button></div></form></Modal>}
  </main>;
}

function Stat({ label, number, detail }: { label: string; number: number; detail: string }) { return <article className={styles.stat}><span>{label}</span><b>{number}</b><small>{detail}</small></article>; }
function Modal({ title, close, children }: { title: string; close: () => void; children: React.ReactNode }) { return <div className={styles.overlay} onMouseDown={e => { if (e.target === e.currentTarget) close(); }}><section className={styles.modal} role="dialog" aria-modal="true" aria-label={title}><header><h2>{title}</h2><button onClick={close} aria-label="Fermer">×</button></header>{children}</section></div>; }
function ActionRow({ action, toggle }: { action: Action; toggle: () => void }) { return <div className={`${styles.actionRow} ${action.done ? styles.done : ''}`}><button className={styles.checkbox} onClick={toggle} aria-label={action.done ? 'Rouvrir l’action' : 'Clôturer l’action'}>{action.done ? '✓' : ''}</button><span><b>{action.title}</b><small>{action.owner || 'Responsable à désigner'}{action.due ? ` · Échéance ${action.due}` : ''}</small></span><em>{action.done ? 'Terminée' : 'En cours'}</em></div>; }
function IssueTable({ issues, close }: { issues: Issue[]; close: (id: string) => void }) { if (!issues.length) return <p className={styles.empty}>Aucun signalement pour le moment.</p>; return <div className={styles.issueList}>{issues.map(x => <div className={styles.issueRow} key={x.id}><span className={styles.issueType}>{kinds.find(k => k.id === x.kind)?.title}</span><span className={styles.issueTitle}><b>{x.title}</b><small>{x.site} · {x.date}{x.detail ? ` · ${x.detail}` : ''}</small></span><em className={x.status === 'Clôturé' ? styles.closed : ''}>{x.status}</em>{x.status !== 'Clôturé' && <button className={styles.closeIssue} onClick={() => close(x.id)}>Clôturer</button>}</div>)}</div>; }
