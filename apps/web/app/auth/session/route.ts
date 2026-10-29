import { NextRequest,NextResponse } from 'next/server';
import { createRemoteJWKSet,jwtVerify } from 'jose';
import { cookieOptions,seal,sessionCookie } from '../../../lib/session';

export async function POST(request:NextRequest){
 const origin=process.env.PUBLIC_WEB_URL?new URL(process.env.PUBLIC_WEB_URL).origin:request.nextUrl.origin;
 if(request.headers.get('origin')!==origin)return NextResponse.json({message:'Origine refusée.'},{status:403});
 if(process.env.AUTH_MODE!=='supabase')return NextResponse.json({message:'Connexion indisponible.'},{status:404});
 const source=process.env.NEXT_PUBLIC_SUPABASE_URL;
 if(!source)return NextResponse.json({message:'Connexion indisponible.'},{status:503});
 try{
  const url=new URL(source);
  if(url.protocol!=='https:'||url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw new Error('Invalid provider URL');
  if(!request.headers.get('content-type')?.startsWith('application/json'))throw new Error('Invalid content type');
  const raw=await request.text();if(Buffer.byteLength(raw)>8192)throw new Error('Body too large');
  const body:unknown=JSON.parse(raw);
  if(!body||typeof body!=='object'||!('accessToken' in body)||typeof body.accessToken!=='string'||Object.keys(body).length!==1)throw new Error('Invalid body');
  const issuer=new URL('/auth/v1',url).href.replace(/\/$/,'');
  const jwks=createRemoteJWKSet(new URL('/auth/v1/.well-known/jwks.json',url),{timeoutDuration:5000});
  const {payload}=await jwtVerify(body.accessToken,jwks,{issuer,audience:'authenticated',algorithms:['RS256','ES256'],requiredClaims:['exp','iat','iss','sub','aud']});
  if(payload.aal!=='aal2'||!payload.exp)throw new Error('MFA required');
  const lifetime=Math.min(payload.exp-Math.floor(Date.now()/1000),3600);
  if(lifetime<=0)throw new Error('Expired');
  const cookie=await seal({accessToken:body.accessToken},lifetime);
  if(cookie.length>3800)throw new Error('Session too large');
  const response=NextResponse.json({ok:true},{headers:{'Cache-Control':'no-store'}});
  response.cookies.set(sessionCookie,cookie,{...cookieOptions,maxAge:lifetime});return response;
 }catch{return NextResponse.json({message:'Connexion impossible. Vérifiez votre code et réessayez.'},{status:401,headers:{'Cache-Control':'no-store'}});}
}
