import { Module } from '@nestjs/common';
import { AdminPartnersController } from './admin-partners.controller';
import { AdminPartnersService } from './admin-partners.service';
import { AdminPartnersActionsService } from './admin-partners-actions.service';
@Module({ controllers: [AdminPartnersController], providers: [AdminPartnersService, AdminPartnersActionsService] })
export class AdminModule {}
