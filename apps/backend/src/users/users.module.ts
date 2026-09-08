import { Module } from '@nestjs/common';

import { PlanStatusController } from './plan-status.controller';
import { PlanStatusService } from './plan-status.service';
import { ProfileController } from './profile.controller';
import { ProfileService } from './profile.service';
import { ProfileStatsService } from './profile-stats.service';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  controllers: [UsersController, ProfileController, PlanStatusController],
  providers: [UsersService, ProfileService, PlanStatusService, ProfileStatsService],
  exports: [UsersService],
})
export class UsersModule {}
