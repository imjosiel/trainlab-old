import { Module } from '@nestjs/common';

import {
  AdminPartnerTiersController,
  PartnerTiersController,
  PublicPartnerTiersController,
} from './partner-tiers.controller';
import { PartnerTiersService } from './partner-tiers.service';
import {
  AdminPartnerTierController,
  TierRequestsController,
} from './tier-requests.controller';
import { TierRequestsService } from './tier-requests.service';

@Module({
  controllers: [
    PublicPartnerTiersController,
    PartnerTiersController,
    AdminPartnerTiersController,
    TierRequestsController,
    AdminPartnerTierController,
  ],
  providers: [PartnerTiersService, TierRequestsService],
})
export class PartnerTiersModule {}
