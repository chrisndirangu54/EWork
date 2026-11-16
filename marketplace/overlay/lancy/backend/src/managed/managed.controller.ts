import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ManagedService } from './managed.service';
import { FirebaseAuthGuard } from '../common/guards/firebase-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';

@ApiTags('managed-services')
@Controller('api/v1/managed')
export class ManagedController {
  constructor(private readonly service: ManagedService) {}
  @Get('catalog')
  catalog() { return this.service.catalog(); }

  @UseGuards(FirebaseAuthGuard)
  @ApiBearerAuth()
  @Get('organizations')
  organizations(@CurrentUser() user: AuthenticatedUser) { return this.service.organizations(user); }

  @UseGuards(FirebaseAuthGuard)
  @Post('organizations')
  organization(@CurrentUser() user: AuthenticatedUser, @Body() body: Record<string, unknown>) {
    return this.service.createOrganization(user, body);
  }

  @UseGuards(FirebaseAuthGuard)
  @Get('engagements')
  engagements(@CurrentUser() user: AuthenticatedUser) { return this.service.engagements(user); }

  @UseGuards(FirebaseAuthGuard)
  @Post('engagements')
  request(@CurrentUser() user: AuthenticatedUser, @Body() body: Record<string, unknown>) {
    return this.service.request(user, body);
  }

  @UseGuards(FirebaseAuthGuard)
  @Get('engagements/:id')
  one(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.service.oneEngagement(user, id);
  }

  @UseGuards(FirebaseAuthGuard)
  @Post('engagements/:id/accept')
  accept(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.service.accept(user, id);
  }

  @UseGuards(FirebaseAuthGuard)
  @Post('milestones/:id/review')
  review(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.service.review(user, id, body);
  }

  @UseGuards(FirebaseAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Patch('admin/organizations/:id/verify')
  verify(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.service.setVerification(user, id, body);
  }

  @UseGuards(FirebaseAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Post('admin/engagements/:id/quote')
  quote(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.service.quote(user, id, body);
  }

  @UseGuards(FirebaseAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Post('admin/engagements/:id/start')
  start(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.service.start(user, id, body);
  }

  @UseGuards(FirebaseAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Post('admin/engagements/:id/milestones')
  milestone(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.service.milestone(user, id, body);
  }

  @UseGuards(FirebaseAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Post('admin/milestones/:id/submit')
  deliver(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.service.deliver(user, id, body);
  }

  @UseGuards(FirebaseAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Post('admin/engagements/:id/complete')
  complete(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.service.complete(user, id);
  }

  @UseGuards(FirebaseAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Post('admin/engagements/:id/invoice-drafts')
  invoice(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.service.draftInvoice(user, id, body);
  }

  @UseGuards(FirebaseAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Get('admin/specialists')
  specialists(@CurrentUser() user: AuthenticatedUser) { return this.service.specialists(user); }

  @UseGuards(FirebaseAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Post('admin/specialists')
  vet(@CurrentUser() user: AuthenticatedUser, @Body() body: Record<string, unknown>) {
    return this.service.vetSpecialist(user, body);
  }
}
