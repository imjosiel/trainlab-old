import { Module } from '@nestjs/common';
import { PartnerTierRequestController } from './partner-tier-request.controller';
import { PartnerTierRequestService } from './partner-tier-request.service';
import { PartnerTierVerifyController } from './partner-tier-verify.controller';
import { PartnerTierVerifyService } from './partner-tier-verify.service';
@Module({ controllers: [PartnerTierRequestController, PartnerTierVerifyController], providers: [PartnerTierRequestService, PartnerTierVerifyService] })
export class PartnerTierRequestModule {}
