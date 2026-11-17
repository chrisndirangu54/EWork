import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { FirebaseAuthGuard } from '../common/guards/firebase-auth.guard';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { GlobalJobsService } from './global-jobs.service';

@ApiTags('global-jobs')
@Controller('api/v1/global-jobs')
export class GlobalJobsController {
  constructor(private readonly jobs: GlobalJobsService) {}

  @Get()
  browse(@Query('q') query?: string) { return this.jobs.publicJobs(query); }

  @Get('workspace')
  @UseGuards(FirebaseAuthGuard)
  @ApiBearerAuth()
  workspace(@CurrentUser() user: AuthenticatedUser) { return this.jobs.workspace(user); }

  @Post()
  @UseGuards(FirebaseAuthGuard)
  @ApiBearerAuth()
  post(@CurrentUser() user: AuthenticatedUser, @Body() body: Record<string, unknown>) {
    return this.jobs.post(user, body);
  }

  @Get(':id')
  detail(@Param('id') id: string) { return this.jobs.publicJob(id); }

  @Post(':id/applications')
  @UseGuards(FirebaseAuthGuard)
  @ApiBearerAuth()
  apply(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string,
        @Body() body: Record<string, unknown>) {
    return this.jobs.apply(user, id, body);
  }

  @Get(':id/applications')
  @UseGuards(FirebaseAuthGuard)
  @ApiBearerAuth()
  applications(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.jobs.applications(user, id);
  }

  @Post(':id/offer')
  @UseGuards(FirebaseAuthGuard)
  @ApiBearerAuth()
  offer(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string,
        @Body() body: Record<string, unknown>) {
    return this.jobs.offer(user, id, String(body.applicationId || ''));
  }

  @Post(':id/offer/respond')
  @UseGuards(FirebaseAuthGuard)
  @ApiBearerAuth()
  respond(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string,
          @Body() body: Record<string, unknown>) {
    return this.jobs.respond(user, id, body.accept);
  }

  @Post(':id/close')
  @UseGuards(FirebaseAuthGuard)
  @ApiBearerAuth()
  close(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.jobs.close(user, id);
  }

  @Get(':id/workspace')
  @UseGuards(FirebaseAuthGuard)
  @ApiBearerAuth()
  privateJob(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.jobs.privateJob(user, id);
  }

  @Get(':id/updates')
  @UseGuards(FirebaseAuthGuard)
  @ApiBearerAuth()
  updates(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.jobs.updates(user, id);
  }

  @Post(':id/updates')
  @UseGuards(FirebaseAuthGuard)
  @ApiBearerAuth()
  progress(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string,
           @Body() body: Record<string, unknown>) {
    return this.jobs.updateProgress(user, id, body);
  }

  @Get(':id/messages')
  @UseGuards(FirebaseAuthGuard)
  @ApiBearerAuth()
  messages(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.jobs.messages(user, id);
  }

  @Post(':id/messages')
  @UseGuards(FirebaseAuthGuard)
  @ApiBearerAuth()
  message(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string,
          @Body() body: Record<string, unknown>) {
    return this.jobs.message(user, id, body);
  }

  @Post(':id/milestones/:milestoneId/submit')
  @UseGuards(FirebaseAuthGuard)
  @ApiBearerAuth()
  deliver(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string,
          @Param('milestoneId') milestoneId: string, @Body() body: Record<string, unknown>) {
    return this.jobs.submit(user, id, milestoneId, body);
  }

  @Post(':id/milestones/:milestoneId/review')
  @UseGuards(FirebaseAuthGuard)
  @ApiBearerAuth()
  review(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string,
         @Param('milestoneId') milestoneId: string, @Body() body: Record<string, unknown>) {
    return this.jobs.review(user, id, milestoneId, body);
  }
}
