import { Module } from '@nestjs/common';
import { ManagedController } from './managed.controller';
import { ManagedService } from './managed.service';
@Module({ controllers: [ManagedController], providers: [ManagedService] })
export class ManagedModule {}
