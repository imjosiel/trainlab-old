import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { AdminOnly } from '@/auth/admin-only.decorator';
import { CreateSportInput, SportsService, UpdateSportInput } from './sports.service';

/**
 * `@AdminOnly()` na classe: vale para todos os handlers, então um método novo
 * aqui nasce restrito. Mesmo princípio do guard global — a proteção é o default,
 * não algo a lembrar de acrescentar.
 */
@ApiTags('admin/sports')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Sem sessão.', schema: { example: { error: 'Não autorizado' } } })
@ApiForbiddenResponse({
  description: 'Sessão sem papel administrativo.',
  schema: { example: { error: 'Acesso negado' } },
})
@AdminOnly()
@Controller('admin/sports')
export class AdminSportsController {
  constructor(private readonly sports: SportsService) {}

  @Get()
  @ApiOperation({ summary: 'Todos os esportes, ativos ou não, com contagem de perfis.' })
  list() {
    return this.sports.listAll();
  }

  /**
   * Duas operações no mesmo verbo: criar, ou reimportar os padrões via
   * `{ action: 'syncDefaults' }`. Portado assim porque é como o frontend legado
   * chama (D13); candidato a virar rota própria no cutover.
   */
  @Post()
  @ApiOperation({
    summary: 'Cria um esporte, ou sincroniza os padrões com `{ action: "syncDefaults" }`.',
  })
  create(@Body() body: CreateSportInput & { action?: string }) {
    if (body?.action === 'syncDefaults') return this.sports.syncDefaults();
    return this.sports.create(body ?? {});
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Atualiza nome, slug, isActive ou posições.' })
  update(@Param('id') id: string, @Body() body: UpdateSportInput) {
    return this.sports.update(id, body ?? {});
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Exclui permanentemente, se nenhum atleta estiver vinculado.' })
  remove(@Param('id') id: string) {
    return this.sports.remove(id);
  }
}
