import { Body, Controller, Delete, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AdminOnly } from '@/auth/admin-only.decorator';
import { AdminStripeConnectService } from './admin-stripe-connect.service';
@ApiTags('admin-stripe-connect')
@ApiBearerAuth()
@Controller('admin/stripe-connect')
export class AdminStripeConnectController {
  constructor(private readonly service: AdminStripeConnectService) {}
  @Get()
  @AdminOnly()
  listar() { return this.service.listar(); }
  @Delete()
  @AdminOnly()
  remover(@Body() body: any) { return this.service.remover(body.accountId); }
}
