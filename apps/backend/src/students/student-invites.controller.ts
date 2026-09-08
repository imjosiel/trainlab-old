import { Body, Controller, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiBadRequestResponse, ApiOperation, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';

import { CurrentUser } from '@/auth/current-user.decorator';
import { SessionPayload } from '@/auth/session-payload';
import { InviteEmailBody, InviteTokenBody } from './dtos';
import { StudentInvitesService } from './student-invites.service';

@ApiTags('students')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ schema: { example: { error: 'Não autorizado' } } })
@Controller('students')
export class StudentInvitesController {
  constructor(private readonly invites: StudentInvitesService) {}

  @Post('invite')
  @ApiOperation({ summary: 'Convida um atleta registrado (TrainerAthlete) — sem criar Student virtual.' })
  @Throttle({ default: { limit: 100, ttl: 3_600_000 } })
  convidarAtleta(@CurrentUser() user: SessionPayload, @Body() body: InviteEmailBody) {
    return this.invites.convidarAtleta(user, body.email);
  }

  @Post('invite/accept')
  @ApiOperation({ summary: 'Aceita convite: vincula userId, faz merge de AthleteProfile.' })
  @ApiBadRequestResponse({ schema: { example: { error: 'Este convite expirou' } } })
  aceitarConvite(@CurrentUser() user: SessionPayload, @Body() body: InviteTokenBody) {
    return this.invites.aceitarConvite(user, body.token);
  }

  @Post(':id/invite')
  @ApiOperation({ summary: 'Vincula um e-mail a um Student virtual já existente.' })
  convidarParaAluno(@Param('id') id: string, @CurrentUser() user: SessionPayload, @Body() body: InviteEmailBody) {
    return this.invites.convidarParaAluno(id, user, body.email);
  }
}
