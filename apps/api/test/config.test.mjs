import test from 'node:test';
import assert from 'node:assert/strict';
import { readConfig } from '../src/config.mjs';

const local = { DATABASE_URL: 'postgres://restricted@localhost/sentinelle', NODE_ENV: 'development', DEV_AUTH_ENABLED: 'true' };
test('development identity is limited to explicit local development', () => {
  assert.equal(readConfig(local).devAuth, true);
  for (const override of [{ NODE_ENV: 'production' }, { NODE_ENV: 'test' }, { NODE_ENV: undefined }, { API_HOST: '0.0.0.0' }]) {
    assert.throws(() => readConfig({ ...local, ...override }), /loopback/);
  }
});
test('normal startup requires database and OIDC configuration', () => {
  assert.throws(() => readConfig({}), /DATABASE_URL/);
  assert.throws(() => readConfig({ DATABASE_URL: local.DATABASE_URL }), /OIDC/);
  const production = readConfig({ DATABASE_URL: local.DATABASE_URL, NODE_ENV: 'production', OIDC_ISSUER: 'https://id.example.org', OIDC_AUDIENCE: 'sentinelle-api', OIDC_JWKS_URI: 'https://id.example.org/jwks' });
  assert.equal(production.devAuth, false);
});
test('unencrypted external JWKS endpoints are rejected', () => {
  assert.throws(() => readConfig({ ...local, OIDC_JWKS_URI: 'http://example.org/jwks' }), /HTTPS/);
  assert.throws(() => readConfig({ ...local, OIDC_JWKS_URI: 'file:///tmp/jwks.json' }), /HTTPS/);
  assert.equal(readConfig({ ...local, OIDC_JWKS_URI: 'http://127.0.0.1:9000/jwks' }).devAuth, true);
});
test('file storage stays optional and validates region and endpoint without exposing credentials',()=>{
  assert.equal(readConfig(local).storage,null);
  assert.throws(()=>readConfig({...local,S3_BUCKET:'sentinelle-files'}),/S3_REGION/);
  assert.throws(()=>readConfig({...local,S3_BUCKET:'sentinelle-files',S3_REGION:'us-east-1',S3_ENDPOINT:'http://example.org'}),/HTTPS/);
  assert.throws(()=>readConfig({...local,S3_BUCKET:'sentinelle-files',S3_REGION:'us-east-1',S3_ENDPOINT:'https://user:password@example.org'}),/credentials/);
  const config=readConfig({...local,S3_BUCKET:'sentinelle-files',S3_REGION:'us-east-1',S3_ENDPOINT:'http://127.0.0.1:9000',S3_FORCE_PATH_STYLE:'true'});
  assert.equal(config.storage.forcePathStyle,true);assert.equal(config.storage.bucket,'sentinelle-files');
});

test('MFA enforcement is explicit and rejects invalid configuration',()=>{
  const env={NODE_ENV:'development',DATABASE_URL:'postgresql://localhost/db',DEV_AUTH_ENABLED:'true'};
  assert.equal(readConfig(env).requireMfa,false);
  assert.equal(readConfig({...env,AUTH_REQUIRE_MFA:'true'}).requireMfa,true);
  assert.throws(()=>readConfig({...env,AUTH_REQUIRE_MFA:'yes'}),/AUTH_REQUIRE_MFA/);
});


test('hosted PORT is used unless API_PORT is set',()=>{
  assert.equal(readConfig({...local,PORT:'12345'}).port,12345);
  assert.equal(readConfig({...local,PORT:'12345',API_PORT:'12346'}).port,12346);
  assert.throws(()=>readConfig({...local,PORT:'not-a-port'}),/API_PORT/);
});


test('Supabase issuer cannot start without explicit MFA enforcement',()=>{
  const supabase={NODE_ENV:'production',DATABASE_URL:local.DATABASE_URL,OIDC_ISSUER:'https://example.supabase.co/auth/v1',OIDC_AUDIENCE:'authenticated',OIDC_JWKS_URI:'https://example.supabase.co/auth/v1/.well-known/jwks.json'};
  assert.throws(()=>readConfig(supabase),/AUTH_REQUIRE_MFA/);
  assert.throws(()=>readConfig({...supabase,AUTH_REQUIRE_MFA:'false'}),/AUTH_REQUIRE_MFA/);
  assert.equal(readConfig({...supabase,AUTH_REQUIRE_MFA:'true'}).requireMfa,true);
});
