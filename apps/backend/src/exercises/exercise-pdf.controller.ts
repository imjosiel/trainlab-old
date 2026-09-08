import { Controller, Get, Param, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiForbiddenResponse, ApiNotFoundResponse, ApiOperation, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import type { Response } from 'express';

import { CurrentUser } from '@/auth/current-user.decorator';
import { SessionPayload } from '@/auth/session-payload';
import { ExercisePdfService } from './exercise-pdf.service';

@ApiTags('exercises')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ schema: { example: { error: 'Não autorizado' } } })
@Controller('exercises')
export class ExercisePdfController {
  constructor(private readonly pdf: ExercisePdfService) {}

  @Get(':id/pdf')
  @ApiOperation({ summary: 'Gera o cheat sheet em PDF do exercício.' })
  @ApiNotFoundResponse({ schema: { example: { error: 'Exercício não encontrado' } } })
  @ApiForbiddenResponse({ schema: { example: { error: 'Sem permissão para acessar este exercício.' } } })
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
