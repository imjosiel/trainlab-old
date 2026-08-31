import { Body, Controller, Delete, Param, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AdminOnly } from '@/auth/admin-only.decorator';
import { AdminTiersIdService } from './admin-tiers-id.service';
@ApiTags('admin-tiers-id')
@ApiBearerAuth()
@Controller('admin/tiers/:id')
export class AdminTiersIdController {
  constructor(private readonly service: AdminTiersIdService) {}
  @Put()
  @AdminOnly()
  atualizar(@Param('id') id: string, @Body() body: any) { return this.service.atualizar(id, body); }
  @Delete()
  @AdminOnly()
  remover(@Param('id') id: string) { return this.service.remover(id); }
}
