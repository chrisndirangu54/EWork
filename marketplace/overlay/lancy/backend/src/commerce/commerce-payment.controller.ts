import { Body, Controller, Get, Headers, Param, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { FirebaseAuthGuard } from '../common/guards/firebase-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { CommercePaymentService } from './commerce-payment.service';

@ApiTags('commerce-payments')
@Controller('api/v1/commerce')
export class CommercePaymentController {
  constructor(private readonly service: CommercePaymentService) {}
  @Get('capabilities')
  capabilities() { return this.service.status(); }

  @UseGuards(FirebaseAuthGuard)
  @ApiBearerAuth()
  @Post('sandbox/checkout')
  checkout(@CurrentUser() user: AuthenticatedUser, @Body() body: Record<string,unknown>) {
    return this.service.initiate(user, body);
  }

  @UseGuards(FirebaseAuthGuard)
  @ApiBearerAuth()
  @Get('sandbox/attempts/:id')
  attempt(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.service.getAttempt(user, id);
  }

  @UseGuards(FirebaseAuthGuard)
  @ApiBearerAuth()
  @Post('sandbox/attempts/:id/reconcile')
  reconcile(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string,
      @Body() body: Record<string,unknown>) {
    return this.service.reconcile(user, id, body);
  }

  // No Firebase user token: only the signed, exact raw payload can activate this route.
  @Post('webhook/flutterwave')
  webhook(@Req() request: Request & { rawBody?: Buffer },
      @Headers('flutterwave-signature') signature?: string,
      @Headers('verif-hash') v3Hash?: string) {
    return this.service.handleWebhook(request.rawBody || Buffer.alloc(0), signature, v3Hash);
  }

  @UseGuards(FirebaseAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @Post('admin/sandbox/payout-drafts/:orderId')
  payoutDraft(@CurrentUser() user: AuthenticatedUser, @Param('orderId') orderId: string) {
    return this.service.draftPayout(user, orderId);
  }

  @UseGuards(FirebaseAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @Get('admin/sandbox/payout-drafts')
  payoutDrafts(@CurrentUser() user: AuthenticatedUser) {
    return this.service.payoutDrafts(user);
  }
}
