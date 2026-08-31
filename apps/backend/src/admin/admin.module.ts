import { Module } from '@nestjs/common';
import { AdminPartnersController } from './admin-partners.controller';
import { AdminPartnersService } from './admin-partners.service';
import { AdminPartnersActionsService } from './admin-partners-actions.service';
import { AdminReportsController } from './admin-reports.controller';
import { AdminReportsService } from './admin-reports.service';
import { AdminSettingsController } from './admin-settings.controller';
import { AdminSettingsService } from './admin-settings.service';
import { AdminAffiliatesController } from './admin-affiliates.controller';
import { AdminAffiliatesService } from './admin-affiliates.service';
import { AdminUsersController } from './admin-users.controller';
import { AdminUsersService } from './admin-users.service';
@Module({ controllers: [AdminPartnersController, AdminReportsController, AdminSettingsController, AdminUsersController, AdminAffiliatesController], providers: [AdminPartnersService, AdminPartnersActionsService, AdminReportsService, AdminSettingsService, AdminUsersService, AdminAffiliatesService] })
export class AdminModule {}
