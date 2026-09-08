import { Controller, Get, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '@/auth/current-user.decorator';
import { SessionPayload } from '@/auth/session-payload';
import { Public } from '@/auth/public.decorator';
import { InvitesService } from './invites.service';
@ApiTags('invites')
@Controller('invite')
export class InvitesController {
  constructor(private readonly service: InvitesService) {}
  @Public()
  @Get(':token')
  get(@Param('token') token: string) { return this.service.get(token); }
  @Post(':token')
  aceitar(@Param('token') token: string, @CurrentUser() user: SessionPayload) { return this.service.aceitar(token, user); }
}
