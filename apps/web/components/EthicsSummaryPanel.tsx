'use client';
import {useEffect,useState} from 'react';
import type {EthicsSummary} from '@sentinelle/contracts';
import {api} from '../lib/use-workspace';
type Kind='third_party'|'assessment'|'gift'|'conflict'|'donation'|'control';
export default function EthicsSummaryPanel({tenant,siteId,revision,onOpen}:{tenant:string;siteId?:string;revision:number;onOpen:(kind:Kind)=>void}){
 const [data,setData]=useState<EthicsSummary|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState('');
 useEffect(()=>{const c=new AbortController();setLoading(true);setError('');const params=new URLSearchParams();if(siteId)params.set('siteId',siteId);void api<EthicsSummary>(`ethics/summary?${params}`,tenant,{signal:c.signal}).then(value=>{if(!c.signal.aborted)setData(value);}).catch(e=>{if(!c.signal.aborted){setData(null);setError(e instanceof Error?e.message:'Indicateurs indisponibles.');}}).finally(()=>{if(!c.signal.aborted)setLoading(false);});return()=>c.abort();},[tenant,siteId,revision]);
 return <section className="panel" aria-label="Vue d’ensemble anticorruption"><h2>Vue d’ensemble anticorruption</h2>{loading?<p role="status">Chargement des indicateurs…</p>:error?<p role="alert" className="document-error">{error}</p>:data&&<><p>Situation au {new Date(data.asOf).toLocaleString('fr-FR')} · date de référence {data.asOfDate} UTC. Indicateurs calculés sur les données accessibles.</p><div className="module-stat-row">
 <div className="module-stat"><span>Tiers enregistrés</span><b>{data.thirdParties.total}</b><small>{data.thirdParties.withoutAssessment} sans évaluation · {data.thirdParties.highRisk} fiches tiers classées à risque élevé</small><button type="button" onClick={()=>onOpen('third_party')}>Voir les tiers</button></div>
 <div className="module-stat"><span>Évaluations de tiers</span><b>{data.assessments.total}</b><small>{data.assessments.awaitingDecision} sans décision · {data.assessments.overdueReview} revues en retard</small><button type="button" onClick={()=>onOpen('assessment')}>Voir les évaluations</button></div>
 <div className="module-stat"><span>Déclarations</span><b>{data.declarations.gifts+data.declarations.conflicts+data.declarations.donations}</b><small>{data.declarations.gifts} cadeaux · {data.declarations.conflicts} conflits · {data.declarations.donations} dons · {data.declarations.awaitingDecision} sans décision</small><button type="button" onClick={()=>onOpen('gift')}>Voir les déclarations</button></div>
 <div className="module-stat"><span>Contrôles</span><b>{data.controls.total}</b><small>{data.controls.overdueTests} essais en retard · {data.controls.nonEffectiveTests} essais partiels ou non efficaces · {data.controls.openActions} actions ouvertes</small><button type="button" onClick={()=>onOpen('control')}>Voir les contrôles</button></div>
 </div><p>Une fiche ou une décision enregistrée ne constitue pas à elle seule une preuve de conformité.</p></>}</section>;
}
