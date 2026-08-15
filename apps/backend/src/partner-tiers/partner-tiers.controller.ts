import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Post,
  Put,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { AdminOnly } from '@/auth/admin-only.decorator';
import { CurrentUser } from '@/auth/current-user.decorator';
import { Public } from '@/auth/public.decorator';
import { SessionPayload } from '@/auth/session-payload';
import { ROLES } from '@/common/constants';
import { PartnerTiersService, TierBody } from './partner-tiers.service';

/** Tabela de preços da landing. Sem sessão — é página aberta. */
@ApiTags('partner-tiers')
@Controller('public/partner-tiers')
export class PublicPartnerTiersController {
  constructor(private readonly tiers: PartnerTiersService) {}

  @Public()
  @Get()
  @ApiOperation({
    summary: 'Tiers ativos para a página pública.',
    description:
      'Recorte explícito de campos (A71): `commissionRate` e `minPrice` saem porque são ' +
      'argumento de venda, mas campo novo no modelo não aparece aqui sozinho.',
  })
  listar() {
    return this.tiers.listarPublicos();
  }
}

/** O que o parceiro logado vê ao escolher tier. */
@ApiTags('partner-tiers')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ schema: { example: { error: 'Não autorizado' } } })
@Controller('partner/tiers')
export class PartnerTiersController {
  constructor(private readonly tiers: PartnerTiersService) {}

  @Get()
  @ApiOperation({ summary: 'Tiers ativos, para o profissional escolher.' })
  @ApiForbiddenResponse({ schema: { example: { error: 'Acesso restrito a profissionais.' } } })
  listar(@CurrentUser() user: SessionPayload) {
    // Papel decide legitimamente aqui: tier é atributo de quem atende. É o
    // mesmo critério do `ScheduleConfigController`, e o oposto do A57 — lá a
    // pergunta era "de quem é esta linha?".
    if (!user.roles?.includes(ROLES.PROFESSIONAL) && !user.isAdmin) {
      throw new ForbiddenException({ error: 'Acesso restrito a profissionais.' });
    }
    return this.tiers.listarAtivos();
  }
}

@ApiTags('partner-tiers')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ schema: { example: { error: 'Não autorizado' } } })
@ApiForbiddenResponse({ schema: { example: { error: 'Acesso negado' } } })
@AdminOnly()
@Controller('admin/partner-tiers')
export class AdminPartnerTiersController {
  constructor(private readonly tiers: PartnerTiersService) {}

  @Get()
  @ApiOperation({
    summary: 'Todos os tiers.',
    description:
      'NÃO semeia (D73). O legado criava o tier `starter` a partir desta leitura — carregar a ' +
      'tela de admin tinha efeito colateral.',
  })
  listar() {
    return this.tiers.listarTodos();
  }

  @Post()
  @ApiOperation({ summary: 'Cria tier.' })
  @ApiBadRequestResponse({
    description:
      'Campo numérico inválido. Os cinco passam pela mesma tabela de regras — no legado três ' +
      'tinham guarda e dois não, e os dois sem eram `price` e `minPrice` (A68).',
    schema: { example: { error: 'price inválido (número entre 0 e 9007199254740991)' } },
  })
  @ApiConflictResponse({ schema: { example: { error: "Já existe um tier com o slug 'pro'." } } })
  criar(@Body() body: TierBody) {
    return this.tiers.criar(body);
  }

  @Put(':id')
  @ApiOperation({
    summary: 'Atualiza tier.',
    description: 'Promover a padrão desmarca os outros na MESMA transação (D72).',
  })
  atualizar(@Param('id') id: string, @Body() body: TierBody) {
    return this.tiers.atualizar(id, body);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Apaga tier sem parceiros nem histórico.' })
  @ApiOkResponse({ schema: { example: { ok: true } } })
  remover(@Param('id') id: string) {
    return this.tiers.remover(id);
  }
}
