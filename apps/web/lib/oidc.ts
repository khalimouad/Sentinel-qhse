import * as oidc from 'openid-client';
let configuration: Promise<oidc.Configuration> | undefined;
export function oidcConfiguration() {
  if (!configuration) {
    const { OIDC_ISSUER, OIDC_CLIENT_ID, OIDC_CLIENT_SECRET } = process.env;
    if (!OIDC_ISSUER || !OIDC_CLIENT_ID || !OIDC_CLIENT_SECRET || !process.env.PUBLIC_WEB_URL) throw new Error('OIDC web client configuration is missing.');
    const issuer = new URL(OIDC_ISSUER);
    if (issuer.protocol !== 'https:') throw new Error('OIDC discovery requires HTTPS.');
    configuration = oidc.discovery(issuer,OIDC_CLIENT_ID,OIDC_CLIENT_SECRET).catch(error => { configuration = undefined; throw error; });
  }
  return configuration;
}
export function publicWebUrl() {
  const url = new URL(process.env.PUBLIC_WEB_URL || 'http://127.0.0.1:3000');
  if (process.env.NODE_ENV === 'production' && url.protocol !== 'https:') throw new Error('PUBLIC_WEB_URL requires HTTPS.');
  return url;
}
