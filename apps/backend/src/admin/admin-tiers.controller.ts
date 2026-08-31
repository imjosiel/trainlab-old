import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AdminOnly } from '@/auth/admin-only.decorator';
import { AdminTiersService } from './admin-tiers.service';
@ApiTags('admin-tiers')
@ApiBearerAuth()
@Controller('admin/tiers')
export class AdminTiersController {
  constructor(private readonly service: AdminTiersService) {}
  @Get()
  listar() { return this.service.listar(); }
  @Post()
  @AdminOnly()
  criar(@Body() body: any) { return this.service.criar(body); }
}
