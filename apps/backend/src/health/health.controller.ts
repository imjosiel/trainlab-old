import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { Public } from '@/auth/public.decorator';

@ApiTags('health')
@Controller('health')
export class HealthController {
  @Public()
  @Get()
  @ApiOperation({ summary: 'Liveness do serviço. Não exige autenticação.' })
  @ApiOkResponse({ schema: { example: { status: 'ok' } } })
  check(): { status: string } {
    return { status: 'ok' };
  }
}
