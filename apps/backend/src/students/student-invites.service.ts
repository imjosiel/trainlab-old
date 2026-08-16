import { randomBytes } from 'crypto';

import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';

import { ROLES } from '@/common/constants';
import { SessionPayload } from '@/auth/session-payload';
import { PrismaService } from '@/prisma/prisma.service';
import { EmailService } from '@/email/email.service';
import { NotificationsService } from '@/notifications/notifications.service';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CONVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const COOLDOWN_MS = 60_000;

@Injectable()
export class StudentInvitesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
    private readonly notifications: NotificationsService,
  ) {}

  /** POST /students/invite — convida um atleta REGISTRADO (TrainerAthlete), sem Student. */
  async convidarAtleta(user: SessionPayload, rawEmail: unknown) {
    const isTrainer = (user.roles ?? []).includes(ROLES.PROFESSIONAL);
    if (!isTrainer) throw new ForbiddenException({ error: 'Apenas treinadores podem enviar convites' });

    if (!rawEmail || typeof rawEmail !== 'string') throw new BadRequestException({ error: 'Email é obrigatório' });

    const email = rawEmail.trim().toLowerCase();
    if (!EMAIL_REGEX.test(email) || email.length > 254) {
      throw new BadRequestException({ error: 'Formato de email inválido' });
    }

    const existingUser = await this.prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      const existing = await this.prisma.trainerAthlete.findFirst({
        where: { trainerId: user.id, athleteId: existingUser.id },
      });
      if (existing) throw new ConflictException({ error: 'Este atleta já está vinculado à sua conta' });
    }

    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + CONVITE_TTL_MS);

    // Sem studentId de propósito (paridade com o legado): este fluxo é para
    // atleta registrado, não aluno virtual. Se já existir um invite com
    // studentId (do outro fluxo, students/:id/invite), o update NÃO o toca.
    await this.prisma.athleteInvite.upsert({
      where: { email_trainerId: { email, trainerId: user.id } },
      create: { email, trainerId: user.id, token, expiresAt },
      update: { token, expiresAt, accepted: false },
    });

    const trainer = await this.prisma.user.findUnique({ where: { id: user.id }, select: { name: true } });
    await this.email.enviarConviteDeAtleta({
      athleteEmail: email,
      trainerName: trainer?.name ?? 'Seu Treinador',
      inviteToken: token,
    });

    return { message: 'Convite enviado com sucesso!' };
  }

  /** POST /students/:id/invite — vincula um e-mail a um Student virtual já existente. */
  async convidarParaAluno(studentId: string, user: SessionPayload, rawEmail: unknown) {
    if (!(user.roles ?? []).includes(ROLES.PROFESSIONAL)) {
      throw new ForbiddenException({ error: 'Apenas treinadores podem enviar convites' });
    }

    if (!rawEmail || typeof rawEmail !== 'string') throw new BadRequestException({ error: 'Email é obrigatório' });
    const normalizedEmail = rawEmail.trim().toLowerCase();

    const student = await this.prisma.student.findUnique({ where: { id: studentId } });
    if (!student || student.trainerId !== user.id) {
      throw new NotFoundException({ error: 'Aluno não encontrado ou sem permissão' });
    }

    // D84 — cooldown via `updatedAt` direto, não mais via `expiresAt - 7 dias`
    // (o legado calculava assim porque seu client Prisma não tinha `updatedAt`
    // ainda quando essa rota foi escrita).
    const recentInvite = await this.prisma.athleteInvite.findUnique({
      where: { email_trainerId: { email: normalizedEmail, trainerId: user.id } },
    });
    if (recentInvite && Date.now() - recentInvite.updatedAt.getTime() < COOLDOWN_MS) {
      throw new BadRequestException({ error: 'Muitas tentativas. Aguarde 1 minuto para reenviar o convite.' });
    }

    const existingUser = await this.prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (student.userId) throw new BadRequestException({ error: 'Este aluno já possui uma conta vinculada.' });

    await this.prisma.student.update({ where: { id: studentId }, data: { email: normalizedEmail } });

    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + CONVITE_TTL_MS);
    await this.prisma.athleteInvite.upsert({
      where: { email_trainerId: { email: normalizedEmail, trainerId: user.id } },
      create: { studentId, email: normalizedEmail, trainerId: user.id, token, expiresAt },
      update: { studentId, token, expiresAt, accepted: false },
    });

    const trainer = await this.prisma.user.findUnique({ where: { id: user.id }, select: { name: true } });

    // D85 — notificação nunca derruba o convite: já foi gravado, e-mail já
    // vai sair. `.catch()` no call site, mesmo padrão do resto do backend.
    if (existingUser) {
      void this.notifications
        .criar({
          userId: existingUser.id,
          type: 'STUDENT_INVITE',
          title: 'Convite de Treinador',
          message: `${trainer?.name ?? 'Seu treinador'} convidou você para vincular seu perfil de aluno.`,
          metadata: { token, trainerName: trainer?.name, studentId, studentName: student.name },
        })
        .catch(() => {});
    }

    void this.email
      .enviarConviteDeAtleta({ athleteEmail: normalizedEmail, trainerName: trainer?.name ?? '', inviteToken: token })
      .catch((err) => this.logErroDeEmail(err));

    return { message: 'Convite enviado com sucesso!' };
  }

  /** POST /students/invite/accept — trava atômica: só a primeira aceitação vence. */
  async aceitarConvite(user: SessionPayload, token: unknown) {
    if (!token || typeof token !== 'string') throw new BadRequestException({ error: 'Token invalido' });

    const userId = user.id;
    const invite = await this.prisma.athleteInvite.findUnique({ where: { token } });
    if (!invite) throw new NotFoundException({ error: 'Convite não encontrado' });
    if (invite.expiresAt < new Date()) throw new BadRequestException({ error: 'Este convite expirou' });
    if (!invite.studentId) throw new BadRequestException({ error: 'Convite corrompido: Sem Aluno vinculado' });

    const student = await this.prisma.student.findUnique({
      where: { id: invite.studentId },
      include: { athleteProfiles: true },
    });
    if (!student) throw new NotFoundException({ error: 'Aluno original não encontrado' });

    const settings = await this.prisma.systemSettings.findFirst();
    if (settings && !settings.allowMultipleTrainersPerSport) {
      const newSports = student.athleteProfiles.map((p) => p.sportId);
      if (newSports.length > 0) {
        const existingStudents = await this.prisma.student.findMany({
          where: { userId },
          take: 50,
          include: { athleteProfiles: true },
        });
        const existingSports = new Set(existingStudents.flatMap((s) => s.athleteProfiles.map((p) => p.sportId)));
        const overlapSportId = newSports.find((s) => existingSports.has(s));
        if (overlapSportId) {
          const sportDetails = await this.prisma.sport.findUnique({ where: { id: overlapSportId } });
          throw new BadRequestException({
            error: `Você já possui um treinador ativo para a modalidade ${sportDetails?.name ?? 'solicitada'}.`,
          });
        }
      }
    }

    const lockInvite = await this.prisma.athleteInvite.updateMany({
      where: { id: invite.id, accepted: false },
      data: { accepted: true, acceptedAt: new Date() },
    });
    if (lockInvite.count === 0) throw new BadRequestException({ error: 'Este convite já foi processado e aceito' });

    await this.prisma.student.update({ where: { id: student.id }, data: { userId } });

    for (const profile of student.athleteProfiles) {
      if (!profile.userId) {
        try {
          await this.prisma.athleteProfile.update({ where: { id: profile.id }, data: { userId } });
        } catch {
          await this.prisma.athleteProfile.delete({ where: { id: profile.id } });
        }
      }
    }

    const notifications = await this.prisma.notification.findMany({
      where: { userId, type: 'STUDENT_INVITE', isRead: false },
      take: 30,
    });
    const targetNotif = notifications.find((n) => n.metadata && (n.metadata as Record<string, unknown>)['token'] === token);
    if (targetNotif) await this.prisma.notification.update({ where: { id: targetNotif.id }, data: { isRead: true } });

    return { message: 'Convite aceito com sucesso. Os dados da sua ficha foram sincronizados!' };
  }

  private logErroDeEmail(err: unknown): void {
    // eslint-disable-next-line no-console
    console.error('[students/invite] Falha ao enviar email de convite', err);
  }
}
