import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { AuthenticatedUser } from '../common/decorators/current-user.decorator';

const OFFERINGS = [
  { slug: 'ai-automation', name: 'AI Workflow Automation', category: 'AI & Automation', model: 'Managed project' },
  { slug: 'software-engineering', name: 'Managed Software Engineering', category: 'Software', model: 'Project or dedicated team' },
  { slug: 'cloud-it-support', name: 'Cloud & IT Operations', category: 'Cloud', model: 'Monthly retainer' },
  { slug: 'data-analytics', name: 'Data Engineering & Analytics', category: 'Data', model: 'Managed project' },
  { slug: 'technical-support', name: 'Technical Customer Support', category: 'Support', model: 'Monthly retainer' },
] as const;
const CURRENCIES = new Set(['USD', 'EUR', 'GBP', 'KES']);

function field(value: unknown, label: string, max = 1000): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) {
    throw new BadRequestException(`${label} must contain 1-${max} characters`);
  }
  return value.trim();
}
function amount(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1 || value > 1000000000) {
    throw new BadRequestException('Amount must be positive integer minor currency units');
  }
  return value;
}
function moneyCurrency(value: unknown): string {
  const currency = field(value, 'Currency', 3).toUpperCase();
  if (!CURRENCIES.has(currency)) throw new BadRequestException('Unsupported currency');
  return currency;
}

@Injectable()
export class ManagedService {
  constructor(private readonly prisma: PrismaService) {}
  catalog() { return OFFERINGS; }

  private async org(id: string, user: AuthenticatedUser) {
    const org = await this.prisma.managedOrganization.findUnique({ where: { id } });
    if (!org) throw new NotFoundException('Organization not found');
    if (user.role !== 'ADMIN' && org.ownerId !== user.id) throw new NotFoundException('Organization not found');
    return org;
  }
  private async engagement(id: string, user: AuthenticatedUser) {
    const engagement = await this.prisma.managedEngagement.findUnique({
      where: { id }, include: { organization: true, milestones: true, invoices: true },
    });
    if (!engagement) throw new NotFoundException('Engagement not found');
    if (user.role !== 'ADMIN' && engagement.organization.ownerId !== user.id) {
      throw new NotFoundException('Engagement not found');
    }
    return engagement;
  }
  async organizations(user: AuthenticatedUser) {
    return this.prisma.managedOrganization.findMany({
      where: user.role === 'ADMIN' ? {} : { ownerId: user.id },
      orderBy: { createdAt: 'desc' },
    });
  }
  async createOrganization(user: AuthenticatedUser, body: Record<string, unknown>) {
    const name = field(body.name, 'Company name', 120);
    const country = field(body.country, 'Country', 80);
    let website: string | undefined;
    if (body.website !== undefined && body.website !== '') {
      const raw = field(body.website, 'Website', 200);
      let url: URL;
      try { url = new URL(raw); } catch { throw new BadRequestException('Website must be a valid URL'); }
      if (url.protocol !== 'https:') throw new BadRequestException('Website must use HTTPS');
      website = url.toString();
    }
    return this.prisma.managedOrganization.create({ data: { ownerId: user.id, name, country, website } });
  }
  async setVerification(user: AuthenticatedUser, id: string, body: Record<string, unknown>) {
    if (user.role !== 'ADMIN') throw new ForbiddenException();
    const org = await this.org(id, user);
    if (org.status !== 'PENDING') throw new ConflictException('Organization already reviewed');
    const approved = body.approved === true;
    if (!approved && body.approved !== false) throw new BadRequestException('approved must be boolean');
    const changed = await this.prisma.managedOrganization.updateMany({
      where: { id, status: 'PENDING' }, data: { status: approved ? 'VERIFIED' : 'REJECTED' },
    });
    if (changed.count !== 1) throw new ConflictException('Organization status changed');
    await this.audit(user, 'ORG_REVIEW', 'ManagedOrganization', id);
    return this.org(id, user);
  }
  async engagements(user: AuthenticatedUser) {
    return this.prisma.managedEngagement.findMany({
      where: user.role === 'ADMIN' ? {} : { organization: { ownerId: user.id } },
      include: { organization: { select: { id: true, name: true, status: true } },
        milestones: true, invoices: true },
      orderBy: { createdAt: 'desc' }, take: 100,
    });
  }
  async oneEngagement(user: AuthenticatedUser, id: string) { return this.engagement(id, user); }
  async request(user: AuthenticatedUser, body: Record<string, unknown>) {
    const organizationId = field(body.organizationId, 'Organization', 60);
    const organization = await this.org(organizationId, user);
    if (organization.ownerId !== user.id) throw new ForbiddenException('Only the company owner can request a service');
    if (organization.status === 'REJECTED') throw new ForbiddenException('Organization verification rejected');
    const serviceSlug = field(body.serviceSlug, 'Service', 80);
    if (!OFFERINGS.some(o => o.slug === serviceSlug)) throw new BadRequestException('Unknown service');
    const title = field(body.title, 'Project title', 120);
    const brief = field(body.brief, 'Requirements', 5000);
    const currency = moneyCurrency(body.currency ?? 'USD');
    const engagement = await this.prisma.managedEngagement.create({
      data: { organizationId, serviceSlug, title, brief, currency },
    });
    await this.audit(user, 'ENGAGEMENT_REQUEST', 'ManagedEngagement', engagement.id);
    return engagement;
  }
  async quote(user: AuthenticatedUser, id: string, body: Record<string, unknown>) {
    if (user.role !== 'ADMIN') throw new ForbiddenException();
    const current = await this.engagement(id, user);
    if (current.organization.status !== 'VERIFIED') throw new ConflictException('Verify company before quoting');
    if (current.status !== 'REQUESTED') throw new ConflictException('Engagement is not awaiting a quote');
    const quotedCents = amount(body.quotedCents);
    const changed = await this.prisma.managedEngagement.updateMany({
      where: { id, status: 'REQUESTED' }, data: { quotedCents, status: 'QUOTED' },
    });
    if (!changed.count) throw new ConflictException('Engagement status changed');
    await this.audit(user, 'QUOTE_ISSUED', 'ManagedEngagement', id);
    return this.engagement(id, user);
  }
  async accept(user: AuthenticatedUser, id: string) {
    const current = await this.engagement(id, user);
    if (current.organization.ownerId !== user.id) throw new ForbiddenException('Only the client owner can accept');
    if (current.status !== 'QUOTED' || current.quotedCents === null) throw new ConflictException('A valid quote is required');
    const changed = await this.prisma.managedEngagement.updateMany({
      where: { id, status: 'QUOTED' }, data: { status: 'ACCEPTED' },
    });
    if (!changed.count) throw new ConflictException('Quote changed');
    await this.audit(user, 'QUOTE_ACCEPTED', 'ManagedEngagement', id);
    return this.engagement(id, user);
  }
  async start(user: AuthenticatedUser, id: string, body: Record<string, unknown>) {
    if (user.role !== 'ADMIN') throw new ForbiddenException();
    const current = await this.engagement(id, user);
    if (current.status !== 'ACCEPTED') throw new ConflictException('Client must accept the quote first');
    const managerId = field(body.managerId, 'Manager ID', 80);
    const manager = await this.prisma.user.findUnique({ where: { id: managerId } });
    if (!manager || manager.role !== 'ADMIN' || manager.status !== 'ACTIVE') {
      throw new BadRequestException('Manager must be an active admin user');
    }
    const changed = await this.prisma.managedEngagement.updateMany({
      where: { id, status: 'ACCEPTED' }, data: { status: 'ACTIVE', managerId },
    });
    if (!changed.count) throw new ConflictException('Engagement status changed');
    await this.audit(user, 'ENGAGEMENT_STARTED', 'ManagedEngagement', id);
    return this.engagement(id, user);
  }
  async milestone(user: AuthenticatedUser, id: string, body: Record<string, unknown>) {
    if (user.role !== 'ADMIN') throw new ForbiddenException();
    const engagement = await this.engagement(id, user);
    if (engagement.status !== 'ACTIVE') throw new ConflictException('Start engagement first');
    const title = field(body.title, 'Milestone title', 160);
    let dueDate: Date | undefined;
    if (body.dueDate !== undefined && body.dueDate !== '') {
      dueDate = new Date(field(body.dueDate, 'Due date', 40));
      if (Number.isNaN(dueDate.getTime())) throw new BadRequestException('Invalid due date');
    }
    const created = await this.prisma.managedMilestone.create({ data: { engagementId: id, title, dueDate } });
    await this.audit(user, 'MILESTONE_CREATED', 'ManagedMilestone', created.id);
    return created;
  }
  async deliver(user: AuthenticatedUser, id: string, body: Record<string, unknown>) {
    if (user.role !== 'ADMIN') throw new ForbiddenException();
    const milestone = await this.prisma.managedMilestone.findUnique({ where: { id } });
    if (!milestone) throw new NotFoundException('Milestone not found');
    const engagement = await this.engagement(milestone.engagementId, user);
    if (engagement.status !== 'ACTIVE' || milestone.status !== 'PLANNED') {
      throw new ConflictException('Milestone is not ready for delivery');
    }
    const deliveryNote = field(body.deliveryNote, 'Delivery note', 3000);
    const changed = await this.prisma.managedMilestone.updateMany({
      where: { id, status: 'PLANNED' }, data: { deliveryNote, status: 'SUBMITTED' },
    });
    if (!changed.count) throw new ConflictException('Milestone changed');
    await this.audit(user, 'MILESTONE_SUBMITTED', 'ManagedMilestone', id);
    return this.prisma.managedMilestone.findUnique({ where: { id } });
  }
  async review(user: AuthenticatedUser, id: string, body: Record<string, unknown>) {
    const milestone = await this.prisma.managedMilestone.findUnique({ where: { id } });
    if (!milestone) throw new NotFoundException('Milestone not found');
    const engagement = await this.engagement(milestone.engagementId, user);
    if (engagement.organization.ownerId !== user.id) throw new ForbiddenException('Client owner required');
    if (engagement.status !== 'ACTIVE' || milestone.status !== 'SUBMITTED') {
      throw new ConflictException('Milestone is not submitted');
    }
    if (body.approved !== true && body.approved !== false) throw new BadRequestException('approved must be boolean');
    const approved = body.approved === true;
    const clientFeedback = approved ? null : field(body.clientFeedback, 'Revision feedback', 1000);
    const changed = await this.prisma.managedMilestone.updateMany({
      where: { id, status: 'SUBMITTED' },
      data: { status: approved ? 'APPROVED' : 'PLANNED', clientFeedback, approvedAt: approved ? new Date() : null },
    });
    if (!changed.count) throw new ConflictException('Milestone changed');
    await this.audit(user, approved ? 'MILESTONE_APPROVED' : 'MILESTONE_REVISION', 'ManagedMilestone', id);
    return this.prisma.managedMilestone.findUnique({ where: { id } });
  }
  async complete(user: AuthenticatedUser, id: string) {
    if (user.role !== 'ADMIN') throw new ForbiddenException();
    const engagement = await this.engagement(id, user);
    if (engagement.status !== 'ACTIVE' || !engagement.milestones.length ||
        engagement.milestones.some(m => m.status !== 'APPROVED')) {
      throw new ConflictException('All milestones must be approved');
    }
    const changed = await this.prisma.managedEngagement.updateMany({
      where: { id, status: 'ACTIVE' }, data: { status: 'COMPLETED' },
    });
    if (!changed.count) throw new ConflictException('Engagement status changed');
    await this.audit(user, 'ENGAGEMENT_COMPLETED', 'ManagedEngagement', id);
    return this.engagement(id, user);
  }
  async draftInvoice(user: AuthenticatedUser, id: string, body: Record<string, unknown>) {
    if (user.role !== 'ADMIN') throw new ForbiddenException();
    const engagement = await this.engagement(id, user);
    if (!['ACCEPTED', 'ACTIVE', 'COMPLETED'].includes(engagement.status)) {
      throw new ConflictException('Client has not accepted the quote');
    }
    const amountCents = amount(body.amountCents);
    if (!engagement.quotedCents || amountCents > engagement.quotedCents) {
      throw new BadRequestException('Invoice amount cannot exceed the accepted quote');
    }
    const total = engagement.invoices.reduce((sum, invoice) => sum + invoice.amountCents, 0);
    if (total + amountCents > engagement.quotedCents) throw new ConflictException('Invoices exceed accepted quote');
    const invoice = await this.prisma.managedInvoice.create({
      data: { engagementId: id, number: `TGS-${Date.now()}-${Math.random().toString(36).slice(2,8).toUpperCase()}`,
        amountCents, currency: engagement.currency, status: 'DRAFT' },
    });
    await this.audit(user, 'INVOICE_DRAFTED', 'ManagedInvoice', invoice.id);
    return invoice;
  }
  async vetSpecialist(user: AuthenticatedUser, body: Record<string, unknown>) {
    if (user.role !== 'ADMIN') throw new ForbiddenException();
    const userId = field(body.userId, 'User ID', 80);
    const person = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!person || person.status !== 'ACTIVE') throw new BadRequestException('Active user required');
    const skills = field(body.skills, 'Skills', 600);
    if (typeof body.vetted !== 'boolean' || typeof body.available !== 'boolean') {
      throw new BadRequestException('Vetting and availability must be boolean');
    }
    const record = await this.prisma.managedSpecialist.upsert({
      where: { userId },
      create: { userId, skills, vetted: body.vetted, available: body.available },
      update: { skills, vetted: body.vetted, available: body.available },
    });
    await this.audit(user, 'SPECIALIST_VETTING', 'ManagedSpecialist', record.id);
    return record;
  }
  async specialists(user: AuthenticatedUser) {
    if (user.role !== 'ADMIN') throw new ForbiddenException();
    return this.prisma.managedSpecialist.findMany({ orderBy: { updatedAt: 'desc' } });
  }
  private async audit(user: AuthenticatedUser, action: string, entityType: string, entityId: string) {
    await this.prisma.auditLog.create({ data: { actorId: user.id, action, entityType, entityId } });
  }
}
