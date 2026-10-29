import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import * as oidc from 'openid-client';
import { oidcConfiguration, publicWebUrl } from '../../../lib/oidc';
import { cookieOptions, flowCookie, sessionCookie, seal, unseal } from '../../../lib/session';

export async function GET(request: NextRequest) {
  const response = NextResponse.redirect(publicWebUrl());
  response.cookies.set(flowCookie,'', { ...cookieOptions, maxAge: 0 });
  response.headers.set('Cache-Control','no-store');
  try {
    const flowValue = (await cookies()).get(flowCookie)?.value;
    if (!flowValue) throw new Error('Missing flow');
    const flow = await unseal(flowValue);
    if (typeof flow.verifier !== 'string' || typeof flow.state !== 'string' || typeof flow.nonce !== 'string') throw new Error('Invalid flow');
    const callback = new URL('/auth/callback',publicWebUrl());
    callback.search = request.nextUrl.search;
    const tokens = await oidc.authorizationCodeGrant(await oidcConfiguration(),callback,{
      pkceCodeVerifier: flow.verifier, expectedState: flow.state, expectedNonce: flow.nonce,
    });
    const lifetime = Math.min(Number(tokens.expires_in || 3600),28800);
    if (!Number.isFinite(lifetime) || lifetime <= 0) throw new Error('Invalid token lifetime');
    const session = await seal({ accessToken: tokens.access_token },lifetime);
    if (session.length > 3800) throw new Error('Token requires server-side session storage');
    response.cookies.set(sessionCookie,session, { ...cookieOptions, maxAge: lifetime });
    if(flow.returnTo==='/admin')response.headers.set('Location',new URL('/admin',publicWebUrl()).href);
    return response;
  } catch {
    response.cookies.set(sessionCookie,'', { ...cookieOptions, maxAge: 0 });
    response.headers.set('Location',new URL('/?login=failed',publicWebUrl()).href);
    return response;
  }
}
