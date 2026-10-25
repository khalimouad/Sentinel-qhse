import { NextRequest, NextResponse } from 'next/server';
import { cookieOptions, sessionCookie } from '../../../lib/session';
import { publicWebUrl } from '../../../lib/oidc';

export async function POST(request: NextRequest) {
  const expectedOrigin = process.env.PUBLIC_WEB_URL ? publicWebUrl().origin : request.nextUrl.origin;
  if (request.headers.get('origin') !== expectedOrigin) return NextResponse.json({ message: 'Origin rejected.' },{ status: 403 });
  const response = NextResponse.redirect(publicWebUrl(),303);
  response.cookies.set(sessionCookie,'', { ...cookieOptions, maxAge: 0 });
  return response;
}
