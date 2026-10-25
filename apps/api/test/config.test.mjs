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
