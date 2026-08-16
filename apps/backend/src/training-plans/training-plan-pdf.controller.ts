import { Controller, Get, Param, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiForbiddenResponse, ApiNotFoundResponse, ApiOperation, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import type { Response } from 'express';

import { CurrentUser } from '@/auth/current-user.decorator';
import { SessionPayload } from '@/auth/session-payload';
import { TrainingPlanPdfService } from './training-plan-pdf.service';

/**
 * D91 — primeira rota do backend com resposta binária. `@Res()` desliga a
 * serialização automática do Nest: o controller escreve os bytes direto,
 * como o legado fazia com `new Response(Buffer, {...})`.
 */
@ApiTags('training-plans')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ schema: { example: { error: 'Não autorizado' } } })
@Controller('training-plans')
export class TrainingPlanPdfController {
  constructor(private readonly pdf: TrainingPlanPdfService) {}

  @Get(':id/pdf')
  @ApiOperation({ summary: 'Gera o PDF do plano de treino.' })
  @ApiNotFoundResponse({ schema: { example: { error: 'Plano não encontrado' } } })
  @ApiForbiddenResponse({ schema: { example: { error: 'Sem permissão' } } })
  async gerar(@Param('id') id: string, @CurrentUser() user: SessionPayload, @Res() res: Response) {
    const { bytes, filename } = await this.pdf.gerar(id, user);
    res.status(200).set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': bytes.length.toString(),
    });
    res.send(bytes);
  }
}
