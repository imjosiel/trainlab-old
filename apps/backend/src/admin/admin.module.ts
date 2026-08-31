import { Module } from '@nestjs/common';
import { AdminPartnersController } from './admin-partners.controller';
import { AdminPartnersService } from './admin-partners.service';
import { AdminPartnersActionsService } from './admin-partners-actions.service';
import { AdminReportsController } from './admin-reports.controller';
import { AdminReportsService } from './admin-reports.service';
@Module({ controllers: [AdminPartnersController, AdminReportsController], providers: [AdminPartnersService, AdminPartnersActionsService, AdminReportsService] })
export class AdminModule {}
