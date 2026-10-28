'use client';
import { useEffect,useState } from 'react';
import type { AuditProgramme } from '@sentinelle/contracts';
import { api } from '../lib/use-workspace';
const months=['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
export default function AuditProgrammePanel({tenant,year,siteId,status,search,selectedMonth,disabled,reload,onMonth}:{
  tenant:string;year:number;siteId?:string;status:string;search:string;selectedMonth:number|null;
  disabled:boolean;reload:number;onMonth:(month:number|null)=>void;
}) {
  const [data,setData]=useState<AuditProgramme|null>(null);
  const [error,setError]=useState('');
  const [retry,setRetry]=useState(0);
  useEffect(()=>{
    const controller=new AbortController();setData(null);setError('');
    const params=new URLSearchParams({year:String(year),search});
    if(siteId)params.set('siteId',siteId);
    if(status)params.set('status',status);
    const timer=setTimeout(()=>{
      void api<AuditProgramme>(`audits/programme?${params}`,tenant,{signal:controller.signal})
        .then(result=>{if(!controller.signal.aborted)setData(result);})
        .catch(e=>{if(!controller.signal.aborted)setError(e instanceof Error?e.message:'Impossible de charger le planning annuel.');});
    },200);
    return()=>{clearTimeout(timer);controller.abort();};
  },[tenant,year,siteId,status,search,reload,retry]);
  return <section className="panel audit-programme" aria-label={`Planning annuel des audits ${year}`}>
    <div className="audit-template-heading"><h2>Planning annuel · {year}</h2>{selectedMonth&&<button type="button" className="button button-outline" disabled={disabled} onClick={()=>onMonth(null)}>Tous les mois</button>}</div>
    <p className="attachments-hint">Vue opérationnelle selon le site, le statut et la recherche sélectionnés. Une mission couvrant plusieurs mois apparaît dans chacun; le total annuel ne la compte qu’une fois.</p>
    {error?<p className="document-error" role="alert">{error} <button type="button" onClick={()=>setRetry(value=>value+1)}>Réessayer</button></p>:!data?<p className="attachments-hint" role="status">Chargement du planning…</p>:<>
      <dl className="audit-programme-totals"><div><dt>Missions</dt><dd>{data.counts.total}</dd></div><div><dt>Planifiées</dt><dd>{data.counts.planned}</dd></div><div><dt>En cours</dt><dd>{data.counts.inProgress}</dd></div><div><dt>Rapports finalisés</dt><dd>{data.counts.completed}</dd></div><div><dt>Annulées</dt><dd>{data.counts.cancelled}</dd></div><div className={data.counts.overdue?'audit-programme-late':''}><dt>En retard</dt><dd>{data.counts.overdue}</dd></div></dl>
      <div className="audit-programme-months">{data.months.map(month=><button type="button" key={month.month} disabled={disabled} aria-pressed={selectedMonth===month.month} className={`audit-programme-month ${selectedMonth===month.month?'selected':''}`} onClick={()=>onMonth(selectedMonth===month.month?null:month.month)} aria-label={`${months[month.month-1]} : ${month.total} missions, ${month.overdue} en retard. Filtrer la liste.`}><b>{months[month.month-1]}</b><strong>{month.total}</strong><span>{month.planned} planifiées · {month.inProgress} en cours</span><span>{month.completed} finalisées · {month.cancelled} annulées</span>{month.overdue>0&&<em>{month.overdue} en retard</em>}</button>)}</div>
      <p className="attachments-hint">Situation au {data.asOf} (UTC). En retard : début dépassé pour une mission planifiée, ou fin dépassée pour une mission en cours. Un rapport finalisé peut encore avoir des non-conformités ouvertes. Cette vue ne constitue pas une approbation du programme annuel.</p>
    </>}
  </section>;
}
