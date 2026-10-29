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
  if (env.AUTH_REQUIRE_MFA && !['true','false'].includes(env.AUTH_REQUIRE_MFA)) throw new Error('AUTH_REQUIRE_MFA must be true or false.');
  const requireMfa = env.AUTH_REQUIRE_MFA === 'true';
  // Supabase sessions must not be accepted at the first authentication factor.
  if (!devAuth && env.OIDC_ISSUER) {
    const issuer = new URL(env.OIDC_ISSUER);
    if (issuer.hostname.endsWith('.supabase.co') && issuer.pathname.replace(/\/$/, '') === '/auth/v1' && !requireMfa) {
      throw new Error('AUTH_REQUIRE_MFA=true is required for Supabase Auth.');
    }
  }
  const port = Number(env.API_PORT || env.PORT || 4000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid API_PORT.');
  let storage=null;
  if(env.S3_BUCKET){
    if(!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(env.S3_BUCKET)||!env.S3_REGION)throw new Error('A valid S3_BUCKET and explicit S3_REGION are required.');
    if(env.S3_ENDPOINT){const endpoint=new URL(env.S3_ENDPOINT);if(endpoint.protocol!=='https:'&&!(development&&endpoint.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(endpoint.hostname)))throw new Error('S3_ENDPOINT requires HTTPS except for local development.');if(endpoint.username||endpoint.password||endpoint.search||endpoint.hash)throw new Error('S3_ENDPOINT must not include credentials, query or fragment.');}
    storage={bucket:env.S3_BUCKET,region:env.S3_REGION,endpoint:env.S3_ENDPOINT,forcePathStyle:env.S3_FORCE_PATH_STYLE==='true'};
  }
  return {
    host, port, devAuth, requireMfa, databaseUrl: env.DATABASE_URL,
    issuer: env.OIDC_ISSUER || '', audience: env.OIDC_AUDIENCE || '', jwksUri: env.OIDC_JWKS_URI || '',
    devIssuer: 'urn:sentinelle:development', devSubject: 'jean-dupont',
    storage,
  };
}
