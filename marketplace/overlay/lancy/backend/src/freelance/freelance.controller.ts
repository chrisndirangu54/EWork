import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { FirebaseAuthGuard } from '../common/guards/firebase-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { FreelanceService } from './freelance.service';

@ApiTags('freelance-marketplace')
@Controller('api/v1/freelance')
export class FreelanceController {
  constructor(private readonly service: FreelanceService) {}

  @Get('gigs')
  list(@Query('q') q?: string, @Query('category') category?: string) {
    return this.service.publicGigs(q, category);
  }

  @Get('gigs/:id')
  publicGig(@Param('id') id: string) { return this.service.publicGig(id); }

  @UseGuards(FirebaseAuthGuard)
  @ApiBearerAuth()
  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser) { return this.service.myWorkspace(user); }

  @UseGuards(FirebaseAuthGuard)
  @ApiBearerAuth()
  @Post('seller/apply')
  apply(@CurrentUser() user: AuthenticatedUser, @Body() body: Record<string, unknown>) {
    return this.service.applySeller(user, body);
  }

  @UseGuards(FirebaseAuthGuard)
  @ApiBearerAuth()
  @Post('gigs')
  createGig(@CurrentUser() user: AuthenticatedUser, @Body() body: Record<string, unknown>) {
    return this.service.createGig(user, body);
  }

  @UseGuards(FirebaseAuthGuard)
  @ApiBearerAuth()
  @Post('gigs/:id/publish')
  publish(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.service.publishGig(user, id);
  }

  @UseGuards(FirebaseAuthGuard)
  @ApiBearerAuth()
  @Post('gigs/:id/archive')
  archive(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.service.archiveGig(user, id);
  }

  @UseGuards(FirebaseAuthGuard)
  @ApiBearerAuth()
  @Post('orders')
  createOrder(@CurrentUser() user: AuthenticatedUser, @Body() body: Record<string, unknown>) {
    return this.service.createOrder(user, body);
  }

  @UseGuards(FirebaseAuthGuard)
  @ApiBearerAuth()
  @Get('orders')
  orders(@CurrentUser() user: AuthenticatedUser) { return this.service.orders(user); }

  @UseGuards(FirebaseAuthGuard)
  @ApiBearerAuth()
  @Get('orders/:id')
  order(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.service.getOrder(user, id);
  }

  @UseGuards(FirebaseAuthGuard)
  @ApiBearerAuth()
  @Post('orders/:id/respond')
  respond(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string,
          @Body() body: Record<string, unknown>) {
    return this.service.respondToOrder(user, id, body.accept);
  }

  @UseGuards(FirebaseAuthGuard)
  @ApiBearerAuth()
  @Post('orders/:id/cancel')
  cancel(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.service.cancelRequest(user, id);
  }

  @UseGuards(FirebaseAuthGuard)
  @ApiBearerAuth()
  @Post('orders/:id/deliver')
  deliver(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string,
          @Body() body: Record<string, unknown>) {
    return this.service.submitDelivery(user, id, body);
  }

  @UseGuards(FirebaseAuthGuard)
  @ApiBearerAuth()
  @Post('orders/:id/review-delivery')
  reviewDelivery(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string,
                 @Body() body: Record<string, unknown>) {
    return this.service.reviewDelivery(user, id, body);
  }

  @UseGuards(FirebaseAuthGuard)
  @ApiBearerAuth()
  @Post('orders/:id/messages')
  message(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string,
          @Body() body: Record<string, unknown>) {
    return this.service.postMessage(user, id, body);
  }

  @UseGuards(FirebaseAuthGuard)
  @ApiBearerAuth()
  @Get('orders/:id/messages')
  messages(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.service.messages(user, id);
  }

  @UseGuards(FirebaseAuthGuard)
  @ApiBearerAuth()
  @Post('orders/:id/reviews')
  review(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string,
         @Body() body: Record<string, unknown>) {
    return this.service.leaveReview(user, id, body);
  }

  @UseGuards(FirebaseAuthGuard)
  @ApiBearerAuth()
  @Post('orders/:id/disputes')
  dispute(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string,
          @Body() body: Record<string, unknown>) {
    return this.service.openDispute(user, id, body);
  }

  @UseGuards(FirebaseAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @Get('admin/sellers')
  sellers(@CurrentUser() user: AuthenticatedUser) {
    return this.service.adminSellers(user);
  }

  @UseGuards(FirebaseAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @Patch('admin/sellers/:id/verify')
  verify(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string,
         @Body() body: Record<string, unknown>) {
    return this.service.verifySeller(user, id, body);
  }

  @UseGuards(FirebaseAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @Get('admin/disputes')
  disputes(@CurrentUser() user: AuthenticatedUser) {
    return this.service.adminDisputes(user);
  }

  @UseGuards(FirebaseAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @Post('admin/disputes/:id/resolve')
  resolve(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string,
          @Body() body: Record<string, unknown>) {
    return this.service.resolveDispute(user, id, body);
  }
}
