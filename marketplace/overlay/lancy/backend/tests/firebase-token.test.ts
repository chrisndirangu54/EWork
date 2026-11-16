import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { verifyFirebaseIdToken } from '../src/common/security/firebase-id-token';

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const oldFetch = globalThis.fetch;
(globalThis as any).fetch = async () => ({
  ok: true,
  headers: { get: () => 'max-age=180' },
  json: async () => ({ valid_key: publicKey.export({ type: 'spki', format: 'pem' }).toString() }),
});
const project = 'test-verified-project';
const now = Math.floor(Date.now() / 1000);
const encoded = (v: object) => Buffer.from(JSON.stringify(v)).toString('base64url');
function jwt(claims: Record<string, unknown>, alg = 'RS256') {
  const body = encoded({ iss: `https://securetoken.google.com/${project}`, aud: project,
    sub: 'verified-test-uid', iat: now - 30, exp: now + 600, auth_time: now - 30,
    email: 'client@example.org', email_verified: true, ...claims });
  const data = encoded({ alg, kid: 'valid_key', typ: 'JWT' }) + '.' + body;
  return data + '.' + sign('RSA-SHA256', Buffer.from(data), privateKey).toString('base64url');
}

test('accepts a properly signed and scoped Firebase ID token', async () => {
  const token = await verifyFirebaseIdToken(jwt({}), project);
  assert.equal(token.sub, 'verified-test-uid');
});

test('rejects arbitrary strings, a none algorithm, wrong project and expired tokens', async () => {
  await assert.rejects(verifyFirebaseIdToken('client@example.org', project));
  await assert.rejects(verifyFirebaseIdToken(jwt({}, 'none'), project));
  await assert.rejects(verifyFirebaseIdToken(jwt({ aud: 'different-project' }), project));
  await assert.rejects(verifyFirebaseIdToken(jwt({ exp: now - 60 }), project));
});

test('rejects tampered signatures', async () => {
  const token = jwt({});
  const parts = token.split('.');
  parts[1] = encoded({ ...JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')), sub: 'intruder' });
  await assert.rejects(verifyFirebaseIdToken(parts.join('.'), project));
});

test.after(() => { globalThis.fetch = oldFetch; });
