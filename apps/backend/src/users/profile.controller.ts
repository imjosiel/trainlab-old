import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '@/auth/current-user.decorator';
import { SessionPayload } from '@/auth/session-payload';
import { ProfileQuery, ProfileUpsertBody } from '@/common/dtos-admin';
import { ProfileService } from './profile.service';
@ApiTags('profile')
@ApiBearerAuth()
@Controller('profile')
export class ProfileController {
  constructor(private readonly service: ProfileService) {}
  @Get()
  get(@CurrentUser() user: SessionPayload, @Query() query: ProfileQuery) { return this.service.get(user, query); }
  @Post()
  upsert(@CurrentUser() user: SessionPayload, @Body() body: ProfileUpsertBody) { return this.service.upsert(user, body); }
}
