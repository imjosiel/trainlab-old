import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from './current-user.decorator';
import { SessionPayload } from './session-payload';

/**
 * Torna a ponte de autenticação observável num sistema rodando.
 *
 * Sem ela, a afirmação central desta fatia — "uma requisição autenticada chega
 * ao Nest com a identidade íntegra" — só seria verificável em teste. Aqui a
 * resposta é o próprio payload que o guard montou, então um 200 com o `id`
 * correto prova a cadeia inteira de uma vez.
 */
@ApiTags('auth')
@ApiBearerAuth()
@Controller('me')
export class MeController {
  @Get()
  @ApiOperation({ summary: 'Sessão do portador do token, como o backend a enxerga.' })
  @ApiOkResponse({
    schema: {
      example: {
        id: 'clx1234567890',
        name: 'Josiel',
        email: 'josiel@example.com',
        image: null,
        roles: ['PROFESSIONAL'],
        systemRoles: ['USER'],
        isAdmin: false,
        subscriptionStatus: 'active',
        subscriptionPlan: 'premium',
        stripeCustomerId: 'cus_123',
      },
    },
  })
  me(@CurrentUser() user: SessionPayload): SessionPayload {
    return user;
  }
}
