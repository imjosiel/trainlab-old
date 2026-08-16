import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBadRequestResponse, ApiBearerAuth, ApiForbiddenResponse, ApiOperation, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';

import { AdminOnly } from '@/auth/admin-only.decorator';
import { CurrentUser } from '@/auth/current-user.decorator';
import { SessionPayload } from '@/auth/session-payload';
import { AdminCreditsService, CreatePackageBody, UpdatePackageBody } from './admin-credits.service';
import { CreditsService } from './credits.service';

interface GrantBody {
  userId?: string;
  amount?: number;
  description?: string;
  bucket?: string;
}

const MAX_GRANT = 100_000;
const BUCKETS_VALIDOS = ['plan', 'purchased'];

@ApiTags('credits')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ schema: { example: { error: 'Não autorizado' } } })
@ApiForbiddenResponse({ schema: { example: { error: 'Acesso negado' } } })
@AdminOnly()
@Controller('admin/credits')
export class AdminCreditsController {
  constructor(
    private readonly credits: CreditsService,
    private readonly admin: AdminCreditsService,
  ) {}

  @Post('grant')
  @ApiOperation({ summary: 'Concede créditos manualmente (bucket plan ou purchased).' })
  @ApiBadRequestResponse({ schema: { example: { error: 'userId e amount (> 0) são obrigatórios.' } } })
  async conceder(@CurrentUser() user: SessionPayload, @Body() body: GrantBody) {
    const { userId, amount, description, bucket } = body;
    if (!userId || !amount || amount <= 0) {
      throw new BadRequestException({ error: 'userId e amount (> 0) são obrigatórios.' });
    }
    if (amount > MAX_GRANT) {
      throw new BadRequestException({
        error: `Limite por concessão: ${MAX_GRANT.toLocaleString('pt-BR')} créditos. Para valores maiores, faça múltiplas concessões.`,
      });
    }

    const resolvedBucket = (BUCKETS_VALIDOS.includes(bucket ?? '') ? bucket! : 'plan') as 'plan' | 'purchased';

    const result = await this.credits.conceder({
      userId,
      amount: Math.round(amount),
      grantedById: user.id,
      description: description ?? `Concessão manual pelo admin — bucket ${resolvedBucket}`,
      bucket: resolvedBucket,
    });

    return {
      success: true,
      bucket: resolvedBucket,
      newBalance: result.newBalance,
      planCredits: result.planCredits,
      purchasedCredits: result.purchasedCredits,
    };
  }

  @Get('packages')
  @ApiOperation({ summary: 'Todos os pacotes de crédito (ativos e inativos).' })
  listarPacotes() {
    return this.admin.listarPacotes();
  }

  @Post('packages')
  @ApiOperation({ summary: 'Cria pacote de crédito. stripePriceId é colado manualmente, não cria produto na Stripe.' })
  criarPacote(@Body() body: CreatePackageBody) {
    return this.admin.criarPacote(body);
  }

  @Patch('packages/:id')
  @ApiOperation({ summary: 'Edita campos do pacote (parcial).' })
  atualizarPacote(@Param('id') id: string, @Body() body: UpdatePackageBody) {
    return this.admin.atualizarPacote(id, body);
  }

  @Delete('packages/:id')
  @ApiOperation({ summary: 'Apaga o pacote.' })
  apagarPacote(@Param('id') id: string) {
    return this.admin.apagarPacote(id);
  }

  @Get('transactions')
  @ApiOperation({ summary: 'Últimas 50 transações de crédito, de todos os usuários.' })
  listarTransacoes() {
    return this.admin.listarTransacoes();
  }
}
