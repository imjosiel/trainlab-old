import { Body, Controller, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiBadRequestResponse, ApiOperation, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';

import { CurrentUser } from '@/auth/current-user.decorator';
import { SessionPayload } from '@/auth/session-payload';
import { StudentInvitesService } from './student-invites.service';

@ApiTags('students')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ schema: { example: { error: 'Não autorizado' } } })
@Controller('students')
export class StudentInvitesController {
  constructor(private readonly invites: StudentInvitesService) {}

  @Post('invite')
  @ApiOperation({ summary: 'Convida um atleta registrado (TrainerAthlete) — sem criar Student virtual.' })
  convidarAtleta(@CurrentUser() user: SessionPayload, @Body('email') email: unknown) {
    return this.invites.convidarAtleta(user, email);
  }

  @Post('invite/accept')
  @ApiOperation({ summary: 'Aceita convite: vincula userId, faz merge de AthleteProfile.' })
  @ApiBadRequestResponse({ schema: { example: { error: 'Este convite expirou' } } })
  aceitarConvite(@CurrentUser() user: SessionPayload, @Body('token') token: unknown) {
    return this.invites.aceitarConvite(user, token);
  }

  @Post(':id/invite')
  @ApiOperation({ summary: 'Vincula um e-mail a um Student virtual já existente.' })
  convidarParaAluno(@Param('id') id: string, @CurrentUser() user: SessionPayload, @Body('email') email: unknown) {
    return this.invites.convidarParaAluno(id, user, email);
  }
}
