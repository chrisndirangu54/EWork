import { createPublicKey, verify } from 'node:crypto';

type FirebaseClaims = {
  iss: string; aud: string; sub: string; iat: number; exp: number; auth_time: number;
  email?: string; email_verified?: boolean; name?: string; picture?: string;
};
let cache: { certificates: Record<string, string>; expiresAt: number } | null = null;
const CERT_URL = 'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';

function jsonPart(part: string): Record<string, unknown> {
  if (part.length > 12000) throw new Error('Token segment too large');
  return JSON.parse(Buffer.from(part, 'base64url').toString('utf8')) as Record<string, unknown>;
}

async function certificates(): Promise<Record<string, string>> {
  if (cache && cache.expiresAt > Date.now()) return cache.certificates;
  const response = await fetch(CERT_URL, { signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error('Firebase certificate retrieval failed');
  const entries = await response.json() as Record<string, string>;
  if (!entries || typeof entries !== 'object') throw new Error('Invalid Firebase certificates');
  const header = response.headers.get('cache-control') || '';
  const maxAge = Number(/max-age=(\d+)/.exec(header)?.[1] ?? '600');
  cache = { certificates: entries, expiresAt: Date.now() + Math.min(3600, Math.max(60, maxAge)) * 1000 };
  return entries;
}

/** Fail-closed Firebase ID token verification. Not a general Google OAuth token validator. */
export async function verifyFirebaseIdToken(idToken: string, projectId: string): Promise<FirebaseClaims> {
  if (!projectId || !/^[a-zA-Z0-9-]{3,100}$/.test(projectId)) throw new Error('FIREBASE_PROJECT_ID missing or invalid');
  if (!idToken || idToken.length > 12000) throw new Error('Invalid token size');
  const parts = idToken.split('.');
  if (parts.length !== 3) throw new Error('Invalid JWT format');
  const header = jsonPart(parts[0]);
  const claims = jsonPart(parts[1]) as unknown as FirebaseClaims;
  if (header.alg !== 'RS256' || typeof header.kid !== 'string' || !/^[A-Za-z0-9_-]+$/.test(header.kid)) {
    throw new Error('Invalid Firebase token header');
  }
  const now = Math.floor(Date.now() / 1000);
  if (claims.iss !== `https://securetoken.google.com/${projectId}` || claims.aud !== projectId ||
      typeof claims.sub !== 'string' || !claims.sub || claims.sub.length > 128 ||
      typeof claims.exp !== 'number' || claims.exp <= now ||
      typeof claims.iat !== 'number' || claims.iat > now ||
      typeof claims.auth_time !== 'number' || claims.auth_time > now) {
    throw new Error('Invalid Firebase token claims');
  }
  const pem = (await certificates())[header.kid];
  if (typeof pem !== 'string') throw new Error('Unrecognized signing key');
  const signature = Buffer.from(parts[2], 'base64url');
  if (!signature.length || !verify('RSA-SHA256', Buffer.from(parts[0] + '.' + parts[1]), createPublicKey(pem), signature)) {
    throw new Error('Invalid Firebase signature');
  }
  return claims;
}
