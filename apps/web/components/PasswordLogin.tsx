'use client';
import { useRef,useState } from 'react';
import { createClient,type SupabaseClient } from '@supabase/supabase-js';

type Stage='password'|'code';
export default function PasswordLogin(){
 const client=useRef<SupabaseClient|null>(null);
 const [stage,setStage]=useState<Stage>('password'),[factor,setFactor]=useState(''),[qr,setQr]=useState(''),[secret,setSecret]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function login(event:React.FormEvent<HTMLFormElement>){
  event.preventDefault();if(busy)return;setBusy(true);setError('');
  try{
   const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
   if(!url||!key)throw new Error('Le service de connexion n’est pas configuré.');
   const provider=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});client.current=provider;
   const data=new FormData(event.currentTarget);
   const {error:signError}=await provider.auth.signInWithPassword({email:String(data.get('email')||'').trim(),password:String(data.get('password')||'')});
   if(signError)throw new Error('Adresse ou mot de passe incorrect, ou compte indisponible.');
   const {data:factors,error:listError}=await provider.auth.mfa.listFactors();if(listError)throw new Error('Impossible de vérifier votre second facteur.');
   const existing=factors.totp.find(item=>item.status==='verified');
   if(existing){setFactor(existing.id);setQr('');setSecret('');}
   else{
    const {data:created,error:enrollError}=await provider.auth.mfa.enroll({factorType:'totp',friendlyName:'Sentinel'});
    if(enrollError||!created)throw new Error('Impossible de configurer le second facteur. Contactez votre administrateur.');
    setFactor(created.id);setQr(created.totp.qr_code);setSecret(created.totp.secret);
   }
   setStage('code');
  }catch(e){setError(e instanceof Error?e.message:'Connexion indisponible.');}finally{setBusy(false);}
 }
 async function verify(event:React.FormEvent<HTMLFormElement>){
  event.preventDefault();if(!client.current||busy)return;setBusy(true);setError('');
  try{
   const code=String(new FormData(event.currentTarget).get('code')||'').trim();
   if(!/^\d{6}$/.test(code))throw new Error('Saisissez le code à six chiffres.');
   const {data,error:verificationError}=await client.current.auth.mfa.challengeAndVerify({factorId:factor,code});
   if(verificationError||!data?.access_token)throw new Error('Code invalide ou expiré. Réessayez.');
   const response=await fetch('/auth/session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({accessToken:data.access_token}),cache:'no-store'});
   if(!response.ok)throw new Error('La session ne peut pas être créée. Contactez votre administrateur.');
   const target=new URLSearchParams(window.location.search).get('returnTo')==='admin'?'/admin':'/';window.location.assign(target);
  }catch(e){setError(e instanceof Error?e.message:'Vérification impossible.');}finally{setBusy(false);}
 }
 function restart(){client.current=null;setStage('password');setFactor('');setQr('');setSecret('');setError('');}
 return <main className="module-page platform-admin"><section className="panel auth-panel"><h1>Connexion à Sentinel</h1><p>Utilisez le compte créé par votre administrateur.</p>{error&&<p className="document-error" role="alert">{error}</p>}
 {stage==='password'?<form onSubmit={login}><fieldset disabled={busy}><label className="field-label">Adresse e-mail<input className="field-input" name="email" type="email" autoComplete="username" required maxLength={254}/></label><label className="field-label">Mot de passe<input className="field-input" name="password" type="password" autoComplete="current-password" required maxLength={1024}/></label><button className="button button-primary" type="submit">Continuer</button><p><a href="/auth/recovery">Mot de passe oublié ?</a></p></fieldset></form>:<form onSubmit={verify}><fieldset disabled={busy}><h2>Vérification en deux étapes</h2>{qr&&<><p>Ajoutez ce compte dans votre application d’authentification, puis saisissez le code affiché.</p><img src={qr} width={200} height={200} alt="Code QR pour l’application d’authentification"/><details><summary>Impossible de scanner ?</summary><p>Clé de configuration : <code>{secret}</code></p></details></>}<label className="field-label">Code à six chiffres<input className="field-input" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" required maxLength={6}/></label><div className="document-commands"><button className="button button-primary" type="submit">Vérifier et se connecter</button><button className="button button-outline" type="button" onClick={restart}>Recommencer</button></div></fieldset></form>}
 </section></main>;
}
