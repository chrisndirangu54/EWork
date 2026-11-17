import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { AuthenticatedUser } from '../common/decorators/current-user.decorator';

type Kind = 'FREELANCE_ORDER' | 'MANAGED_ENGAGEMENT';
type Verified = { id: number; tx_ref: string; amount: number; currency: string; status: string };
const API = 'https://api.flutterwave.com/v3';
const CUSTOMER_CURRENCIES = new Set(['USD', 'EUR', 'GBP', 'KES']);

export function verifyFlutterwaveSignature(raw: Buffer, provided: string | undefined, secret: string): boolean {
  if (!secret || secret.length < 20 || !raw || raw.length > 262144 ||
      typeof provided !== 'string' || provided.length > 200) return false;
  const expected = createHmac('sha256', secret).update(raw).digest();
  let received: Buffer;
  try { received = Buffer.from(provided, 'base64'); } catch { return false; }
  return expected.length === received.length && timingSafeEqual(expected, received);
}
/** Flutterwave v3 webhooks authenticate with verif-hash; newer v4 supports body HMAC. */
export function verifyFlutterwaveV3Secret(provided: string | undefined, secret: string): boolean {
  if (!secret || secret.length < 20 || typeof provided !== 'string' || provided.length > 256) return false;
  const a = Buffer.from(secret, 'utf8'), b = Buffer.from(provided, 'utf8');
  return a.length === b.length && timingSafeEqual(a,b);
}
export function verifyTransactionMatch(data: Verified, attempt: {
  reference: string; currency: string; amountCents: number;
}) {
  if (data.status !== 'successful' || data.tx_ref !== attempt.reference ||
      data.currency !== attempt.currency ||
      typeof data.amount !== 'number' || !Number.isFinite(data.amount) ||
      Math.round(data.amount * 100) !== attempt.amountCents) {
    throw new ConflictException('Provider transaction does not match reference, currency, amount or status');
  }
}
function configured() {
  // This implementation intentionally supports sandbox ONLY. There is no LIVE activation flag.
  const secretKey = process.env.FLW_SECRET_KEY || '';
  const webhookSecret = process.env.FLW_WEBHOOK_SECRET || '';
  const returnUrl = process.env.FLW_RETURN_URL || '';
  if (process.env.PAYMENTS_MODE !== 'SANDBOX' ||
      !secretKey.startsWith('FLWSECK_TEST-') ||
      webhookSecret.length < 20) throw new ServiceUnavailableException('Test checkout is not configured');
  let redirect: URL;
  try { redirect = new URL(returnUrl); } catch { throw new ServiceUnavailableException('Checkout return URL missing'); }
  if (redirect.protocol !== 'https:' && !(redirect.protocol === 'http:' && ['localhost','127.0.0.1'].includes(redirect.hostname))) {
    throw new ServiceUnavailableException('Checkout return URL must be HTTPS');
  }
  return { secretKey, webhookSecret, redirect: redirect.toString() };
}
async function remoteJson(url: string, opts: RequestInit) {
  const r = await fetch(url, { ...opts, signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new ServiceUnavailableException('Payment provider unavailable');
  const parsed = await r.json() as { status?: string; data?: any };
  if (parsed.status !== 'success' || !parsed.data) throw new ServiceUnavailableException('Payment provider response invalid');
  return parsed.data;
}
function safeCheckoutLink(url: string): string {
  let parsed: URL;
  try { parsed = new URL(url); } catch { throw new ServiceUnavailableException('Untrusted checkout URL'); }
  if (parsed.protocol !== 'https:' || parsed.hostname !== 'checkout.flutterwave.com') {
    throw new ServiceUnavailableException('Provider returned an unexpected checkout URL');
  }
  return parsed.toString();
}
function positiveIntegerId(value: unknown): string {
  const id = String(value ?? '');
  if (!/^[1-9][0-9]{0,14}$/.test(id)) throw new BadRequestException('Invalid provider transaction ID');
  return id;
}

@Injectable()
export class CommercePaymentService {
  constructor(private readonly prisma: PrismaService) {}
  status() {
    return {
      livePaymentsEnabled: false,
      sandboxConfigured: process.env.PAYMENTS_MODE === 'SANDBOX' &&
        (process.env.FLW_SECRET_KEY || '').startsWith('FLWSECK_TEST-'),
      actualPayoutsEnabled: false, escrowEnabled: false, provider: 'FLUTTERWAVE',
    };
  }
  private async resource(user: AuthenticatedUser, kind: Kind, resourceId: string) {
    if (kind === 'FREELANCE_ORDER') {
      const order = await this.prisma.freelanceOrder.findUnique({ where: { id: resourceId } });
      if (!order || order.buyerId !== user.id) throw new NotFoundException('Purchase request not found');
      if (order.status !== 'IN_PROGRESS') throw new ConflictException('Seller must accept service request first');
      if (order.paymentStatus === 'PAID_TEST') throw new ConflictException('Payment has already been verified in sandbox');
      return { amountCents: order.priceCents, currency: order.currency };
    }
    if (kind === 'MANAGED_ENGAGEMENT') {
      const engagement = await this.prisma.managedEngagement.findUnique({
        where: { id: resourceId }, include: { organization: true },
      });
      if (!engagement || engagement.organization.ownerId !== user.id) {
        throw new NotFoundException('Engagement not found');
      }
      if (!['ACCEPTED', 'ACTIVE'].includes(engagement.status) || !engagement.quotedCents) {
        throw new ConflictException('A client-approved quote is required');
      }
      return { amountCents: engagement.quotedCents, currency: engagement.currency };
    }
    throw new BadRequestException('Unknown service model');
  }
  async initiate(user: AuthenticatedUser, body: Record<string, unknown>) {
    const cfg = configured();
    const kind = body.kind;
    if (kind !== 'FREELANCE_ORDER' && kind !== 'MANAGED_ENGAGEMENT') {
      throw new BadRequestException('Invalid checkout kind');
    }
    if (typeof body.resourceId !== 'string' || !/^[a-f0-9-]{32,40}$/i.test(body.resourceId)) {
      throw new BadRequestException('Invalid resource ID');
    }
    const resource = await this.resource(user, kind, body.resourceId);
    if (!Number.isSafeInteger(resource.amountCents) || resource.amountCents < 100 ||
      resource.amountCents > 1000000000 || !CUSTOMER_CURRENCIES.has(resource.currency)) {
      throw new BadRequestException('Unsupported amount or currency');
    }
    const active = await this.prisma.marketplaceCheckoutAttempt.findFirst({
      where: { kind, resourceId: body.resourceId, status: { in: ['CREATED', 'PENDING', 'PAID_TEST'] } },
      orderBy: { createdAt: 'desc' },
    });
    if (active) {
      if (active.buyerId !== user.id) throw new ForbiddenException();
      if (active.checkoutUrl && active.status === 'PENDING') {
        return { id: active.id, url: active.checkoutUrl, reference: active.reference, status: active.status };
      }
      throw new ConflictException('Checkout is already being initiated or processed');
    }
    const attempt = await this.prisma.marketplaceCheckoutAttempt.create({
      data: { reference: 'TGS_' + randomUUID(), provider: 'FLUTTERWAVE', kind,
        resourceId: body.resourceId, buyerId: user.id,
        amountCents: resource.amountCents, currency: resource.currency },
    });
    try {
      const data = await remoteJson(API + '/payments', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + cfg.secretKey, 'Content-Type': 'application/json',
          'Accept': 'application/json' },
        body: JSON.stringify({
          tx_ref: attempt.reference,
          amount: Number((attempt.amountCents / 100).toFixed(2)),
          currency: attempt.currency,
          redirect_url: (() => { const redirect = new URL(cfg.redirect); redirect.searchParams.set('attempt', attempt.id); return redirect.toString(); })(),
          customer: { email: user.email, name: user.name },
          customizations: { title: 'TeknTandao Global Services — SANDBOX ONLY' },
          meta: { resource_type: kind, resource_id: body.resourceId, checkout_mode: 'SANDBOX' },
        }),
      });
      const link = safeCheckoutLink(data.link);
      const changed = await this.prisma.marketplaceCheckoutAttempt.updateMany({
        where: { id: attempt.id, status: 'CREATED' }, data: { status: 'PENDING', checkoutUrl: link },
      });
      if (changed.count !== 1) throw new ConflictException('Checkout state changed');
      return { id: attempt.id, url: link, reference: attempt.reference, status: 'PENDING' };
    } catch (error) {
      await this.prisma.marketplaceCheckoutAttempt.updateMany({
        where: { id: attempt.id, status: 'CREATED' }, data: { status: 'FAILED' },
      });
      throw error;
    }
  }
  async getAttempt(user: AuthenticatedUser, id: string) {
    const attempt = await this.prisma.marketplaceCheckoutAttempt.findUnique({ where: { id } });
    if (!attempt || (attempt.buyerId !== user.id && user.role !== 'ADMIN')) {
      throw new NotFoundException('Checkout not found');
    }
    return { id: attempt.id, kind: attempt.kind, resourceId: attempt.resourceId,
      status: attempt.status, amountCents: attempt.amountCents, currency: attempt.currency,
      reference: attempt.reference, checkoutUrl: attempt.checkoutUrl, verifiedAt: attempt.verifiedAt };
  }
  private async confirm(providerId: string, reference?: string) {
    const cfg = configured();
    const id = positiveIntegerId(providerId);
    const result = await remoteJson(API + '/transactions/' + id + '/verify', {
      method: 'GET', headers: { Authorization: 'Bearer ' + cfg.secretKey, Accept: 'application/json' },
    }) as Verified;
    const attempt = await this.prisma.marketplaceCheckoutAttempt.findUnique({ where: { reference: result.tx_ref } });
    if (!attempt || (reference && attempt.reference !== reference)) {
      throw new NotFoundException('Matching checkout not found');
    }
    verifyTransactionMatch(result, attempt);
    if (attempt.status === 'PAID_TEST') {
      if (attempt.providerTransactionId !== id) throw new ConflictException('Provider transaction mismatch');
      return attempt;
    }
    if (!['PENDING', 'CREATED'].includes(attempt.status)) {
      throw new ConflictException('Checkout is not pending');
    }
    // Test settlement marking is atomic and one-time. NEVER treat as production settlement.
    return this.prisma.$transaction(async tx => {
      const unique = await tx.marketplacePaymentReceipt.findUnique({ where: { eventId: 'FLW_' + id } });
      if (unique) throw new ConflictException('Provider transaction already processed');
      const updated = await tx.marketplaceCheckoutAttempt.updateMany({
        where: { id: attempt.id, status: { in: ['PENDING', 'CREATED'] } },
        data: { status: 'PAID_TEST', verifiedAt: new Date(), providerTransactionId: id },
      });
      if (!updated.count) throw new ConflictException('Checkout was already processed');
      await tx.marketplacePaymentReceipt.create({
        data: { provider: 'FLUTTERWAVE', eventId: 'FLW_' + id,
          attemptId: attempt.id, transactionId: id },
      });
      if (attempt.kind === 'FREELANCE_ORDER') {
        await tx.freelanceOrder.updateMany({
          where: { id: attempt.resourceId, buyerId: attempt.buyerId },
          data: { paymentStatus: 'PAID_TEST' },
        });
      }
      return tx.marketplaceCheckoutAttempt.findUnique({ where: { id: attempt.id } });
    });
  }
  async reconcile(user: AuthenticatedUser, id: string, body: Record<string, unknown>) {
    const attempt = await this.prisma.marketplaceCheckoutAttempt.findUnique({ where: { id } });
    if (!attempt || attempt.buyerId !== user.id) throw new NotFoundException('Checkout not found');
    if (attempt.status === 'PAID_TEST') return this.getAttempt(user, id);
    await this.confirm(positiveIntegerId(body.transactionId), attempt.reference);
    return this.getAttempt(user, id);
  }
  async handleWebhook(rawBody: Buffer, signature: string | undefined, v3Hash?: string) {
    const cfg = configured();
    const valid = process.env.FLW_WEBHOOK_MODE === 'V4_HMAC'
      ? verifyFlutterwaveSignature(rawBody, signature, cfg.webhookSecret)
      : verifyFlutterwaveV3Secret(v3Hash, cfg.webhookSecret);
    if (!valid || rawBody.length > 262144) {
      throw new UnauthorizedException('Invalid payment event signature');
    }
    let data: any;
    try { data = JSON.parse(rawBody.toString('utf8')); } catch {
      throw new BadRequestException('Malformed webhook');
    }
    const event = String(data.type || data.event || '');
    if (event !== 'charge.completed') return { received: true, action: 'ignored' };
    const reference = String(data.data?.tx_ref || '');
    const providerId = positiveIntegerId(data.data?.id);
    // Signed callback is necessary but not sufficient: verify directly with the provider.
    await this.confirm(providerId, reference);
    return { received: true };
  }
  async draftPayout(user: AuthenticatedUser, orderId: string) {
    if (user.role !== 'ADMIN') throw new ForbiddenException();
    const order = await this.prisma.freelanceOrder.findUnique({ where: { id: orderId } });
    if (!order || order.status !== 'COMPLETED') throw new ConflictException('Order must be completed');
    if (order.paymentStatus !== 'PAID_TEST') {
      throw new ConflictException('Only sandbox-verified transactions can create simulated payout estimates');
    }
    const record = await this.prisma.marketplacePayoutDraft.upsert({
      where: { freelanceOrderId: order.id },
      update: {}, create: { freelanceOrderId: order.id, sellerId: order.sellerId,
        grossCents: order.priceCents, feeCents: order.commissionCents,
        netCents: order.sellerNetCents, currency: order.currency },
    });
    return { ...record, canTransfer: false, label: 'SIMULATION ONLY — no funds transfer' };
  }
  async payoutDrafts(user: AuthenticatedUser) {
    if (user.role !== 'ADMIN') throw new ForbiddenException();
    return this.prisma.marketplacePayoutDraft.findMany({ take: 100, orderBy: { createdAt: 'desc' } });
  }
}
