'use client';
import { useEffect,useState } from 'react';
import { api } from '../lib/use-workspace';
import { platformOperations,type PlatformAccount,type PlatformSite } from '../lib/platform-types';
type List<T>={items:T[];total:number};
type HistoryEvent={id:string;operation:string;note:string;actorName:string;occurredAt:string;before:Record<string,unknown>|null;after:Record<string,unknown>};
const roles:Record<string,string>={admin:'Administrateur',manager:'Responsable',reader:'Lecteur'};
const errorMessage=(e:unknown)=>e instanceof Error?e.message:'Chargement impossible.';
function usePage<T>(path:string,page:number,setPage:(page:number)=>void,reload:number){
 const [result,setResult]=useState<List<T>>({items:[],total:0}),[loading,setLoading]=useState(true),[error,setError]=useState(''),[retry,setRetry]=useState(0);
 useEffect(()=>{const controller=new AbortController();setLoading(true);setError('');setResult({items:[],total:0});
  const timer=setTimeout(()=>{void api<List<T>>(`${path}&limit=25&offset=${page*25}`,undefined,{signal:controller.signal})
   .then(value=>{if(!controller.signal.aborted){setResult(value);if(page>0&&page*25>=value.total)setPage(Math.max(0,Math.ceil(value.total/25)-1));}})
   .catch(e=>{if(!controller.signal.aborted)setError(errorMessage(e));})
   .finally(()=>{if(!controller.signal.aborted)setLoading(false);});},200);
  return()=>{clearTimeout(timer);controller.abort();};
 },[path,page,setPage,reload,retry]);
 return {result,loading,error,retry:()=>setRetry(value=>value+1)};
}
function Pagination({page,total,disabled,onChange}:{page:number;total:number;disabled:boolean;onChange:(page:number)=>void}){
 return <div className="document-commands"><button type="button" className="button button-outline" disabled={disabled||page===0} onClick={()=>onChange(page-1)}>Précédent</button><span>Page {page+1} sur {Math.max(1,Math.ceil(total/25))} · {total} résultats</span><button type="button" className="button button-outline" disabled={disabled||(page+1)*25>=total} onClick={()=>onChange(page+1)}>Suivant</button></div>;
}
export default function PlatformCompanyLists({companyId,sites,reload,busy,onEdit,onAdd}:{companyId:string;sites:PlatformSite[];reload:number;busy:boolean;onEdit:(account:PlatformAccount)=>void;onAdd:()=>void}){
 return <><AccountList companyId={companyId} reload={reload} busy={busy} onEdit={onEdit} onAdd={onAdd}/><HistoryList companyId={companyId} sites={sites} reload={reload} busy={busy}/></>;
}
function AccountList({companyId,reload,busy,onEdit,onAdd}:{companyId:string;reload:number;busy:boolean;onEdit:(account:PlatformAccount)=>void;onAdd:()=>void}){
 const [search,setSearch]=useState(''),[role,setRole]=useState('all'),[status,setStatus]=useState('all'),[page,setPage]=useState(0);
 const path=`platform/companies/${companyId}/accounts?search=${encodeURIComponent(search)}&role=${role}&status=${status}`;
 const {result,loading,error,retry}=usePage<PlatformAccount>(path,page,setPage,reload);
 return <section className="platform-account-list" aria-label="Comptes de l’entreprise"><h3>Comptes de l’entreprise</h3><div className="platform-list-filters"><label className="field-label">Nom ou identifiant<input className="field-input" value={search} disabled={busy} onChange={e=>{setSearch(e.target.value);setPage(0);}} maxLength={200}/></label><label className="field-label">Rôle<select className="field-input" value={role} disabled={busy} onChange={e=>{setRole(e.target.value);setPage(0);}}><option value="all">Tous</option><option value="admin">Administrateurs</option><option value="manager">Responsables</option><option value="reader">Lecteurs</option></select></label><label className="field-label">Accès<select className="field-input" value={status} disabled={busy} onChange={e=>{setStatus(e.target.value);setPage(0);}}><option value="all">Tous</option><option value="active">Actifs</option><option value="suspended">Suspendus</option></select></label></div>
 {error&&<p className="document-error" role="alert">{error} <button type="button" disabled={busy} onClick={retry}>Réessayer</button></p>}{loading?<p role="status">Chargement des comptes…</p>:!error&&(!result.items.length?<p>Aucun compte pour ces filtres.</p>:result.items.map(user=><section className="document-decision-note" key={user.id}><b>{user.name} · {roles[user.role]||user.role} · {user.enabled?'Actif':'Suspendu'}</b><p>{user.allSites?'Tous les sites':`${user.siteIds.length} sites autorisés`}</p><small>Identifiant de connexion : {user.subject}</small><p><button type="button" className="button button-outline" disabled={busy} onClick={()=>onEdit(user)}>Modifier les accès</button></p></section>))}
 <Pagination page={page} total={result.total} disabled={busy||loading||!!error} onChange={setPage}/><button type="button" className="button" disabled={busy} onClick={onAdd}>Rattacher un compte</button></section>;
}
function HistoryList({companyId,sites,reload,busy}:{companyId:string;sites:PlatformSite[];reload:number;busy:boolean}){
 const [search,setSearch]=useState(''),[operation,setOperation]=useState('all'),[page,setPage]=useState(0);
 const path=`platform/companies/${companyId}/history?search=${encodeURIComponent(search)}&operation=${operation}`;
 const {result,loading,error,retry}=usePage<HistoryEvent>(path,page,setPage,reload);
 return <section className="platform-history-list" aria-label="Historique de l’entreprise"><h3>Historique des opérations</h3><div className="platform-list-filters"><label className="field-label">Motif ou opérateur<input className="field-input" value={search} maxLength={200} disabled={busy} onChange={e=>{setSearch(e.target.value);setPage(0);}}/></label><label className="field-label">Opération<select className="field-input" value={operation} disabled={busy} onChange={e=>{setOperation(e.target.value);setPage(0);}}><option value="all">Toutes</option>{Object.entries(platformOperations).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label></div>
 {error&&<p className="document-error" role="alert">{error} <button type="button" disabled={busy} onClick={retry}>Réessayer</button></p>}{loading?<p role="status">Chargement de l’historique…</p>:!error&&(!result.items.length?<p>Aucune opération pour ces filtres.</p>:result.items.map(event=><article className="document-decision-note" key={event.id}><b>{platformOperations[event.operation]||event.operation} · {event.actorName}</b><p>{event.note}</p><small>{new Date(event.occurredAt).toLocaleString('fr-FR')}</small><details><summary>Voir les valeurs enregistrées</summary><div className="platform-event-values"><section><h4>Avant</h4>{event.before?<EventValues value={event.before} sites={sites}/>:<p>Création : aucune valeur précédente.</p>}</section><section><h4>Après</h4><EventValues value={event.after} sites={sites}/></section></div></details></article>))}
 <Pagination page={page} total={result.total} disabled={busy||loading||!!error} onChange={setPage}/></section>;
}
function EventValues({value,sites}:{value:Record<string,unknown>;sites:PlatformSite[]}){
 const labels:Record<string,string>={name:'Nom',region:'Région de référence',jurisdictions:'Juridictions',country_code:'Pays',role:'Rôle',enabled:'Accès actif',all_sites:'Tous les sites',siteIds:'Sites autorisés (noms actuels)',revision:'Révision'};
 function display(key:string,item:unknown){if(key==='role')return roles[String(item)]||String(item);if(typeof item==='boolean')return item?'Oui':'Non';if(Array.isArray(item))return item.length?item.map(id=>key==='siteIds'?sites.find(site=>site.id===id)?.name||String(id):String(id)).join(', '):'Aucun';return String(item??'—');}
 return <dl>{Object.entries(labels).filter(([key])=>Object.hasOwn(value,key)).map(([key,label])=><div key={key}><dt>{label}</dt><dd>{display(key,value[key])}</dd></div>)}</dl>;
}
