import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { Public } from '@/auth/public.decorator';
import { SportsService } from './sports.service';

@ApiTags('sports')
@Controller('sports')
export class SportsController {
  constructor(private readonly sports: SportsService) {}

  @Public()
  @Get()
  @ApiOperation({
    summary: 'Esportes ativos, com posições. Não exige autenticação.',
    description:
      'Quando a linha do banco tem `positions` vazio, a lista padrão da plataforma para aquele slug é usada no lugar.',
  })
  @ApiOkResponse({
    schema: {
      example: {
        sports: [
          {
            id: 'clx123',
            name: 'Futebol',
            slug: 'soccer',
            isActive: true,
            positions: ['Goleiro', 'Zagueiro', 'Atacante'],
          },
        ],
      },
    },
  })
  list() {
    return this.sports.listActive();
  }
}
