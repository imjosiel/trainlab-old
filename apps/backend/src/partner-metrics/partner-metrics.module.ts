import { Module } from '@nestjs/common';
import { PartnerMetricsController } from './partner-metrics.controller';
import { PartnerMetricsService } from './partner-metrics.service';
@Module({ controllers: [PartnerMetricsController], providers: [PartnerMetricsService] })
export class PartnerMetricsModule {}
