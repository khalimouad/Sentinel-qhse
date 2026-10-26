'use client';
import { useEffect,useRef } from 'react';
import { createPortal } from 'react-dom';
import type { AuditReportSnapshot } from '@sentinelle/contracts';
const results={pending:'À évaluer',conform:'Conforme',nonconform:'Non conforme',not_applicable:'Non applicable'};
/** Render only the frozen snapshot: do not resolve historical names from today's roster. */
export default function AuditReport({snapshot,auditId,onClose}:{snapshot:AuditReportSnapshot;auditId:string;onClose:()=>void}) {
  const dialog=useRef<HTMLDialogElement>(null);
  useEffect(()=>{
    const element=dialog.current;element?.showModal();
    return()=>{element?.close();};
  },[]);
  const identity=(name:string|undefined,id:string)=>name?`${name} (${id})`:id;
  return createPortal(<dialog ref={dialog} className="audit-report-dialog" aria-labelledby="audit-report-title" onCancel={event=>{event.preventDefault();onClose();}}>
    <div className="audit-report-controls"><p>Rapport figé à la finalisation. Les non-conformités poursuivent leur suivi séparément.</p><button className="button" type="button" onClick={()=>window.print()}>Imprimer / enregistrer PDF</button><button className="button button-outline" type="button" onClick={onClose}>Fermer</button></div>
    <article className="audit-report-paper">
      <header><p className="audit-report-brand">sentinelle · Rapport d’audit</p><h1 id="audit-report-title">{snapshot.title}</h1><p>{snapshot.standard}</p><p className="audit-report-id">Audit : {snapshot.auditId||auditId}</p></header>
      <dl className="audit-report-facts">
        {snapshot.tenantName&&<><dt>Organisation</dt><dd>{snapshot.tenantName}</dd></>}
        <dt>Site</dt><dd>{snapshot.siteName?`${snapshot.siteName} (${snapshot.siteId})`:snapshot.siteId}</dd>
        <dt>Période planifiée</dt><dd>{snapshot.startsOn} → {snapshot.endsOn}</dd>
        <dt>Responsable d’audit</dt><dd>{identity(snapshot.leadName,snapshot.leadId)}</dd>
        <dt>Responsable audité</dt><dd>{identity(snapshot.auditeeName,snapshot.auditeeId)}</dd>
        <dt>Finalisé par</dt><dd>{identity(snapshot.completedByName,snapshot.completedBy)}</dd>
        <dt>Finalisé le</dt><dd>{new Date(snapshot.completedAt).toLocaleString('fr-FR')} · {snapshot.completedAt}</dd>
      </dl>
      {!snapshot.schemaVersion&&<p className="audit-report-legacy">Ce rapport historique conserve les identifiants enregistrés à sa finalisation. Les noms actuels de l’annuaire ne sont pas substitués.</p>}
      <section><h2>Périmètre et objectifs</h2><p className="audit-report-text">{snapshot.scope}</p></section>
      <section><h2>Résultats et preuves</h2>{snapshot.checklist.map((item,index)=>{
        const finding=snapshot.findings.find(finding=>finding.itemId===item.id);
        return <section className="audit-report-item" key={item.id}><h3>{index+1}. Clause {item.clause} · {results[item.result]}</h3><p className="audit-report-text"><b>Question</b><br/>{item.question}</p><p className="audit-report-text"><b>Preuve / justification</b><br/>{item.evidence}</p>{finding&&<p className="audit-report-id">Non-conformité liée : {finding.reportId}</p>}</section>;
      })}</section>
      {!!snapshot.templateSources?.length&&<section><h2>Origine des checklists</h2><p>Versions copiées lors de la préparation; les questions ci-dessus constituent le contenu final de l’audit.</p>{snapshot.templateSources.map(source=><div key={`${source.templateId}.${source.appliedRevision}`}><p>{source.code} · V{source.number} · {source.title} · Copié à la révision {source.appliedRevision}</p><p className="audit-report-id">SHA-256 du modèle : {source.contentSha256}<br/>Copié par : {source.appliedBy} · {source.appliedAt}</p></div>)}</section>}
      <section><h2>Conclusion</h2><p className="audit-report-text">{snapshot.conclusion}</p></section>
      <footer>Document issu de l’enregistrement finalisé. La finalisation du rapport ne vaut pas clôture des non-conformités ni signature électronique qualifiée.</footer>
    </article>
  </dialog>,document.body);
}
