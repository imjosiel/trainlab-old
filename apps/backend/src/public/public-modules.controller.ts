import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '@/auth/public.decorator';
import { PrismaService } from '@/prisma/prisma.service';
@ApiTags('public')
@Controller('public')
export class PublicModulesController {
  constructor(private readonly prisma: PrismaService) {}
  @Public()
  @Get('modules')
  async get() {
    try {
      const settings: any = await this.prisma.systemSettings.findFirst({ select: { moduleAthleteEnabled: true, moduleCoachEnabled: true, modulePartnerB2BEnabled: true, moduleAffiliateEnabled: true } });
      return settings ?? { moduleAthleteEnabled: false, moduleCoachEnabled: false, modulePartnerB2BEnabled: true, moduleAffiliateEnabled: true };
    } catch {
      return { moduleAthleteEnabled: false, moduleCoachEnabled: false, modulePartnerB2BEnabled: true, moduleAffiliateEnabled: true };
    }
  }
}
