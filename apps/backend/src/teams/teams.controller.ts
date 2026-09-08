import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '@/prisma/prisma.service';
@ApiTags('teams')
@ApiBearerAuth()
@Controller('teams')
export class TeamsController {
  constructor(private readonly prisma: PrismaService) {}
  @Get('search')
  async search(@Query('q') q?: string) {
    if (!q || q.length < 2) return { teams: [] };
    const teams = await this.prisma.team.findMany({ where: { name: { contains: q, mode: 'insensitive' } }, select: { id: true, name: true }, take: 10 });
    return { teams };
  }
}
