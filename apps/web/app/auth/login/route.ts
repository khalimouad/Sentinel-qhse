import { NextRequest, NextResponse } from 'next/server';
import * as oidc from 'openid-client';
import { oidcConfiguration, publicWebUrl } from '../../../lib/oidc';
import { cookieOptions, flowCookie, seal } from '../../../lib/session';

export async function GET(request: NextRequest) {
  if(process.env.AUTH_MODE==='supabase'){const target=new URL('/auth/password',request.url);if(request.nextUrl.searchParams.get('returnTo')==='admin')target.searchParams.set('returnTo','admin');return NextResponse.redirect(target);}
  try {
    const config = await oidcConfiguration();
    const verifier = oidc.randomPKCECodeVerifier();
    const state = oidc.randomState();
    const nonce = oidc.randomNonce();
    const parameters = new URLSearchParams({
      redirect_uri: new URL('/auth/callback',publicWebUrl()).href,
      scope: process.env.OIDC_SCOPE || 'openid profile', state, nonce,
      code_challenge: await oidc.calculatePKCECodeChallenge(verifier), code_challenge_method: 'S256',
    });
    if (process.env.OIDC_RESOURCE) parameters.set('resource',process.env.OIDC_RESOURCE);
    if (process.env.OIDC_AUTHORIZATION_AUDIENCE) parameters.set('audience',process.env.OIDC_AUTHORIZATION_AUDIENCE);
    const url = oidc.buildAuthorizationUrl(config,parameters);
    const response = NextResponse.redirect(url);
    response.cookies.set(flowCookie,await seal({ verifier,state,nonce,returnTo:request.nextUrl.searchParams.get('returnTo')==='admin'?'/admin':'/' },600), { ...cookieOptions, maxAge: 600 });
    response.headers.set('Cache-Control','no-store');
    return response;
  } catch { return NextResponse.json({ message: 'La connexion SSO n’est pas disponible. Contactez votre administrateur.' },{ status: 503 }); }
}
