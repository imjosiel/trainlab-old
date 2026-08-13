import { Module } from '@nestjs/common';

import { ProfileStatsService } from './profile-stats.service';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  controllers: [UsersController],
  providers: [UsersService, ProfileStatsService],
  exports: [UsersService],
})
export class UsersModule {}
