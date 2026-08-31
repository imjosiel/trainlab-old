import { BadRequestException, ForbiddenException, GoneException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { SessionPayload } from '@/auth/session-payload';
@Injectable()
export class InvitesService {
  constructor(private readonly prisma: PrismaService) {}
  async get(token: string) {
    const invite: any = await this.prisma.athleteInvite.findUnique({ where: { token }, include: { trainer: { select: { name: true, email: true, image: true } } } });
    if (!invite) throw new NotFoundException({ error: 'Convite não encontrado' });
    if (!invite.trainer) throw new NotFoundException({ error: 'Treinador não existe mais' });
    if (invite.accepted) throw new GoneException({ error: 'Este convite já foi aceito' });
    if (new Date() > invite.expiresAt) throw new GoneException({ error: 'Este convite expirou' });
    return { invite: { email: invite.email, trainerName: invite.trainer.name, trainerImage: invite.trainer.image, expiresAt: invite.expiresAt } };
  }
  async aceitar(token: string, user: SessionPayload) {
    if (!user) throw new UnauthorizedException({ error: 'Unauthorized' });
    const invite: any = await this.prisma.athleteInvite.findUnique({ where: { token } });
    if (!invite) throw new NotFoundException({ error: 'Convite não encontrado' });
    if (invite.accepted) throw new GoneException({ error: 'Convite já aceito' });
    if (new Date() > invite.expiresAt) throw new GoneException({ error: 'Convite expirado' });
    if (invite.email && user.email?.toLowerCase() !== invite.email.toLowerCase()) throw new ForbiddenException({ error: 'Este convite foi enviado para outro e-mail.' });
    const lock: any = await this.prisma.$transaction(async (tx: any) => {
      const result = await tx.athleteInvite.updateMany({ where: { token, accepted: false }, data: { accepted: true, acceptedAt: new Date() } });
      if (result.count === 0) return { count: 0 };
      await tx.trainerAthlete.upsert({ where: { trainerId_athleteId: { trainerId: invite.trainerId, athleteId: user.id } }, create: { trainerId: invite.trainerId, athleteId: user.id, status: 'active' }, update: { status: 'active' } });
      if (invite.studentId) await tx.student.update({ where: { id: invite.studentId }, data: { userId: user.id } });
      const atual: any = await tx.user.findUnique({ where: { id: user.id }, select: { roles: true } });
      const novos = this.concederPapel(atual?.roles ?? [], 'CLIENT');
      if (novos) await tx.user.update({ where: { id: user.id }, data: { roles: novos } });
      return { count: result.count };
    });
    if (lock.count === 0) throw new GoneException({ error: 'Este convite já foi aceito' });
    return { message: 'Convite aceito com sucesso!' };
  }
  private concederPapel(atuais: string[], papel: string): string[] | null {
    const semPendente = atuais.filter((r) => r !== 'PENDING');
    if (semPendente.includes(papel)) return atuais.length === semPendente.length ? null : semPendente;
    return Array.from(new Set([...semPendente, papel]));
  }
}
