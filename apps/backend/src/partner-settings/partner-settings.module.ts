import { Module } from '@nestjs/common';
import { PartnerSettingsController } from './partner-settings.controller';
import { PartnerSettingsService } from './partner-settings.service';
@Module({ controllers: [PartnerSettingsController], providers: [PartnerSettingsService] })
export class PartnerSettingsModule {}
