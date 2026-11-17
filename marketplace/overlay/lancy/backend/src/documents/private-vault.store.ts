import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';
import { ServiceUnavailableException } from '@nestjs/common';

/**
 * Private encrypted blob adapter.
 * Production Cloud Run MUST use Cloud Storage; Cloud Run's local FS is ephemeral.
 * The Cloud Run service identity is used directly via the metadata-server token,
 * so no JSON service account keys are stored in the container or repository.
 */
const MAX_ENCRYPTED_FILE = 2 * 1024 * 1024 + 28;
const OBJECT_KEY = /^[a-f0-9-]{36}\.vault$/;
type Configuration = { mode: 'gcs'|'local'; dir?: string; bucket?: string };
let cached: { token: string; expiresAt: number } | undefined;

function configuration(): Configuration {
  const mode = process.env.DOCUMENT_VAULT_BACKEND || 'local';
  if (mode !== 'gcs' && mode !== 'local') throw new ServiceUnavailableException('Invalid vault backend');
  if (process.env.NODE_ENV === 'production' && mode !== 'gcs') {
    throw new ServiceUnavailableException('Production requires private Cloud Storage');
  }
  if (process.env.NODE_ENV === 'production' && process.env.DOCUMENT_VAULT_APPROVED !== 'true') {
    throw new ServiceUnavailableException('Vault requires launch security approval');
  }
  if (mode === 'gcs') {
    const bucket = process.env.DOCUMENT_VAULT_GCS_BUCKET || '';
    if (!/^[a-z0-9][a-z0-9._-]{1,60}[a-z0-9]$/.test(bucket) || bucket.includes('..')) {
      throw new ServiceUnavailableException('Private Cloud Storage bucket is not configured');
    }
    return { mode, bucket };
  }
  const dir = process.env.DOCUMENT_VAULT_DIR || '';
  if (!isAbsolute(dir)) throw new ServiceUnavailableException('Local vault requires absolute private path');
  return { mode, dir: resolve(dir) };
}
async function accessToken(): Promise<string> {
  if (cached && cached.expiresAt > Date.now() + 60000) return cached.token;
  const response = await fetch('http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token', {
    headers: { 'Metadata-Flavor': 'Google' }, signal: AbortSignal.timeout(4000),
  });
  if (!response.ok) throw new ServiceUnavailableException('Cloud Run identity token unavailable');
  const token = await response.json() as { access_token?: string; expires_in?: number };
  if (!token.access_token || typeof token.expires_in !== 'number') {
    throw new ServiceUnavailableException('Invalid Cloud Run access token');
  }
  cached = { token: token.access_token, expiresAt: Date.now() + Math.max(1, token.expires_in - 90) * 1000 };
  return token.access_token;
}
async function gcsRequest(bucket: string, objectKey: string, action: 'read'|'write'|'delete', encrypted?: Buffer): Promise<Buffer|void> {
  const token = await accessToken();
  const key = encodeURIComponent(objectKey);
  const base = 'https://storage.googleapis.com';
  const url = action === 'write'
    ? `${base}/upload/storage/v1/b/${bucket}/o?uploadType=media&name=${key}&ifGenerationMatch=0`
    : `${base}/storage/v1/b/${bucket}/o/${key}${action === 'read' ? '?alt=media' : ''}`;
  const response = await fetch(url, {
    method: action === 'write' ? 'POST' : action === 'delete' ? 'DELETE' : 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      ...(action === 'write' ? { 'Content-Type': 'application/octet-stream' } : {}),
    },
    ...(encrypted ? { body: new Uint8Array(encrypted) } : {}),
    signal: AbortSignal.timeout(12000),
  });
  if (action === 'delete' && response.status === 404) return;
  if (!response.ok) throw new ServiceUnavailableException(`Private object ${action} failed`);
  if (action === 'read') {
    const size = Number(response.headers.get('content-length'));
    if (Number.isFinite(size) && size > MAX_ENCRYPTED_FILE) throw new ServiceUnavailableException('Object too large');
    const body = Buffer.from(await response.arrayBuffer());
    if (body.length > MAX_ENCRYPTED_FILE) throw new ServiceUnavailableException('Object exceeds vault limit');
    return body;
  }
}

export class PrivateVaultStore {
  private validate(key: string) {
    if (!OBJECT_KEY.test(key)) throw new ServiceUnavailableException('Invalid private object key');
  }
  async write(objectKey: string, encrypted: Buffer): Promise<void> {
    this.validate(objectKey);
    if (!encrypted.length || encrypted.length > MAX_ENCRYPTED_FILE) {
      throw new ServiceUnavailableException('Invalid encrypted payload');
    }
    const cfg = configuration();
    if (cfg.mode === 'gcs') {
      await gcsRequest(cfg.bucket!, objectKey, 'write', encrypted);
    } else {
      await mkdir(cfg.dir!, { recursive: true, mode: 0o700 });
      await writeFile(join(cfg.dir!, objectKey), encrypted, { mode: 0o600, flag: 'wx' });
    }
  }
  async read(objectKey: string): Promise<Buffer> {
    this.validate(objectKey);
    const cfg = configuration();
    if (cfg.mode === 'gcs') return await gcsRequest(cfg.bucket!, objectKey, 'read') as Buffer;
    const body = await readFile(join(cfg.dir!, objectKey));
    if (body.length > MAX_ENCRYPTED_FILE) throw new ServiceUnavailableException('Encrypted payload too large');
    return body;
  }
  async remove(objectKey: string): Promise<void> {
    this.validate(objectKey);
    const cfg = configuration();
    if (cfg.mode === 'gcs') {
      await gcsRequest(cfg.bucket!, objectKey, 'delete');
    } else {
      await unlink(join(cfg.dir!, objectKey)).catch(error => {
        if (error?.code !== 'ENOENT') throw error;
      });
    }
  }
}
