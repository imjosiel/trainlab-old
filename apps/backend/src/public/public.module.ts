import { Module } from '@nestjs/common';
import { PublicModulesController } from './public-modules.controller';
@Module({ controllers: [PublicModulesController] })
export class PublicModule {}
