import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AdminOnly } from '@/auth/admin-only.decorator';
import { AdminAffiliatesReservedService } from './admin-affiliates-reserved.service';
@ApiTags('admin-affiliates-reserved')
@ApiBearerAuth()
@Controller('admin/affiliates/reserved-earnings')
export class AdminAffiliatesReservedController {
  constructor(private readonly service: AdminAffiliatesReservedService) {}
  @Get()
  @AdminOnly()
  listar() { return this.service.listar(); }
  @Post()
  @AdminOnly()
  resolver(@Body() body: any) { return this.service.resolver(body); }
}
