import { Module } from '@nestjs/common';
import { AdminPartnersController } from './admin-partners.controller';
import { AdminPartnersService } from './admin-partners.service';
@Module({ controllers: [AdminPartnersController], providers: [AdminPartnersService] })
export class AdminModule {}
