import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '@/auth/current-user.decorator';
import { SessionPayload } from '@/auth/session-payload';
import { ProfileService } from './profile.service';
@ApiTags('profile')
@ApiBearerAuth()
@Controller('profile')
export class ProfileController {
  constructor(private readonly service: ProfileService) {}
  @Get()
  get(@CurrentUser() user: SessionPayload, @Query() query: any) { return this.service.get(user, query); }
  @Post()
  upsert(@CurrentUser() user: SessionPayload, @Body() body: any) { return this.service.upsert(user, body); }
}
