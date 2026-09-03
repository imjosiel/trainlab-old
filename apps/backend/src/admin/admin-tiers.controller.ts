import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AdminOnly } from '@/auth/admin-only.decorator';
import { SaaSTierBody } from '@/common/dtos-admin';
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
  @Throttle({ default: { limit: 10, ttl: 3_600_000 } })
  criar(@Body() body: SaaSTierBody) { return this.service.criar(body); }
}
