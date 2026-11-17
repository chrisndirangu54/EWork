import { Module } from '@nestjs/common';
import { CommercePaymentController } from './commerce-payment.controller';
import { CommercePaymentService } from './commerce-payment.service';
@Module({ controllers: [CommercePaymentController], providers: [CommercePaymentService] })
export class CommercePaymentModule {}
