import { Module } from '@nestjs/common';

import { AdminSportsController } from './admin-sports.controller';
import { SportsController } from './sports.controller';
import { SportsService } from './sports.service';

@Module({
  controllers: [SportsController, AdminSportsController],
  providers: [SportsService],
  exports: [SportsService],
})
export class SportsModule {}
