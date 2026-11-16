import {
  BadRequestException, ConflictException, ForbiddenException,
  Injectable, NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { AuthenticatedUser } from '../common/decorators/current-user.decorator';

const TIERS = ['BASIC', 'STANDARD', 'PREMIUM'];
const CURRENCIES = ['USD', 'EUR', 'GBP', 'KES'];
export const PLATFORM_COMMISSION_BPS = 1200; // Proposed 12% fee; not a live settlement rule.

function required(value: unknown, field: string, limit: number): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > limit) {
    throw new BadRequestException(`${field} must be 1-${limit} characters`);
  }
  return value.trim();
}
function integer(value: unknown, field: string, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max) {
    throw new BadRequestException(`${field} must be an integer between ${min} and ${max}`);
  }
  return value;
}
function strOrBlank(value: unknown, field: string, limit: number): string {
  if (value === undefined || value === null || value === '') return '';
  return required(value, field, limit);
}
function admin(user: AuthenticatedUser): void {
  if (user.role !== 'ADMIN') throw new ForbiddenException('Administrator access required');
}

@Injectable()
export class FreelanceService {
  constructor(private readonly prisma: PrismaService) {}
  private async sellerForUser(user: AuthenticatedUser) {
    const seller = await this.prisma.freelanceSeller.findUnique({ where: { userId: user.id } });
    if (!seller) throw new NotFoundException('Apply to become a seller first');
    return seller;
  }
  private async sellerGig(user: AuthenticatedUser, gigId: string) {
    const gig = await this.prisma.freelanceGig.findUnique({
      where: { id: gigId }, include: { seller: true, packages: true },
    });
    if (!gig || gig.seller.userId !== user.id) throw new NotFoundException('Gig not found');
    return gig;
  }
  private async orderForParticipant(user: AuthenticatedUser, orderId: string) {
    const order = await this.prisma.freelanceOrder.findUnique({
      where: { id: orderId },
      include: { seller: { select: { id: true, userId: true, displayName: true, status: true } },
        gig: { select: { id: true, title: true } },
        package: { select: { id: true, tier: true, description: true } }, review: true, dispute: true },
    });
    if (!order) throw new NotFoundException('Order not found');
    if (user.role !== 'ADMIN' && order.buyerId !== user.id && order.seller.userId !== user.id) {
      throw new NotFoundException('Order not found');
    }
    return order;
  }
  private async audit(user: AuthenticatedUser, action: string, entityType: string, entityId: string) {
    await this.prisma.auditLog.create({ data: { actorId: user.id, action, entityType, entityId } });
  }

  async publicGigs(search?: string, category?: string) {
    const q = strOrBlank(search, 'Search', 80);
    const cat = strOrBlank(category, 'Category', 70);
    return this.prisma.freelanceGig.findMany({
      where: { status: 'PUBLISHED', seller: { status: 'VERIFIED' },
        ...(cat ? { category: cat } : {}),
        ...(q ? { OR: [{ title: { contains: q } }, { description: { contains: q } },
          { tags: { contains: q } }] } : {}) },
      include: {
        seller: { select: { id: true, displayName: true, headline: true, country: true } },
        packages: { orderBy: { priceCents: 'asc' } },
      },
      orderBy: { publishedAt: 'desc' }, take: 50,
    });
  }
  async publicGig(gigId: string) {
    const gig = await this.prisma.freelanceGig.findFirst({
      where: { id: gigId, status: 'PUBLISHED', seller: { status: 'VERIFIED' } },
      include: { seller: { select: { id: true, displayName: true, headline: true, biography: true,
        country: true, skills: true } }, packages: { orderBy: { priceCents: 'asc' } } },
    });
    if (!gig) throw new NotFoundException('Service not found');
    return gig;
  }
  async applySeller(user: AuthenticatedUser, body: Record<string, unknown>) {
    const existing = await this.prisma.freelanceSeller.findUnique({ where: { userId: user.id } });
    if (existing) throw new ConflictException('Seller application already exists');
    const displayName = required(body.displayName, 'Display name', 90);
    const headline = required(body.headline, 'Headline', 150);
    const biography = required(body.biography, 'Biography', 2000);
    const country = required(body.country, 'Country', 80);
    const skills = required(body.skills, 'Skills', 600);
    const seller = await this.prisma.freelanceSeller.create({
      data: { userId: user.id, displayName, headline, biography, country, skills },
    });
    await this.audit(user, 'SELLER_APPLIED', 'FreelanceSeller', seller.id);
    return seller;
  }
  async myWorkspace(user: AuthenticatedUser) {
    const seller = await this.prisma.freelanceSeller.findUnique({
      where: { userId: user.id }, include: { gigs: { include: { packages: true },
        orderBy: { createdAt: 'desc' } } },
    });
    const orders = await this.prisma.freelanceOrder.findMany({
      where: user.role === 'ADMIN' ? {} : {
        OR: [{ buyerId: user.id }, ...(seller ? [{ sellerId: seller.id }] : [])],
      },
      include: {
        gig: { select: { title: true, id: true } },
        seller: { select: { id: true, userId: true, displayName: true } },
        package: { select: { tier: true, description: true } },
        review: true, dispute: true,
      },
      orderBy: { createdAt: 'desc' }, take: 100,
    });
    return { seller, orders, commissionBps: PLATFORM_COMMISSION_BPS,
      paymentsEnabled: false, payoutsEnabled: false };
  }
  async createGig(user: AuthenticatedUser, body: Record<string, unknown>) {
    const seller = await this.sellerForUser(user);
    if (seller.status !== 'VERIFIED') throw new ForbiddenException('Seller verification required');
    const title = required(body.title, 'Gig title', 160);
    const description = required(body.description, 'Description', 4500);
    const category = required(body.category, 'Category', 70);
    const tags = required(body.tags, 'Tags', 400);
    if (!Array.isArray(body.packages) || body.packages.length < 1 || body.packages.length > 3) {
      throw new BadRequestException('Provide one to three service packages');
    }
    const parsed = body.packages.map((raw: unknown) => {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        throw new BadRequestException('Invalid service package');
      }
      const p = raw as Record<string, unknown>;
      const tier = required(p.tier, 'Tier', 8).toUpperCase();
      if (!TIERS.includes(tier)) throw new BadRequestException('Invalid package tier');
      const currency = required(p.currency, 'Currency', 3).toUpperCase();
      if (!CURRENCIES.includes(currency)) throw new BadRequestException('Unsupported currency');
      return { tier, description: required(p.description, 'Package description', 1200),
        priceCents: integer(p.priceCents, 'Price in cents', 100, 1000000000),
        deliveryDays: integer(p.deliveryDays, 'Delivery days', 1, 365),
        revisions: integer(p.revisions, 'Included revisions', 0, 20), currency };
    });
    if (new Set(parsed.map(p => p.tier)).size !== parsed.length) {
      throw new BadRequestException('Package tiers must be unique');
    }
    if (new Set(parsed.map(p => p.currency)).size !== 1) {
      throw new BadRequestException('Packages must use one currency');
    }
    const gig = await this.prisma.freelanceGig.create({
      data: { sellerId: seller.id, title, description, category, tags,
        packages: { create: parsed } },
      include: { packages: true },
    });
    await this.audit(user, 'GIG_CREATED', 'FreelanceGig', gig.id);
    return gig;
  }
  async publishGig(user: AuthenticatedUser, gigId: string) {
    const gig = await this.sellerGig(user, gigId);
    if (gig.seller.status !== 'VERIFIED') throw new ForbiddenException('Seller not verified');
    if (gig.status !== 'DRAFT' || !gig.packages.length) throw new ConflictException('Gig is not ready to publish');
    const changed = await this.prisma.freelanceGig.updateMany({
      where: { id: gig.id, status: 'DRAFT' }, data: { status: 'PUBLISHED', publishedAt: new Date() },
    });
    if (changed.count !== 1) throw new ConflictException('Gig state changed');
    await this.audit(user, 'GIG_PUBLISHED', 'FreelanceGig', gig.id);
    return this.publicGig(gig.id);
  }
  async archiveGig(user: AuthenticatedUser, gigId: string) {
    const gig = await this.sellerGig(user, gigId);
    if (gig.status !== 'PUBLISHED') throw new ConflictException('Gig must be published');
    await this.prisma.freelanceGig.updateMany({ where: { id: gig.id, status: 'PUBLISHED' },
      data: { status: 'ARCHIVED' } });
    await this.audit(user, 'GIG_ARCHIVED', 'FreelanceGig', gig.id);
    return { status: 'ARCHIVED' };
  }
  async createOrder(user: AuthenticatedUser, body: Record<string, unknown>) {
    const gigId = required(body.gigId, 'Gig', 80);
    const packageId = required(body.packageId, 'Package', 80);
    const buyerBrief = required(body.buyerBrief, 'Requirements', 4000);
    const gig = await this.prisma.freelanceGig.findFirst({
      where: { id: gigId, status: 'PUBLISHED', seller: { status: 'VERIFIED' } },
      include: { seller: true, packages: true },
    });
    if (!gig) throw new NotFoundException('Service is not available');
    if (gig.seller.userId === user.id) throw new ForbiddenException('Cannot order your own service');
    const selected = gig.packages.find(p => p.id === packageId);
    if (!selected) throw new BadRequestException('Package does not belong to this service');
    const commissionCents = Math.round(selected.priceCents * PLATFORM_COMMISSION_BPS / 10000);
    const order = await this.prisma.freelanceOrder.create({
      data: {
        buyerId: user.id, sellerId: gig.seller.id, gigId: gig.id, packageId: selected.id,
        buyerBrief, priceCents: selected.priceCents, commissionCents,
        sellerNetCents: selected.priceCents - commissionCents,
        currency: selected.currency, revisionLimit: selected.revisions,
      },
    });
    await this.audit(user, 'ORDER_REQUESTED', 'FreelanceOrder', order.id);
    return order;
  }
  async orders(user: AuthenticatedUser) { return (await this.myWorkspace(user)).orders; }
  async getOrder(user: AuthenticatedUser, orderId: string) { return this.orderForParticipant(user, orderId); }

  async respondToOrder(user: AuthenticatedUser, orderId: string, accept: unknown) {
    const order = await this.orderForParticipant(user, orderId);
    if (order.seller.userId !== user.id) throw new ForbiddenException('Seller only');
    if (order.seller.status !== 'VERIFIED') throw new ForbiddenException('Seller account not verified');
    if (typeof accept !== 'boolean') throw new BadRequestException('accept must be boolean');
    if (order.status !== 'REQUESTED') throw new ConflictException('Order is not awaiting seller response');
    const status = accept ? 'IN_PROGRESS' : 'DECLINED';
    const changed = await this.prisma.freelanceOrder.updateMany({
      where: { id: orderId, status: 'REQUESTED' }, data: { status },
    });
    if (!changed.count) throw new ConflictException('Order state changed');
    await this.audit(user, accept ? 'ORDER_ACCEPTED' : 'ORDER_DECLINED', 'FreelanceOrder', orderId);
    return this.orderForParticipant(user, orderId);
  }
  async cancelRequest(user: AuthenticatedUser, orderId: string) {
    const order = await this.orderForParticipant(user, orderId);
    if (order.buyerId !== user.id || order.status !== 'REQUESTED') {
      throw new ConflictException('Only the buyer may cancel an unaccepted request');
    }
    const changed = await this.prisma.freelanceOrder.updateMany({
      where: { id: orderId, status: 'REQUESTED' }, data: { status: 'CANCELLED' },
    });
    if (!changed.count) throw new ConflictException('Order state changed');
    await this.audit(user, 'ORDER_CANCELLED', 'FreelanceOrder', orderId);
    return this.orderForParticipant(user, orderId);
  }
  async submitDelivery(user: AuthenticatedUser, orderId: string, body: Record<string, unknown>) {
    const order = await this.orderForParticipant(user, orderId);
    if (order.seller.userId !== user.id) throw new ForbiddenException('Seller only');
    if (!['IN_PROGRESS', 'REVISION_REQUESTED'].includes(order.status)) {
      throw new ConflictException('Order is not ready for delivery');
    }
    const deliveryNote = required(body.deliveryNote, 'Delivery details', 5000);
    const changed = await this.prisma.freelanceOrder.updateMany({
      where: { id: orderId, status: order.status },
      data: { status: 'SUBMITTED', deliveryNote, submittedAt: new Date(), revisionFeedback: null },
    });
    if (!changed.count) throw new ConflictException('Order state changed');
    await this.audit(user, 'ORDER_DELIVERED', 'FreelanceOrder', orderId);
    return this.orderForParticipant(user, orderId);
  }
  async reviewDelivery(user: AuthenticatedUser, orderId: string, body: Record<string, unknown>) {
    const order = await this.orderForParticipant(user, orderId);
    if (order.buyerId !== user.id) throw new ForbiddenException('Buyer only');
    if (order.status !== 'SUBMITTED') throw new ConflictException('Delivery is not submitted');
    if (typeof body.approved !== 'boolean') throw new BadRequestException('approved must be boolean');
    const approved = body.approved;
    if (!approved && order.revisionsUsed >= order.revisionLimit) {
      throw new ConflictException('Included revisions exhausted; open a dispute or arrange a new scope');
    }
    const revisionFeedback = approved ? null : required(body.feedback, 'Revision feedback', 2500);
    const changed = await this.prisma.freelanceOrder.updateMany({
      where: { id: orderId, status: 'SUBMITTED', revisionsUsed: order.revisionsUsed },
      data: { status: approved ? 'COMPLETED' : 'REVISION_REQUESTED',
        revisionFeedback, ...(approved ? { completedAt: new Date() } : { revisionsUsed: { increment: 1 } }) },
    });
    if (!changed.count) throw new ConflictException('Order state changed');
    await this.audit(user, approved ? 'ORDER_APPROVED' : 'ORDER_REVISION_REQUESTED', 'FreelanceOrder', orderId);
    return this.orderForParticipant(user, orderId);
  }
  async postMessage(user: AuthenticatedUser, orderId: string, body: Record<string, unknown>) {
    const order = await this.orderForParticipant(user, orderId);
    if (['CANCELLED', 'DECLINED'].includes(order.status)) throw new ConflictException('Order is closed');
    const message = required(body.message, 'Message', 3000);
    const created = await this.prisma.freelanceMessage.create({
      data: { orderId, authorId: user.id, body: message },
    });
    await this.audit(user, 'ORDER_MESSAGE', 'FreelanceOrder', orderId);
    return created;
  }
  async messages(user: AuthenticatedUser, orderId: string) {
    await this.orderForParticipant(user, orderId);
    return this.prisma.freelanceMessage.findMany({
      where: { orderId }, orderBy: { createdAt: 'asc' }, take: 200,
    });
  }
  async leaveReview(user: AuthenticatedUser, orderId: string, body: Record<string, unknown>) {
    const order = await this.orderForParticipant(user, orderId);
    if (order.buyerId !== user.id) throw new ForbiddenException('Buyer only');
    if (order.status !== 'COMPLETED') throw new ConflictException('Only completed orders can be reviewed');
    const rating = integer(body.rating, 'Rating', 1, 5);
    const comment = required(body.comment, 'Review', 1000);
    const existing = await this.prisma.freelanceReview.findUnique({ where: { orderId } });
    if (existing) throw new ConflictException('Order already reviewed');
    const review = await this.prisma.freelanceReview.create({
      data: { orderId, sellerId: order.sellerId, buyerId: user.id, rating, comment },
    });
    await this.audit(user, 'ORDER_REVIEWED', 'FreelanceReview', review.id);
    return review;
  }
  async openDispute(user: AuthenticatedUser, orderId: string, body: Record<string, unknown>) {
    const order = await this.orderForParticipant(user, orderId);
    if (order.buyerId !== user.id && order.seller.userId !== user.id) {
      throw new ForbiddenException('Order participant required');
    }
    if (!['IN_PROGRESS', 'SUBMITTED', 'REVISION_REQUESTED'].includes(order.status)) {
      throw new ConflictException('Order is not disputable in its current state');
    }
    if (order.dispute) throw new ConflictException('A dispute already exists');
    const reason = required(body.reason, 'Dispute reason', 2000);
    const dispute = await this.prisma.$transaction(async tx => {
      const changed = await tx.freelanceOrder.updateMany({
        where: { id: orderId, status: order.status }, data: { status: 'DISPUTED' },
      });
      if (!changed.count) throw new ConflictException('Order state changed');
      return tx.freelanceDispute.create({ data: { orderId, openedById: user.id, reason } });
    });
    await this.audit(user, 'DISPUTE_OPENED', 'FreelanceDispute', dispute.id);
    return dispute;
  }
  async adminSellers(user: AuthenticatedUser) {
    admin(user);
    return this.prisma.freelanceSeller.findMany({ orderBy: { createdAt: 'desc' }, take: 150 });
  }
  async verifySeller(user: AuthenticatedUser, sellerId: string, body: Record<string, unknown>) {
    admin(user);
    const approved = body.approved;
    if (typeof approved !== 'boolean') throw new BadRequestException('approved must be boolean');
    const changed = await this.prisma.freelanceSeller.updateMany({
      where: { id: sellerId, status: 'PENDING' },
      data: { status: approved ? 'VERIFIED' : 'REJECTED', verifiedAt: approved ? new Date() : null },
    });
    if (!changed.count) throw new ConflictException('Seller is missing or already reviewed');
    await this.audit(user, 'SELLER_REVIEWED', 'FreelanceSeller', sellerId);
    return this.prisma.freelanceSeller.findUnique({ where: { id: sellerId } });
  }
  async adminDisputes(user: AuthenticatedUser) {
    admin(user);
    return this.prisma.freelanceDispute.findMany({
      include: { order: { select: { id: true, buyerId: true, sellerId: true, status: true, priceCents: true, currency: true } } },
      orderBy: { createdAt: 'desc' }, take: 100,
    });
  }
  async resolveDispute(user: AuthenticatedUser, disputeId: string, body: Record<string, unknown>) {
    admin(user);
    const decision = required(body.decision, 'Decision', 20).toUpperCase();
    if (!['RESUME', 'CANCEL'].includes(decision)) throw new BadRequestException('Decision must be RESUME or CANCEL');
    const dispute = await this.prisma.freelanceDispute.findUnique({ where: { id: disputeId }, include: { order: true } });
    if (!dispute || dispute.status !== 'OPEN' || dispute.order.status !== 'DISPUTED') {
      throw new ConflictException('Dispute is not open');
    }
    const result = await this.prisma.$transaction(async tx => {
      const changed = await tx.freelanceDispute.updateMany({
        where: { id: disputeId, status: 'OPEN' },
        data: { status: 'RESOLVED', decision, resolvedBy: user.id, resolvedAt: new Date() },
      });
      if (!changed.count) throw new ConflictException('Dispute already resolved');
      await tx.freelanceOrder.update({
        where: { id: dispute.orderId }, data: { status: decision === 'RESUME' ? 'IN_PROGRESS' : 'CANCELLED' },
      });
      return tx.freelanceDispute.findUnique({ where: { id: disputeId } });
    });
    await this.audit(user, 'DISPUTE_RESOLVED', 'FreelanceDispute', disputeId);
    return result;
  }
}
