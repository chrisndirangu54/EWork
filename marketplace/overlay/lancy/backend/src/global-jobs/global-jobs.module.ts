import { Module } from '@nestjs/common';
import { GlobalJobsController } from './global-jobs.controller';
import { GlobalJobsService } from './global-jobs.service';

@Module({
  controllers: [GlobalJobsController],
  providers: [GlobalJobsService],
})
export class GlobalJobsModule {}
