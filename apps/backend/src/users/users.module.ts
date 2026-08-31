import { Module } from '@nestjs/common';

import { ProfileController } from './profile.controller';
import { ProfileService } from './profile.service';
import { ProfileStatsService } from './profile-stats.service';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  controllers: [UsersController, ProfileController],
  providers: [UsersService, ProfileService, ProfileStatsService],
  exports: [UsersService],
})
export class UsersModule {}
