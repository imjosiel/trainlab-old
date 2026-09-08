import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
@Injectable()
export class AdminUsersSearchService {
  constructor(private readonly prisma: PrismaService) {}
  async buscar(email?: string) {
    if (!email?.trim()) throw new BadRequestException({ error: 'Parâmetro email é obrigatório.' });
    const user: any = await this.prisma.user.findUnique({ where: { email: email.trim() }, select: { id: true, name: true, email: true, credits: { select: { planCredits: true, purchasedCredits: true } } } });
    if (!user) throw new NotFoundException({ error: 'Usuário não encontrado.' });
    return { user };
  }
}
