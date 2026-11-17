import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { BadRequestException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { PrivateVaultStore } from './private-vault.store';
import { PrismaService } from '../database/prisma.service';
import { AuthenticatedUser } from '../common/decorators/current-user.decorator';

type Scope = 'FREELANCE_ORDER' | 'MANAGED_ENGAGEMENT' | 'GLOBAL_JOB';
const MIME = new Set(['application/pdf', 'image/png', 'image/jpeg']);
const MAX_FILE = 2 * 1024 * 1024;

function vaultKey(): Buffer {
  const raw = process.env.DOCUMENT_VAULT_KEY_B64 || '';
  let key: Buffer;
  try { key = Buffer.from(raw, 'base64'); } catch { key = Buffer.alloc(0); }
  if (key.length !== 32) throw new ServiceUnavailableException('Document vault requires a 256-bit key');
  return key;
}
function checkSignature(bytes: Buffer, contentType: string): void {
  const pdf = bytes.subarray(0, 5).equals(Buffer.from('%PDF-'));
  const png = bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  const jpg = bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (!((contentType === 'application/pdf' && pdf) ||
    (contentType === 'image/png' && png) ||
    (contentType === 'image/jpeg' && jpg))) {
    throw new BadRequestException('File content does not match the allowed MIME type');
  }
}
function cleanFilename(value: unknown): string {
  if (typeof value !== 'string' || value.length < 1 || value.length > 150) {
    throw new BadRequestException('File name required');
  }
  const safe = value.replace(/[^A-Za-z0-9._ -]/g, '_').replace(/^\.+/, '').slice(0, 120);
  if (!safe || safe === '.' || safe === '..') throw new BadRequestException('Invalid filename');
  return safe;
}

@Injectable()
export class PrivateDocumentService {
  constructor(private readonly prisma: PrismaService) {}
  private readonly store = new PrivateVaultStore();
  private async authorize(user: AuthenticatedUser, scope: Scope, resourceId: string) {
    if (scope === 'GLOBAL_JOB') {
      const job = await this.prisma.globalJob.findUnique({
        where: { id: resourceId },
        select: { employerId: true, selectedUserId: true, status: true },
      });
      if (!job || (user.id !== job.employerId &&
          !(job.selectedUserId === user.id && ['IN_PROGRESS','COMPLETED'].includes(job.status)))) {
        throw new NotFoundException('Job documents not found');
      }
      return;
    }
    if (scope === 'FREELANCE_ORDER') {
      const order = await this.prisma.freelanceOrder.findUnique({
        where: { id: resourceId }, include: { seller: { select: { userId: true } } },
      });
      if (!order || (user.role !== 'ADMIN' && user.id !== order.buyerId && user.id !== order.seller.userId)) {
        throw new NotFoundException('Order not found');
      }
      return;
    }
    if (scope === 'MANAGED_ENGAGEMENT') {
      const engagement = await this.prisma.managedEngagement.findUnique({
        where: { id: resourceId }, include: { organization: { select: { ownerId: true } } },
      });
      if (!engagement || (user.role !== 'ADMIN' && engagement.organization.ownerId !== user.id)) {
        throw new NotFoundException('Engagement not found');
      }
      return;
    }
    throw new BadRequestException('Unsupported document scope');
  }
  private validateScope(scope: unknown, resourceId: unknown): { scope: Scope, resourceId: string } {
    if (scope !== 'FREELANCE_ORDER' && scope !== 'MANAGED_ENGAGEMENT' && scope !== 'GLOBAL_JOB') {
      throw new BadRequestException('Unknown document scope');
    }
    if (typeof resourceId !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(resourceId)) {
      throw new BadRequestException('Invalid resource ID');
    }
    return { scope, resourceId };
  }
  async list(user: AuthenticatedUser, scope: unknown, resourceId: unknown) {
    const selected = this.validateScope(scope, resourceId);
    await this.authorize(user, selected.scope, selected.resourceId);
    return this.prisma.marketplaceAttachment.findMany({
      where: { scope: selected.scope, resourceId: selected.resourceId, deletedAt: null },
      select: { id: true, filename: true, contentType: true, sizeBytes: true, createdAt: true, uploadedById: true },
      orderBy: { createdAt: 'desc' }, take: 100,
    });
  }
  async upload(user: AuthenticatedUser, body: Record<string, unknown>) {
    const { scope, resourceId } = this.validateScope(body.scope, body.resourceId);
    await this.authorize(user, scope, resourceId);
    const filename = cleanFilename(body.filename);
    const contentType = body.contentType;
    if (typeof contentType !== 'string' || !MIME.has(contentType)) {
      throw new BadRequestException('Only PDF, PNG and JPEG files are permitted');
    }
    if (typeof body.contentBase64 !== 'string' || body.contentBase64.length > Math.ceil(MAX_FILE / 3) * 4 + 8 ||
        !/^[A-Za-z0-9+/]+={0,2}$/.test(body.contentBase64)) {
      throw new BadRequestException('Invalid or oversized base64 upload');
    }
    const plaintext = Buffer.from(body.contentBase64, 'base64');
    if (!plaintext.length || plaintext.length > MAX_FILE) {
      throw new BadRequestException('File size must be 1 byte to 2 MiB');
    }
    checkSignature(plaintext, contentType);
    const key = vaultKey();
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const objectKey = randomUUID() + '.vault';
    const record = Buffer.concat([iv, cipher.getAuthTag(), encrypted]);
    const sha256 = createHash('sha256').update(plaintext).digest('hex');
    await this.store.write(objectKey, record);
    try {
      const created = await this.prisma.marketplaceAttachment.create({
        data: { scope, resourceId, uploadedById: user.id, filename, contentType,
          objectKey, sizeBytes: plaintext.length, sha256 },
        select: { id: true, filename: true, contentType: true, sizeBytes: true, createdAt: true },
      });
      await this.prisma.auditLog.create({
        data: { actorId: user.id, action: 'PRIVATE_FILE_UPLOADED', entityType: 'MarketplaceAttachment', entityId: created.id },
      });
      return created;
    } catch (error) {
      await this.store.remove(objectKey).catch(() => {});
      throw error;
    }
  }
  async download(user: AuthenticatedUser, id: string) {
    if (!/^[a-zA-Z0-9_-]{1,80}$/.test(id)) throw new BadRequestException('Invalid document ID');
    const file = await this.prisma.marketplaceAttachment.findUnique({ where: { id } });
    if (!file || file.deletedAt) throw new NotFoundException('Document not found');
    const selected = this.validateScope(file.scope, file.resourceId);
    await this.authorize(user, selected.scope, selected.resourceId);
    const key = vaultKey();
    const record = await this.store.read(file.objectKey);
    if (record.length < 29 || record.length > MAX_FILE + 28) throw new ServiceUnavailableException('Invalid vault record');
    const iv = record.subarray(0,12), tag = record.subarray(12,28);
    let plain: Buffer;
    try {
      const decipher = createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAuthTag(tag);
      plain = Buffer.concat([decipher.update(record.subarray(28)), decipher.final()]);
    } catch {
      throw new ServiceUnavailableException('Encrypted document could not be verified');
    }
    const actualHash = createHash('sha256').update(plain).digest();
    const expectedHash = Buffer.from(file.sha256, 'hex');
    if (expectedHash.length !== actualHash.length || !timingSafeEqual(expectedHash, actualHash) ||
        plain.length !== file.sizeBytes) throw new ServiceUnavailableException('Document integrity check failed');
    await this.prisma.auditLog.create({
      data: { actorId: user.id, action: 'PRIVATE_FILE_DOWNLOADED', entityType: 'MarketplaceAttachment', entityId: file.id },
    });
    return { content: plain, filename: file.filename, contentType: file.contentType };
  }
}
