import { Module } from '@nestjs/common';
import { AdminPartnersController } from './admin-partners.controller';
import { AdminPartnersService } from './admin-partners.service';
import { AdminPartnersActionsService } from './admin-partners-actions.service';
import { AdminReportsController } from './admin-reports.controller';
import { AdminReportsService } from './admin-reports.service';
import { AdminSettingsController } from './admin-settings.controller';
import { AdminSettingsService } from './admin-settings.service';
@Module({ controllers: [AdminPartnersController, AdminReportsController, AdminSettingsController], providers: [AdminPartnersService, AdminPartnersActionsService, AdminReportsService, AdminSettingsService] })
export class AdminModule {}
