'use client';
import { useState } from 'react';
import { createClient } from '@supabase/supabase-js';
export default function Recovery(){
 const [busy,setBusy]=useState(false),[sent,setSent]=useState(false),[error,setError]=useState('');
 async function submit(event:React.FormEvent<HTMLFormElement>){event.preventDefault();if(busy)return;setBusy(true);setError('');try{
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if(!url||!key)throw new Error('Le service de connexion n’est pas configuré.');
  const provider=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
  const email=String(new FormData(event.currentTarget).get('email')||'').trim();
  const {error}=await provider.auth.resetPasswordForEmail(email,{redirectTo:new URL('/auth/reset',window.location.origin).href});
  if(error)throw new Error('La demande ne peut pas être envoyée. Réessayez plus tard.');setSent(true);
 }catch(e){setError(e instanceof Error?e.message:'Service indisponible.');}finally{setBusy(false);}}
 return <main className="module-page platform-admin"><section className="panel auth-panel"><h1>Mot de passe oublié</h1>{sent?<p>Si un compte correspond à cette adresse, les instructions de réinitialisation seront envoyées.</p>:<form onSubmit={submit}><fieldset disabled={busy}><label className="field-label">Adresse e-mail<input className="field-input" name="email" type="email" autoComplete="email" required maxLength={254}/></label><button className="button button-primary" type="submit">Envoyer les instructions</button></fieldset></form>}{error&&<p className="document-error" role="alert">{error}</p>}<p><a href="/auth/password">Retour à la connexion</a></p></section></main>;
}
