import { cookies } from 'next/headers';
import { EncryptJWT, jwtDecrypt } from 'jose';

const production = process.env.NODE_ENV === 'production';
export const sessionCookie = production ? '__Host-sentinelle' : 'sentinelle';
export const flowCookie = production ? '__Host-sentinelle-flow' : 'sentinelle-flow';
export const cookieOptions = { httpOnly: true, secure: production, sameSite: 'lax' as const, path: '/' };
function key() {
  const value = Buffer.from(process.env.SESSION_SECRET || '', 'base64');
  if (value.length !== 32) throw new Error('SESSION_SECRET must be a base64-encoded 32-byte key.');
  return value;
}
export async function seal(value: Record<string, unknown>, seconds: number) {
  return new EncryptJWT(value).setProtectedHeader({ alg: 'dir', enc: 'A256GCM' }).setIssuedAt().setExpirationTime(`${seconds}s`).encrypt(key());
}
export async function unseal(value: string) {
  const { payload } = await jwtDecrypt(value,key(), { keyManagementAlgorithms: ['dir'], contentEncryptionAlgorithms: ['A256GCM'] });
  return payload;
}
export async function accessToken() {
  const value = (await cookies()).get(sessionCookie)?.value;
  if (!value) return undefined;
  try { const session = await unseal(value); return typeof session.accessToken === 'string' ? session.accessToken : undefined; }
  catch { return undefined; }
}
