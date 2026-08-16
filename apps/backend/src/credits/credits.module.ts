import { Module } from '@nestjs/common';

import { AdminCreditsController } from './admin-credits.controller';
import { AdminCreditsService } from './admin-credits.service';
import { CreditsController } from './credits.controller';
import { CreditsService } from './credits.service';

@Module({
  controllers: [CreditsController, AdminCreditsController],
  providers: [CreditsService, AdminCreditsService],
  exports: [CreditsService],
})
export class CreditsModule {}
