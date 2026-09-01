import { Module } from '@nestjs/common';
import { PartnerTierRequestController } from './partner-tier-request.controller';
import { PartnerTierRequestService } from './partner-tier-request.service';
@Module({ controllers: [PartnerTierRequestController], providers: [PartnerTierRequestService] })
export class PartnerTierRequestModule {}
