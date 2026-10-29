'use client';
import { useEffect,useRef,useState } from 'react';
import { demoPath,resetDemo } from '../lib/demo.mjs';
export default function DemoBanner(){
 const banner=useRef<HTMLElement|null>(null);
 const [active,setActive]=useState(false);useEffect(()=>setActive(demoPath()),[]);
 useEffect(()=>{if(!active||!banner.current)return;const update=()=>document.documentElement.style.setProperty('--demo-banner-height',`${banner.current?.getBoundingClientRect().height||0}px`);update();const observer=new ResizeObserver(update);observer.observe(banner.current);return()=>{observer.disconnect();document.documentElement.style.removeProperty('--demo-banner-height');};},[active]);
 if(!active)return null;
 return <aside ref={banner} className="demo-banner" aria-label="Mode démonstration"><div><b>DÉMONSTRATION — Alex Démo, administrateur fictif</b><p>Données inventées. Actions et commentaires conservés dans ce navigateur. Les autres opérations peuvent être limitées ; aucun contrôle serveur ni envoi de fichier n’est simulé.</p></div><div className="document-commands"><a href="/demo">Espace QHSE</a><a href="/demo/admin">Administration fictive</a><button type="button" onClick={()=>{if(window.confirm('Effacer vos modifications de démonstration et restaurer les exemples ?'))resetDemo();}}>Réinitialiser</button><a href="/">Quitter la démo</a></div></aside>;
}
