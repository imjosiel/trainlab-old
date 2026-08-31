import { Module } from '@nestjs/common';
import { AdminPartnersController } from './admin-partners.controller';
import { AdminPartnersService } from './admin-partners.service';
import { AdminPartnersActionsService } from './admin-partners-actions.service';
import { AdminReportsController } from './admin-reports.controller';
import { AdminReportsService } from './admin-reports.service';
import { AdminAffiliatesController } from './admin-affiliates.controller';
import { AdminAffiliatesService } from './admin-affiliates.service';
import { AdminAuditLogsController } from './admin-audit-logs.controller';
import { AdminAuditLogsService } from './admin-audit-logs.service';
import { AdminFinanceController } from './admin-finance.controller';
import { AdminFinanceService } from './admin-finance.service';
import { AdminSettingsController } from './admin-settings.controller';
import { AdminSettingsService } from './admin-settings.service';
import { AdminTiersController } from './admin-tiers.controller';
import { AdminTiersService } from './admin-tiers.service';
import { AdminUsersController } from './admin-users.controller';
import { AdminUsersService } from './admin-users.service';
@Module({ controllers: [AdminPartnersController, AdminReportsController, AdminSettingsController, AdminUsersController, AdminAffiliatesController, AdminAuditLogsController, AdminFinanceController, AdminTiersController], providers: [AdminPartnersService, AdminPartnersActionsService, AdminReportsService, AdminSettingsService, AdminUsersService, AdminAffiliatesService, AdminAuditLogsService, AdminFinanceService, AdminTiersService] })
export class AdminModule {}
