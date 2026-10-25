export function readConfig(env = process.env) {
  const development = env.NODE_ENV === 'development';
  const devAuth = env.DEV_AUTH_ENABLED === 'true';
  const host = env.API_HOST || '127.0.0.1';
  if (devAuth && (!development || !['127.0.0.1', '::1', 'localhost'].includes(host))) {
    throw new Error('Development authentication requires NODE_ENV=development and a loopback API_HOST.');
  }
  if (!env.DATABASE_URL) throw new Error('DATABASE_URL is required. Use the restricted application database role.');
  if (!devAuth && (!env.OIDC_ISSUER || !env.OIDC_AUDIENCE || !env.OIDC_JWKS_URI)) {
    throw new Error('OIDC_ISSUER, OIDC_AUDIENCE and OIDC_JWKS_URI are required.');
  }
  if (env.OIDC_JWKS_URI) {
    const jwks = new URL(env.OIDC_JWKS_URI);
    if (jwks.protocol !== 'https:' && !(development && jwks.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(jwks.hostname))) {
      throw new Error('OIDC_JWKS_URI requires HTTPS; local HTTP is allowed only in development.');
    }
  }
  const port = Number(env.API_PORT || 4000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid API_PORT.');
  return {
    host, port, devAuth, databaseUrl: env.DATABASE_URL,
    issuer: env.OIDC_ISSUER || '', audience: env.OIDC_AUDIENCE || '', jwksUri: env.OIDC_JWKS_URI || '',
    devIssuer: 'urn:sentinelle:development', devSubject: 'jean-dupont',
  };
}
