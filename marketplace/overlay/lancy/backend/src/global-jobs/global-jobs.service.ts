import {
  BadRequestException, ConflictException, ForbiddenException,
  Injectable, NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { AuthenticatedUser } from '../common/decorators/current-user.decorator';

const CURRENCIES = new Set(['USD', 'EUR', 'GBP', 'KES']);
function stringField(value: unknown, name: string, max: number): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) {
    throw new BadRequestException(name + ' must be between 1 and ' + max + ' characters');
  }
  return value.trim();
}
function optionalField(value: unknown, name: string, max: number): string {
  return value === undefined || value === null || value === '' ? '' : stringField(value, name, max);
}
function optionalAmount(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 100 || value > 1000000000) {
    throw new BadRequestException('Budget or bid must be integer minor currency units (100..1000000000)');
  }
  return value;
}
function currencyField(value: unknown): string {
  const currency = stringField(value || 'USD', 'Currency', 3).toUpperCase();
  if (!CURRENCIES.has(currency)) throw new BadRequestException('Unsupported currency');
  return currency;
}
function looksLikeId(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(value)) {
    throw new BadRequestException('Invalid job or application identifier');
  }
  return value;
}
function jobSummary(job: any) {
  return { id: job.id, title: job.title, description: job.description,
    skills: job.skills, category: job.category, budgetCents: job.budgetCents,
    currency: job.currency, location: job.location, remote: job.remote,
    status: job.status, createdAt: job.createdAt, updatedAt: job.updatedAt };
}

@Injectable()
export class GlobalJobsService {
  constructor(private readonly prisma: PrismaService) {}

  async publicJobs(query?: string) {
    const search = optionalField(query, 'Search', 80);
    const jobs = await this.prisma.globalJob.findMany({
      where: { status: 'OPEN', ...(search ? { OR: [
        { title: { contains: search } }, { skills: { contains: search } },
        { description: { contains: search } },
      ] } : {}) },
      orderBy: { createdAt: 'desc' }, take: 50,
    });
    return { jobs: jobs.map(jobSummary), limit: 50 };
  }
  async publicJob(id: string) {
    const job = await this.prisma.globalJob.findFirst({ where: { id: looksLikeId(id), status: 'OPEN' } });
    if (!job) throw new NotFoundException('Open job not found');
    return jobSummary(job);
  }
  async workspace(user: AuthenticatedUser) {
    const [posted, assigned, applications, seller] = await Promise.all([
      this.prisma.globalJob.findMany({
        where: { employerId: user.id }, orderBy: { createdAt: 'desc' },
        include: { milestones: { orderBy: { createdAt: 'asc' } } }, take: 50,
      }),
      this.prisma.globalJob.findMany({
        where: { selectedUserId: user.id }, orderBy: { updatedAt: 'desc' },
        include: { milestones: { orderBy: { createdAt: 'asc' } } }, take: 50,
      }),
      this.prisma.globalJobApplication.findMany({
        where: { applicantId: user.id }, orderBy: { createdAt: 'desc' },
        include: { job: { select: { id: true, title: true, status: true, currency: true,
          budgetCents: true, selectedUserId: true } } }, take: 100,
      }),
      this.prisma.freelanceSeller.findUnique({ where: { userId: user.id } }),
    ]);
    return {
      userId: user.id,
      sellerStatus: seller?.status || 'NOT_APPLIED',
      posted, assigned, applications,
      paymentsEnabled: false, settlementEnabled: false,
    };
  }
  async post(user: AuthenticatedUser, body: Record<string, unknown>) {
    const title = stringField(body.title, 'Job title', 160);
    const description = stringField(body.description, 'Job description', 6000);
    const skills = stringField(body.skills, 'Skills', 500);
    const category = stringField(body.category || 'Software and technology', 'Category', 80);
    const currency = currencyField(body.currency);
    const budgetCents = optionalAmount(body.budgetCents);
    const location = stringField(body.location || 'Remote', 'Location', 120);
    const remote = body.remote === undefined ? true : body.remote;
    if (typeof remote !== 'boolean') throw new BadRequestException('remote must be boolean');
    const sourceRef = optionalField(body.sourceRef, 'Source reference', 80) || null;
    const requested = body.milestones === undefined ? ['Delivery and client acceptance'] : body.milestones;
    if (!Array.isArray(requested) || requested.length < 1 || requested.length > 15) {
      throw new BadRequestException('Provide 1 to 15 milestone names');
    }
    const names = requested.map(name => stringField(name, 'Milestone', 160));
    return this.prisma.$transaction(async tx => {
      if (sourceRef) {
        const duplicate = await tx.globalJob.findFirst({ where: { employerId: user.id, sourceRef } });
        if (duplicate) return { ...jobSummary(duplicate), duplicate: true };
      }
      const job = await tx.globalJob.create({
        data: { employerId: user.id, title, description, skills, category,
          currency, budgetCents, location, remote, sourceRef,
          milestones: { create: names.map(title => ({ title })) } },
        include: { milestones: true },
      });
      await tx.auditLog.create({
        data: { actorId: user.id, action: 'GLOBAL_JOB_PUBLISHED',
          entityType: 'GlobalJob', entityId: job.id },
      });
      return { ...jobSummary(job), duplicate: false };
    });
  }
  async apply(user: AuthenticatedUser, id: string, body: Record<string, unknown>) {
    const job = await this.prisma.globalJob.findUnique({ where: { id: looksLikeId(id) } });
    if (!job || job.status !== 'OPEN') throw new ConflictException('This job is not accepting applications');
    if (job.employerId === user.id) throw new ForbiddenException('Cannot apply to your own job');
    const pitch = stringField(body.pitch, 'Proposal', 3000);
    const bidCents = optionalAmount(body.bidCents);
    if (bidCents !== null && bidCents > 0 && job.budgetCents !== null &&
        bidCents > job.budgetCents * 10) {
      throw new BadRequestException('Bid exceeds supported review limit');
    }
    const existing = await this.prisma.globalJobApplication.findUnique({
      where: { jobId_applicantId: { jobId: id, applicantId: user.id } },
    });
    if (existing) throw new ConflictException('You have already applied to this job');
    const application = await this.prisma.globalJobApplication.create({
      data: { jobId: job.id, applicantId: user.id, pitch, bidCents },
    });
    await this.audit(user, 'GLOBAL_JOB_APPLIED', 'GlobalJobApplication', application.id);
    return application;
  }
  async applications(user: AuthenticatedUser, id: string) {
    const job = await this.owner(user, id);
    return this.prisma.globalJobApplication.findMany({
      where: { jobId: job.id }, orderBy: { createdAt: 'asc' }, take: 100,
    });
  }
  async offer(user: AuthenticatedUser, id: string, applicationId: string) {
    const job = await this.owner(user, id);
    if (job.status !== 'OPEN') throw new ConflictException('Job is not open');
    const app = await this.prisma.globalJobApplication.findFirst({
      where: { id: looksLikeId(applicationId), jobId: job.id, status: 'APPLIED' },
    });
    if (!app) throw new NotFoundException('Pending application not found');
    const seller = await this.prisma.freelanceSeller.findUnique({ where: { userId: app.applicantId } });
    if (seller?.status !== 'VERIFIED') {
      throw new ConflictException('Verify freelancer identity before offering a job');
    }
    await this.prisma.$transaction(async tx => {
      const changed = await tx.globalJob.updateMany({
        where: { id: job.id, status: 'OPEN', selectedUserId: null },
        data: { status: 'OFFERED', selectedUserId: app.applicantId },
      });
      if (changed.count !== 1) throw new ConflictException('Job has already changed');
      await tx.globalJobApplication.update({ where: { id: app.id }, data: { status: 'OFFERED' } });
      await tx.auditLog.create({ data: { actorId: user.id, action: 'GLOBAL_JOB_OFFERED',
        entityType: 'GlobalJob', entityId: job.id } });
    });
    return this.privateJob(user, id);
  }
  async respond(user: AuthenticatedUser, id: string, accept: unknown) {
    if (typeof accept !== 'boolean') throw new BadRequestException('accept must be boolean');
    const job = await this.prisma.globalJob.findUnique({ where: { id: looksLikeId(id) } });
    if (!job || job.selectedUserId !== user.id) throw new NotFoundException('Offer not found');
    if (job.status !== 'OFFERED') throw new ConflictException('No pending offer');
    await this.prisma.$transaction(async tx => {
      const changed = await tx.globalJob.updateMany({
        where: { id, selectedUserId: user.id, status: 'OFFERED' },
        data: { status: accept ? 'IN_PROGRESS' : 'OPEN',
          ...(accept ? {} : { selectedUserId: null }) },
      });
      if (!changed.count) throw new ConflictException('Offer already responded to');
      await tx.globalJobApplication.updateMany({
        where: { jobId: id, applicantId: user.id, status: 'OFFERED' },
        data: { status: accept ? 'SELECTED' : 'DECLINED' },
      });
      if (accept) {
        await tx.globalJobApplication.updateMany({
          where: { jobId: id, applicantId: { not: user.id }, status: 'APPLIED' },
          data: { status: 'NOT_SELECTED' },
        });
      }
      await tx.auditLog.create({ data: { actorId: user.id, action: accept ? 'GLOBAL_JOB_ACCEPTED' : 'GLOBAL_JOB_DECLINED',
        entityType: 'GlobalJob', entityId: id } });
    });
    return this.privateJob(user, id);
  }
  async close(user: AuthenticatedUser, id: string) {
    const job = await this.owner(user, id);
    if (job.status !== 'OPEN') throw new ConflictException('Only open jobs can be closed');
    const changed = await this.prisma.globalJob.updateMany({
      where: { id, status: 'OPEN' }, data: { status: 'CLOSED' },
    });
    if (!changed.count) throw new ConflictException('Job status changed');
    await this.audit(user, 'GLOBAL_JOB_CLOSED', 'GlobalJob', id);
    return { id, status: 'CLOSED' };
  }
  async privateJob(user: AuthenticatedUser, id: string) {
    const job = await this.participant(user, id);
    return this.prisma.globalJob.findUnique({
      where: { id: job.id },
      include: { milestones: { orderBy: { createdAt: 'asc' } } },
    });
  }
  async messages(user: AuthenticatedUser, id: string) {
    await this.participant(user, id);
    return this.prisma.globalJobMessage.findMany({
      where: { jobId: id }, orderBy: { createdAt: 'asc' }, take: 200,
    });
  }
  async message(user: AuthenticatedUser, id: string, body: Record<string, unknown>) {
    const job = await this.participant(user, id);
    if (job.status !== 'IN_PROGRESS') throw new ConflictException('Messaging opens after job acceptance');
    const text = stringField(body.text, 'Message', 3000);
    const sent = await this.prisma.globalJobMessage.create({
      data: { jobId: id, authorId: user.id, body: text },
    });
    await this.audit(user, 'GLOBAL_JOB_MESSAGE', 'GlobalJobMessage', sent.id);
    return sent;
  }
  async updates(user: AuthenticatedUser, id: string) {
    await this.participant(user, id);
    return this.prisma.globalJobUpdate.findMany({
      where: { jobId: id }, orderBy: { createdAt: 'asc' }, take: 200,
    });
  }
  async updateProgress(user: AuthenticatedUser, id: string, body: Record<string, unknown>) {
    const job = await this.worker(user, id);
    if (job.status !== 'IN_PROGRESS') throw new ConflictException('Job is not active');
    const summary = stringField(body.summary, 'Work update', 3000);
    const percent = body.percent;
    if (typeof percent !== 'number' || !Number.isInteger(percent) || percent < 0 || percent > 100) {
      throw new BadRequestException('Progress must be an integer 0–100');
    }
    const update = await this.prisma.globalJobUpdate.create({
      data: { jobId: id, authorId: user.id, summary, percent },
    });
    await this.audit(user, 'GLOBAL_JOB_PROGRESS', 'GlobalJobUpdate', update.id);
    return update;
  }
  async submit(user: AuthenticatedUser, id: string, milestoneId: string, body: Record<string, unknown>) {
    const job = await this.worker(user, id);
    if (job.status !== 'IN_PROGRESS') throw new ConflictException('Job is not active');
    const submission = stringField(body.submission, 'Deliverable summary', 5000);
    const changed = await this.prisma.globalJobMilestone.updateMany({
      where: { id: looksLikeId(milestoneId), jobId: id,
        status: { in: ['OPEN', 'CHANGES_REQUESTED'] } },
      data: { status: 'SUBMITTED', submission, submittedAt: new Date(), feedback: null },
    });
    if (!changed.count) throw new ConflictException('Milestone is not ready for submission');
    await this.audit(user, 'GLOBAL_MILESTONE_SUBMITTED', 'GlobalJobMilestone', milestoneId);
    return this.privateJob(user, id);
  }
  async review(user: AuthenticatedUser, id: string, milestoneId: string, body: Record<string, unknown>) {
    const job = await this.owner(user, id);
    if (job.status !== 'IN_PROGRESS') throw new ConflictException('Job is not active');
    if (typeof body.approved !== 'boolean') throw new BadRequestException('approved must be boolean');
    const feedback = body.approved ? null : stringField(body.feedback, 'Revision feedback', 2000);
    await this.prisma.$transaction(async tx => {
      const changed = await tx.globalJobMilestone.updateMany({
        where: { id: looksLikeId(milestoneId), jobId: id, status: 'SUBMITTED' },
        data: { status: body.approved ? 'ACCEPTED' : 'CHANGES_REQUESTED',
          feedback, approvedAt: body.approved ? new Date() : null },
      });
      if (!changed.count) throw new ConflictException('Milestone is not submitted');
      const remaining = await tx.globalJobMilestone.count({
        where: { jobId: id, status: { not: 'ACCEPTED' } },
      });
      if (remaining === 0) {
        await tx.globalJob.updateMany({ where: { id, status: 'IN_PROGRESS' },
          data: { status: 'COMPLETED' } });
      }
      await tx.auditLog.create({ data: { actorId: user.id, action: body.approved ? 'GLOBAL_MILESTONE_ACCEPTED' : 'GLOBAL_MILESTONE_REVISION',
        entityType: 'GlobalJobMilestone', entityId: milestoneId } });
    });
    return this.privateJob(user, id);
  }
  private async participant(user: AuthenticatedUser, id: string) {
    const job = await this.prisma.globalJob.findUnique({ where: { id: looksLikeId(id) } });
    if (!job || (user.id !== job.employerId && user.id !== job.selectedUserId)) {
      throw new NotFoundException('Job workspace not found');
    }
    return job;
  }
  private async worker(user: AuthenticatedUser, id: string) {
    const job = await this.participant(user, id);
    if (job.selectedUserId !== user.id) throw new ForbiddenException('Assigned freelancer required');
    return job;
  }
  private async owner(user: AuthenticatedUser, id: string) {
    const job = await this.participant(user, id);
    if (job.employerId !== user.id) throw new ForbiddenException('Job employer required');
    return job;
  }
  private async audit(user: AuthenticatedUser, action: string, entityType: string, entityId: string) {
    await this.prisma.auditLog.create({
      data: { actorId: user.id, action, entityType, entityId },
    });
  }
}
