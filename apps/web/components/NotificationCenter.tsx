'use client';
import { useEffect,useRef,useState } from 'react';
import { createPortal } from 'react-dom';
import { Bell } from 'lucide-react';
import type { NotificationList,NotificationReceipt,WorkspaceContext,WorkspaceNotification } from '@sentinelle/contracts';
import { api } from '../lib/use-workspace';
export default function NotificationCenter({context,onOpen}:{context:WorkspaceContext;onOpen:(notification:WorkspaceNotification)=>void}) {
  const [unread,setUnread]=useState<number|null>(null);
  const [open,setOpen]=useState(false);
  const [refresh,setRefresh]=useState(0);
  const tenant=context.tenant.id;
  useEffect(()=>{
    const controller=new AbortController();let generation=0;
    async function load(){
      if(document.visibilityState!=='visible')return;
      const request=++generation;
      try{const result=await api<{unread:number}>('notifications/unread-count',tenant,{signal:controller.signal});if(!controller.signal.aborted&&request===generation)setUnread(result.unread);}
      catch{if(!controller.signal.aborted&&request===generation)setUnread(null);}
    }
    void load();const timer=setInterval(()=>void load(),60000);
    const onFocus=()=>void load();window.addEventListener('focus',onFocus);document.addEventListener('visibilitychange',onFocus);
    return()=>{controller.abort();clearInterval(timer);window.removeEventListener('focus',onFocus);document.removeEventListener('visibilitychange',onFocus);};
  },[tenant,refresh]);
  return <><button type="button" className="icon-button notification-trigger" aria-label={unread===null?'Notifications':`Notifications : ${unread} non lues`} aria-haspopup="dialog" onClick={()=>setOpen(true)}><Bell size={18}/>{unread!==null&&unread>0&&<span className="notification-count">{unread>99?'99+':unread}</span>}</button>
    {open&&<NotificationInbox tenant={tenant} onClose={()=>{setOpen(false);setRefresh(value=>value+1);}} onRead={()=>setRefresh(value=>value+1)} onOpen={notification=>{setOpen(false);onOpen(notification);}}/>}
  </>;
}
function NotificationInbox({tenant,onClose,onRead,onOpen}:{tenant:string;onClose:()=>void;onRead:()=>void;onOpen:(notification:WorkspaceNotification)=>void}) {
  const dialog=useRef<HTMLDialogElement>(null);
  const alive=useRef(true);
  const pending=useRef(false);
  const [filter,setFilter]=useState<'all'|'unread'>('all');
  const [page,setPage]=useState(0);
  const [refresh,setRefresh]=useState(0);
  const [data,setData]=useState<NotificationList>({items:[],total:0,unread:0});
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [loadError,setLoadError]=useState('');
  const [notice,setNotice]=useState('');
  useEffect(()=>{
    alive.current=true;const element=dialog.current;element?.showModal();
    return()=>{alive.current=false;element?.close();};
  },[]);
  useEffect(()=>{
    const controller=new AbortController();setLoading(true);setLoadError('');
    void api<NotificationList>(`notifications?filter=${filter}&limit=20&offset=${page*20}`,tenant,{signal:controller.signal})
      .then(result=>{if(!controller.signal.aborted){setData(result);if(page>0&&page*20>=result.total)setPage(Math.max(0,Math.ceil(result.total/20)-1));}})
      .catch(e=>{if(!controller.signal.aborted){setData({items:[],total:0,unread:0});setLoadError(e instanceof Error?e.message:'Chargement impossible.');}})
      .finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return()=>controller.abort();
  },[tenant,filter,page,refresh]);
  function close(){if(!pending.current)onClose();}
  async function read(notification:WorkspaceNotification,navigate=false){
    if(pending.current)return;pending.current=true;setBusy(true);setError('');setNotice('');
    try{
      await api<NotificationReceipt>(`notifications/${notification.id}/read`,tenant,{method:'POST',body:JSON.stringify({status:'read'})});
      if(alive.current){onRead();if(navigate){onOpen(notification);}else{setNotice('Notification marquée comme lue.');setRefresh(value=>value+1);}}
    }catch(e){if(alive.current)setError(e instanceof Error?e.message:'Mise à jour impossible.');}
    finally{pending.current=false;if(alive.current)setBusy(false);}
  }
  return createPortal(<dialog ref={dialog} className="action-discussion-dialog notification-inbox" aria-labelledby="notification-inbox-title" onCancel={event=>{event.preventDefault();close();}}>
    <header className="action-discussion-header"><div><p className="section-kicker">VOTRE ESPACE</p><h2 id="notification-inbox-title">Notifications</h2><p>Attributions d’actions et nouveaux commentaires destinés au responsable.</p></div><button className="button button-outline" type="button" disabled={busy} onClick={close}>Fermer</button></header>
    <div className="action-discussion-tools"><label className="field-label">Afficher<select className="field-input" value={filter} disabled={busy} onChange={event=>{setFilter(event.target.value as 'all'|'unread');setPage(0);}}><option value="all">Toutes</option><option value="unread">Non lues</option></select></label><span>{loading?'Chargement…':loadError?'Décompte indisponible':`${data.unread} non lue${data.unread===1?'':'s'}`}</span><button className="button button-outline" type="button" disabled={busy||loading} onClick={()=>{setRefresh(value=>value+1);onRead();}}>Actualiser</button></div>
    {notice&&<p role="status" className="report-privacy">{notice}</p>}{error&&<p role="alert" className="document-error">{error}</p>}{loadError&&<p role="alert" className="document-error">{loadError}</p>}
    {loading?<p role="status">Chargement des notifications…</p>:loadError?<p className="attachments-hint">Les notifications ne sont pas disponibles. Réessayez avec Actualiser.</p>:<ul className="notification-inbox-list">{data.items.map(notification=><li key={notification.id} className={notification.readAt?'is-read':'is-unread'}><div><b>{notification.kind==='action_assigned'?'Une action vous a été attribuée':'Nouveau commentaire sur votre action'}</b>{!notification.readAt&&<span className="document-status">Non lue</span>}</div><h3>{notification.actionTitle}</h3><p>{notification.actorName} · <time dateTime={notification.createdAt}>{new Date(notification.createdAt).toLocaleString('fr-FR')}</time></p><div className="document-commands"><button className="button" type="button" disabled={busy} onClick={()=>void read(notification,true)}>Consulter le suivi</button>{!notification.readAt&&<button className="button button-outline" type="button" disabled={busy} onClick={()=>void read(notification)}>Marquer comme lue</button>}</div>{notification.readAt&&<small>Lue le {new Date(notification.readAt).toLocaleString('fr-FR')}</small>}</li>)}{!data.items.length&&<li>Aucune notification dans cette vue.</li>}</ul>}
    <div className="action-discussion-tools"><button className="button button-outline" type="button" disabled={busy||loading||page===0} onClick={()=>setPage(value=>value-1)}>Plus récentes</button><span className="attachments-hint">{data.total} notifications · Page {page+1}</span><button className="button button-outline" type="button" disabled={busy||loading||(page+1)*20>=data.total} onClick={()=>setPage(value=>value+1)}>Plus anciennes</button></div>
    <p className="attachments-hint">Seules vos notifications dont l’action reste accessible sont affichées. Le compteur se rafraîchit à l’ouverture de l’espace, au retour dans la fenêtre et chaque minute lorsqu’elle est visible. La consultation du suivi marque la notification comme lue.</p>
  </dialog>,document.body);
}
