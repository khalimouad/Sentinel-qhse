'use client';
import { useEffect,useRef,useState } from 'react';
import { createClient,type SupabaseClient } from '@supabase/supabase-js';
export default function ResetPassword(){
 const client=useRef<SupabaseClient|null>(null),[state,setState]=useState<'loading'|'invalid'|'mfa'|'password'|'done'>('loading'),[factor,setFactor]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{let active=true;const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if(!url||!key){setState('invalid');return;}
  const provider=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:true}});client.current=provider;
  void (async()=>{const {data,error}=await provider.auth.getSession();if(error||!data.session)throw new Error('Lien invalide ou expiré.');
   const {data:factors,error:factorError}=await provider.auth.mfa.listFactors();if(factorError)throw new Error('Impossible de vérifier le second facteur.');
   const verified=factors.totp.find(item=>item.status==='verified');if(active){if(verified){setFactor(verified.id);setState('mfa');}else setState('password');}
  })().catch(()=>{if(active)setState('invalid');});return()=>{active=false;};
 },[]);
 async function submit(event:React.FormEvent<HTMLFormElement>){event.preventDefault();if(!client.current||busy)return;setBusy(true);setError('');try{
  const values=new FormData(event.currentTarget);
  if(state==='mfa'){const code=String(values.get('code')||'');if(!/^\d{6}$/.test(code))throw new Error('Saisissez le code à six chiffres.');const {error}=await client.current.auth.mfa.challengeAndVerify({factorId:factor,code});if(error)throw new Error('Code invalide ou expiré.');setState('password');}
  else if(state==='password'){const password=String(values.get('password')||''),confirm=String(values.get('confirm')||'');if(password.length<12||password.length>1024)throw new Error('Choisissez un mot de passe de 12 caractères minimum.');if(password!==confirm)throw new Error('Les mots de passe ne correspondent pas.');const {error}=await client.current.auth.updateUser({password});if(error)throw new Error('Le mot de passe ne peut pas être modifié. Recommencez la procédure.');await client.current.auth.signOut({scope:'local'});client.current=null;setState('done');}
 }catch(e){setError(e instanceof Error?e.message:'Opération impossible.');}finally{setBusy(false);}}
 return <main className="module-page platform-admin"><section className="panel auth-panel"><h1>Définir un nouveau mot de passe</h1>{state==='loading'&&<p role="status">Vérification du lien…</p>}{state==='invalid'&&<p>Le lien est invalide ou expiré. <a href="/auth/recovery">Demander un nouveau lien</a>.</p>}{state==='done'&&<p>Votre mot de passe a été modifié. <a href="/auth/password">Se connecter</a>.</p>}{(state==='mfa'||state==='password')&&<form onSubmit={submit}><fieldset disabled={busy}>{state==='mfa'?<label className="field-label">Code à six chiffres de votre application<input className="field-input" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required/></label>:<><label className="field-label">Nouveau mot de passe<input className="field-input" name="password" type="password" autoComplete="new-password" minLength={12} maxLength={1024} required/></label><label className="field-label">Confirmer le mot de passe<input className="field-input" name="confirm" type="password" autoComplete="new-password" minLength={12} maxLength={1024} required/></label></>}<button className="button button-primary" type="submit">{state==='mfa'?'Vérifier':'Enregistrer'}</button></fieldset></form>}{error&&<p className="document-error" role="alert">{error}</p>}</section></main>;
}
