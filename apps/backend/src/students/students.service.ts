import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { PlanStatus } from '.prisma-backend/client';

import { ADMIN_SYSTEM_ROLES, ROLES } from '@/common/constants';
import { parsePage } from '@/common/pagination';
import { canAddAthlete } from '@/common/subscription-limits';
import { SessionPayload } from '@/auth/session-payload';
import { PrismaService } from '@/prisma/prisma.service';
import { EmailService } from '@/email/email.service';
import { NotificationsService } from '@/notifications/notifications.service';
import { CreateStudentBody } from './dtos';

export interface ListStudentsQuery {
  trainerId?: string;
  q?: string;
  search?: string;
  page?: string;
}

interface SportProfileInput {
  sportId: string;
  goals?: unknown;
  trainingDaysPerWeek?: unknown;
  trainingHoursPerDay?: unknown;
  trainingFocus?: string[];
  position?: unknown;
  technicalLevel?: string | null;
  yearsPlaying?: unknown;
  dominantFoot?: string | null;
  teams?: unknown[];
}

export interface UpdateStudentProfileBody {
  sports?: SportProfileInput[];
  dateOfBirth?: string;
  height?: unknown;
  weight?: unknown;
  injuryHistory?: unknown;
  currentInjuries?: unknown;
  hasHealthIssues?: boolean;
  healthIssuesDesc?: unknown;
  takesMedication?: boolean;
  medicationDesc?: unknown;
  acceptedTerms?: boolean;
  strengths?: unknown;
  weaknesses?: unknown;
}

const LIST_PAGE_SIZE = 50;
const PLANS_PAGE_SIZE = 30;
const PLANOS_ATIVOS: PlanStatus[] = [PlanStatus.APPROVED, PlanStatus.DELIVERED];

function ehAdmin(user: SessionPayload): boolean {
  return (
    user.isAdmin ||
    (user.systemRoles ?? []).some((r) => ADMIN_SYSTEM_ROLES.includes(r as (typeof ADMIN_SYSTEM_ROLES)[number]))
  );
}

@Injectable()
export class StudentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
    private readonly notifications: NotificationsService,
  ) {}

  async listar(user: SessionPayload, query: ListStudentsQuery) {
    const isAdmin = ehAdmin(user);

    let trainerId = user.id;
    if (query.trainerId && query.trainerId !== user.id) {
      if (!isAdmin) throw new ForbiddenException({ error: 'Acesso negado.' });
      trainerId = query.trainerId;
    }

    const search = (query.q ?? query.search ?? '').trim().slice(0, 100);
    const where = {
      trainerId,
      ...(search ? { name: { contains: search, mode: 'insensitive' as const } } : {}),
    };

    const page = parsePage(query.page ?? '1');
    const skip = (page - 1) * LIST_PAGE_SIZE;

    const [studentsRaw, total] = await Promise.all([
      this.prisma.student.findMany({
        where,
        include: {
          athleteProfiles: { include: { sport: { select: { id: true, name: true } } } },
          _count: { select: { trainingPlans: true } },
          user: { select: { email: true, image: true } },
        },
        take: LIST_PAGE_SIZE,
        skip,
        orderBy: { name: 'asc' },
      }),
      this.prisma.student.count({ where }),
    ]);

    const studentIds = studentsRaw.map((s) => s.id);
    const [countActive, countCompleted, countPending] =
      studentIds.length === 0
        ? [[], [], []]
        : await Promise.all([
            this.prisma.trainingPlan.groupBy({
              by: ['studentId'],
              where: { studentId: { in: studentIds }, status: { in: PLANOS_ATIVOS } },
              _count: { studentId: true },
            }),
            this.prisma.trainingPlan.groupBy({
              by: ['studentId'],
              where: { studentId: { in: studentIds }, status: 'COMPLETED' },
              _count: { studentId: true },
            }),
            this.prisma.trainingPlan.groupBy({
              by: ['studentId'],
              where: { studentId: { in: studentIds }, status: 'PENDING' },
              _count: { studentId: true },
            }),
          ]);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const toMap = (rows: any[]) => Object.fromEntries(rows.map((r) => [r.studentId, r._count.studentId]));
    const activeMap = toMap(countActive);
    const completedMap = toMap(countCompleted);
    const pendingMap = toMap(countPending);

    const students = studentsRaw.map((st) => ({
      id: st.id,
      name: st.name,
      email: st.email ?? st.user?.email ?? null,
      userId: st.userId ?? null,
      image: st.user?.image ?? null,
      profile: st.athleteProfiles[0] ?? null,
      profiles: st.athleteProfiles.map((p) => ({
        id: p.id,
        sportId: p.sportId,
        sportName: p.sport?.name ?? '',
        position: p.position ?? '',
        technicalLevel: p.technicalLevel,
        yearsPlaying: p.yearsPlaying,
      })),
      since: st.createdAt,
      planCounts: {
        total: st._count.trainingPlans,
        active: activeMap[st.id] ?? 0,
        completed: completedMap[st.id] ?? 0,
        pending: pendingMap[st.id] ?? 0,
      },
    }));

    return { students, total, page, pages: Math.ceil(total / LIST_PAGE_SIZE) };
  }

  async criar(user: SessionPayload, body: CreateStudentBody) {
    const isAdmin = ehAdmin(user);
    const isTrainer = (user.roles ?? []).includes(ROLES.PROFESSIONAL);
    if (!isTrainer && !isAdmin) {
      throw new ForbiddenException({ error: 'Apenas treinadores podem adicionar alunos.' });
    }

    const { name, email, sport, sportId, position } = body;
    if (!name) throw new BadRequestException({ error: 'Nome do aluno é obrigatório' });
    if (typeof name !== 'string' || name.trim().length === 0 || name.length > 100) {
      throw new BadRequestException({ error: 'Nome deve ter entre 1 e 100 caracteres.' });
    }

    // Plano SaaS vem da sessão (o callback jwt do NextAuth preenche
    // subscriptionPlan a cada 15 min — D4: sem query extra aqui).
    const userPlan = (user as { subscriptionPlan?: string | null }).subscriptionPlan ?? null;

    await this.verificarLimiteDeAlunos(user.id, isAdmin, userPlan);

    let userId: string | null = null;
    const normalizedEmail = email ? String(email).trim().toLowerCase() : null;
    if (normalizedEmail) {
      const userMatch = await this.prisma.user.findUnique({ where: { email: normalizedEmail } });
      if (userMatch) userId = userMatch.id;
    }

    let defaultSport: { id: string } | null = null;
    if (sportId) defaultSport = await this.prisma.sport.findUnique({ where: { id: String(sportId) } });
    if (!defaultSport && sport) defaultSport = await this.prisma.sport.findUnique({ where: { slug: String(sport) } });
    if (!defaultSport) {
      defaultSport = await this.prisma.sport.findFirst({ where: { isActive: true }, orderBy: { name: 'asc' } });
    }
    if (!defaultSport) {
      throw new InternalServerErrorException({ error: 'Erro: Nenhum esporte cadastrado no sistema.' });
    }

    const student = await this.prisma.student.create({
      data: {
        name: String(name),
        email: normalizedEmail,
        trainerId: user.id,
        userId,
        athleteProfiles: {
          create: { sportId: defaultSport.id, position: position ? String(position).substring(0, 50) : '' },
        },
      },
      include: { athleteProfiles: true, user: { select: { email: true, image: true, name: true } } },
    });

    if (normalizedEmail) {
      await this.enviarConviteDeCriacao(user, student.id, normalizedEmail, userId);
    }

    return {
      message: 'Aluno adicionado com sucesso',
      student: {
        id: student.id,
        name: student.name,
        email: student.email ?? student.user?.email ?? null,
        image: student.user?.image ?? null,
        profile: student.athleteProfiles[0] ?? null,
      },
    };
  }

  async buscar(id: string, user: SessionPayload, query: { page?: string }) {
    const isAdmin = ehAdmin(user);
    const studentRecord = await this.prisma.student.findUnique({
      where: { id },
      include: { athleteProfiles: { include: { teams: true, sport: true } }, user: { select: { email: true, image: true } } },
    });

    if (!studentRecord || (studentRecord.trainerId !== user.id && !isAdmin)) {
      throw new NotFoundException({ error: 'Aluno não encontrado ou sem permissão' });
    }

    const page = parsePage(query.page ?? '1');
    const skip = (page - 1) * PLANS_PAGE_SIZE;

    const [plans, total] = await Promise.all([
      this.prisma.trainingPlan.findMany({
        where: { studentId: id },
        take: PLANS_PAGE_SIZE,
        skip,
        include: {
          trainingSessions: {
            select: { id: true, completed: true, day: true, title: true, athleteFeedback: true },
            orderBy: { day: 'asc' },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.trainingPlan.count({ where: { studentId: id } }),
    ]);

    const enrichedPlans = plans.map((plan) => {
      const totalSessoes = plan.trainingSessions.length;
      const completed = plan.trainingSessions.filter((s) => s.completed).length;
      return {
        ...plan,
        progress: { total: totalSessoes, completed, percent: totalSessoes > 0 ? Math.round((completed / totalSessoes) * 100) : 0 },
      };
    });

    const student = {
      id: studentRecord.id,
      name: studentRecord.name,
      email: studentRecord.email ?? studentRecord.user?.email ?? null,
      userId: studentRecord.userId ?? null,
      image: studentRecord.user?.image ?? null,
      profiles: studentRecord.athleteProfiles ?? [],
      profile: studentRecord.athleteProfiles[0] ?? null,
      since: studentRecord.createdAt,
    };

    return { student, plans: enrichedPlans, total, page, pages: Math.ceil(total / PLANS_PAGE_SIZE) };
  }

  async remover(id: string, user: SessionPayload) {
    const isAdmin = ehAdmin(user);
    const studentRecord = await this.prisma.student.findUnique({ where: { id } });

    if (!studentRecord || (studentRecord.trainerId !== user.id && !isAdmin)) {
      throw new NotFoundException({ error: 'Aluno não encontrado' });
    }

    await this.prisma.student.delete({ where: { id } });
    return { message: 'Aluno removido da sua lista com sucesso' };
  }

  async atualizarPerfil(id: string, user: SessionPayload, body: UpdateStudentProfileBody) {
    const student = await this.prisma.student.findUnique({ where: { id } });
    if (!student || student.trainerId !== user.id) {
      throw new ForbiddenException({ error: 'Aluno não encontrado ou sem permissão' });
    }

    const { sports, dateOfBirth, height, weight, injuryHistory, currentInjuries, hasHealthIssues, healthIssuesDesc, takesMedication, medicationDesc, acceptedTerms, strengths, weaknesses } = body;

    if (!sports || !Array.isArray(sports) || sports.length === 0) {
      throw new BadRequestException({ error: 'Ao menos um esporte é obrigatório' });
    }
    if (sports.length > 5) throw new BadRequestException({ error: 'Limite de esportes por perfil excedido (Máx: 5)' });

    const existingProfiles = await this.prisma.athleteProfile.findMany({ where: { studentId: id }, include: { teams: true } });
    const providedSportIds = sports.map((s) => s.sportId);

    const profilesToDelete = existingProfiles.filter((p) => !providedSportIds.includes(p.sportId));
    if (profilesToDelete.length > 0) {
      await this.prisma.athleteProfile.deleteMany({ where: { id: { in: profilesToDelete.map((p) => p.id) } } });
    }

    const safeParseFloat = (v: unknown) => (typeof v === 'number' ? v : v && !isNaN(parseFloat(String(v))) ? parseFloat(String(v)) : null);
    const safeParseInt = (v: unknown) => (typeof v === 'number' ? Math.round(v) : v && !isNaN(parseInt(String(v), 10)) ? parseInt(String(v), 10) : null);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updatedProfiles: any[] = [];

    for (const sport of sports) {
      const profileData = {
        studentId: id,
        sportId: sport.sportId,
        dateOfBirth: dateOfBirth && !isNaN(new Date(dateOfBirth).getTime()) ? new Date(dateOfBirth) : null,
        height: (() => {
          const h = safeParseFloat(height);
          return h !== null ? Math.min(Math.max(h, 50), 300) : null;
        })(),
        weight: (() => {
          const w = safeParseFloat(weight);
          return w !== null ? Math.min(Math.max(w, 20), 500) : null;
        })(),
        injuryHistory: injuryHistory ? String(injuryHistory).substring(0, 2000) : null,
        currentInjuries: currentInjuries ? String(currentInjuries).substring(0, 1000) : null,
        hasHealthIssues: hasHealthIssues ?? false,
        healthIssuesDesc: healthIssuesDesc ? String(healthIssuesDesc).substring(0, 1000) : null,
        takesMedication: takesMedication ?? false,
        medicationDesc: medicationDesc ? String(medicationDesc).substring(0, 500) : null,
        acceptedTerms: acceptedTerms ?? false,
        strengths: strengths ? String(strengths).substring(0, 1000) : null,
        weaknesses: weaknesses ? String(weaknesses).substring(0, 1000) : null,
        goals: sport.goals ? String(sport.goals).substring(0, 1000) : null,
        trainingDaysPerWeek: safeParseInt(sport.trainingDaysPerWeek),
        trainingHoursPerDay: safeParseFloat(sport.trainingHoursPerDay),
        trainingFocus: sport.trainingFocus ?? [],
        position: sport.position ? String(sport.position).substring(0, 50) : null,
        technicalLevel: sport.technicalLevel ?? null,
        yearsPlaying: safeParseInt(sport.yearsPlaying),
        dominantFoot: sport.dominantFoot ?? null,
      };

      const safeTeams = Array.isArray(sport.teams) ? sport.teams.slice(0, 15) : [];
      const teamsOperation = {
        connectOrCreate: safeTeams.map((t) => ({
          where: { name: String(t).substring(0, 50) },
          create: { name: String(t).substring(0, 50) },
        })),
      };

      const existing = existingProfiles.find((p) => p.sportId === sport.sportId);
      if (existing) {
        const savedProfile = await this.prisma.athleteProfile.update({
          where: { id: existing.id },
          data: { ...profileData, teams: { set: [], ...teamsOperation } },
        });
        updatedProfiles.push(savedProfile);
      } else {
        const savedProfile = await this.prisma.athleteProfile.create({ data: { ...profileData, teams: teamsOperation } });
        updatedProfiles.push(savedProfile);
      }
    }

    return { message: 'Perfil do aluno atualizado com sucesso', profiles: updatedProfiles };
  }

  /**
   * Fatia 29 (D102) — delega para a fonte única `canAddAthlete`: admin →
   * partner → SaaS → free. O caminho exclusivo Partner/B2B (D83) bloqueava
   * treinador SaaS com assinatura ativa ("Apenas parceiros") — fail-closed
   * errado que empurrava para suporte. Mensagem sai do resultado, com o
   * mesmo texto do legado por caminho.
   */
  private async verificarLimiteDeAlunos(
    trainerId: string,
    isAdmin: boolean,
    userPlan: string | null = null,
  ): Promise<void> {
    const check = await canAddAthlete(this.prisma, trainerId, userPlan, isAdmin);
    if (!check.allowed) {
      throw new ForbiddenException({ error: check.message ?? 'Limite de alunos atingido.' });
    }
  }

  private async enviarConviteDeCriacao(
    trainer: SessionPayload,
    studentId: string,
    email: string,
    userId: string | null,
  ): Promise<void> {
    const { randomBytes } = await import('crypto');
    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await this.prisma.athleteInvite.upsert({
      where: { email_trainerId: { email, trainerId: trainer.id } },
      create: { email, trainerId: trainer.id, studentId, token, expiresAt },
      update: { token, expiresAt, studentId, accepted: false },
    });

    void this.email
      .enviarConviteDeAtleta({ athleteEmail: email, trainerName: trainer.name ?? 'Seu Treinador', inviteToken: token })
      .catch((err) => this.logErroDeEmail(err));

    if (userId) {
      void this.notifications
        .criar({
          userId,
          type: 'STUDENT_INVITE',
          title: `Convite de ${trainer.name ?? 'um treinador'}`,
          message: `${trainer.name ?? 'Um treinador'} te convidou para ser seu aluno na plataforma.`,
          link: null,
          metadata: { token, trainerId: trainer.id, trainerName: trainer.name },
        })
        .catch(() => {});
    }
  }

  private logErroDeEmail(err: unknown): void {
    // eslint-disable-next-line no-console
    console.error('Falha ao enviar e-mail de convite na criação do aluno', err);
  }
}
