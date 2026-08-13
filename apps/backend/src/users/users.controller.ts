import { Body, Controller, Get, Param, Patch } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { CurrentUser } from '@/auth/current-user.decorator';
import { Public } from '@/auth/public.decorator';
import { SessionPayload } from '@/auth/session-payload';
import { UsersService } from './users.service';

@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Public()
  @Get('public/:username')
  @ApiOperation({
    summary: 'Perfil público por @username. Não exige autenticação.',
    description:
      'Expõe apenas identidade e dados esportivos. Anamnese, dados corporais e anotações de ' +
      'treino nunca saem por aqui — ver A9/D21 em docs/implementation-plans/epic-nest-perfil-publico.md.',
  })
  @ApiOkResponse({
    schema: {
      example: {
        user: {
          name: 'Josiel',
          username: 'josiel',
          image: null,
          bio: 'Atleta amador',
          roles: ['INDIVIDUAL'],
          createdAt: '2026-01-01T00:00:00.000Z',
          athleteProfiles: [
            {
              position: 'Atacante',
              technicalLevel: 'avancado',
              yearsPlaying: 10,
              sport: { name: 'Futebol', slug: 'soccer' },
              teams: [{ name: 'Time A' }],
            },
          ],
        },
      },
    },
  })
  @ApiNotFoundResponse({
    description:
      'Não existe, ou existe com perfil privado — deliberadamente indistinguíveis, para o ' +
      'endpoint não confirmar a existência de uma conta a partir do nome da pessoa.',
    schema: { example: { error: 'Usuário não encontrado.' } },
  })
  publicProfile(@Param('username') username: string) {
    return this.users.findPublicProfile(username);
  }

  @Get('my-trainers')
  @ApiBearerAuth()
  @ApiUnauthorizedResponse({ schema: { example: { error: 'Não autorizado' } } })
  @ApiOperation({
    summary: 'Treinadores B2B vinculados ao próprio aluno.',
    description:
      'Usado pelo seletor de contatos do chat. A busca é filtrada pelo usuário autenticado e ' +
      'deduplica múltiplas fichas do mesmo treinador.',
  })
  @ApiOkResponse({
    schema: {
      example: {
        trainers: [
          { id: 'clx123', name: 'Treinador', image: null, email: 'trainer@example.com' },
        ],
      },
    },
  })
  myTrainers(@CurrentUser() user: SessionPayload) {
    return this.users.findMyTrainers(user.id);
  }

  @Get('profile')
  @ApiBearerAuth()
  @ApiUnauthorizedResponse({ schema: { example: { error: 'Não autorizado' } } })
  @ApiOperation({
    summary: 'Perfil do próprio requisitante, com estatísticas de gamificação.',
    description:
      '`partnerAccount` vem recortado ao estado da candidatura: taxa de comissão negociada, ' +
      'estado de moderação e alavancas internas não saem por aqui (A11/D26). As estatísticas ' +
      'usam duas contagens em vez de amostra de 500 — ver A12/D28 para o defeito que isso corrige.',
  })
  @ApiOkResponse({
    schema: {
      example: {
        id: 'clx123',
        name: 'Josiel',
        email: 'josiel@example.com',
        image: null,
        phone: '(11) 98888-7777',
        roles: ['INDIVIDUAL'],
        username: 'josiel',
        bio: 'Atleta amador',
        isPublic: false,
        socialLinks: null,
        systemRoles: ['USER'],
        partnerAccount: null,
        stats: { followers: 0, following: 0, completionRate: 38, streak: 7 },
      },
    },
  })
  ownProfile(@CurrentUser() user: SessionPayload) {
    return this.users.findOwnProfile(user.id);
  }

  @Patch('profile')
  @ApiBearerAuth()
  @ApiUnauthorizedResponse({ schema: { example: { error: 'Não autorizado' } } })
  @ApiOperation({
    summary: 'Atualiza o próprio perfil. Aceita apenas username, bio, isPublic, name, role e phone.',
    description:
      'Allowlist de ENTRADA: campos fora dos seis aceitos são ignorados em silêncio, então ' +
      '`systemRoles` ou `id` no corpo não têm efeito. `role` só aceita papéis de produto ' +
      '(PENDING, PROFESSIONAL, INDIVIDUAL, CLIENT) e preserva os concedidos por admin; papel fora ' +
      'da lista responde 200 sem alterar nada, peculiaridade preservada de propósito (D30).',
  })
  @ApiBadRequestResponse({ schema: { example: { error: 'Telefone inválido. Informe DDD + número (10 ou 11 dígitos).' } } })
  @ApiConflictResponse({ schema: { example: { error: 'Este @username já está em uso por outra pessoa.' } } })
  updateOwnProfile(@CurrentUser() user: SessionPayload, @Body() body: Record<string, unknown>) {
    return this.users.updateOwnProfile(user, body);
  }
}
