import { NextRequest, NextResponse } from 'next/server';
import { accessToken } from '../../../lib/session';

async function proxy(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  // Forward only this API version; no open proxy to arbitrary hosts or paths.
  if (path[0] !== 'v1' || path.some(segment => !/^[a-zA-Z0-9-]+$/.test(segment))) return NextResponse.json({ message: 'Not found.' }, { status: 404 });
  const mutation = request.method !== 'GET';
  const expectedOrigin = process.env.PUBLIC_WEB_URL ? new URL(process.env.PUBLIC_WEB_URL).origin : request.nextUrl.origin;
  if (mutation && request.headers.get('origin') !== expectedOrigin) return NextResponse.json({ message: 'Origin rejected.' }, { status: 403 });
  if (process.env.NODE_ENV === 'production' && !process.env.INTERNAL_API_URL) return NextResponse.json({ message: 'Le service applicatif n’est pas encore configuré. Contactez l’administrateur de la plateforme.' },{ status: 503,headers:{'Cache-Control':'no-store'} });
  const token = await accessToken();
  const localDevelopment = process.env.NODE_ENV === 'development' && process.env.DEV_AUTH_ENABLED === 'true';
  if (!token && !localDevelopment) return NextResponse.json({ message: 'Connexion requise.' },{ status: 401 });
  const headers = new Headers({ 'Accept': 'application/json' });
  if (token) headers.set('Authorization',`Bearer ${token}`);
  const tenant = request.headers.get('x-tenant-id');
  if (tenant) headers.set('X-Tenant-Id',tenant);
  let body: string | undefined;
  if (mutation) {
    if (!request.headers.get('content-type')?.startsWith('application/json')) return NextResponse.json({ message: 'JSON required.' },{ status: 415 });
    body = await request.text();
    if (Buffer.byteLength(body) > 65536) return NextResponse.json({ message: 'Request too large.' },{ status: 413 });
    headers.set('Content-Type','application/json');
  }
  try {
    const url = new URL(`/api/${path.map(encodeURIComponent).join('/')}`,process.env.INTERNAL_API_URL || 'http://127.0.0.1:4000');
    url.search = request.nextUrl.search;
    const timeout=path[1]==='attachments'&&path.at(-1)==='confirm'?60000:20000;
    const upstream = await fetch(url,{ method: request.method,headers,body,cache: 'no-store',redirect: 'error',signal: AbortSignal.timeout(timeout) });
    return new Response(upstream.body,{ status: upstream.status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
  } catch { return NextResponse.json({ message: 'Le service est temporairement indisponible.' },{ status: 503 }); }
}
export { proxy as GET, proxy as POST, proxy as PATCH };
