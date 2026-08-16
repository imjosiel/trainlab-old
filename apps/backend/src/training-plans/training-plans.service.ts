import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';

import { ADMIN_SYSTEM_ROLES, PLAN_STATUS, ROLES } from '@/common/constants';
import { SessionPayload } from '@/auth/session-payload';
import { PrismaService } from '@/prisma/prisma.service';
import { EmailService } from '@/email/email.service';
import { NotificationsService } from '@/notifications/notifications.service';

export interface ListPlansQuery {
  studentId?: string;
  athleteId?: string;
  status?: string;
  q?: string;
  page?: string;
}

export interface UpdatePlanBody {
  status?: string;
  finalPlan?: string;
  trainerNotes?: string;
}

const PAGE_SIZE = 50;
const VALID_STATUSES: string[] = Object.values(PLAN_STATUS);
const ATHLETE_ALLOWED_STATUSES = [PLAN_STATUS.APPROVED, PLAN_STATUS.DELIVERED, PLAN_STATUS.COMPLETED];
const SUBS_ATIVAS = ['active', 'canceling', 'trialing', 'past_due'];

function ehAdmin(user: SessionPayload): boolean {
  return (
    user.isAdmin ||
    (user.systemRoles ?? []).some((r) => ADMIN_SYSTEM_ROLES.includes(r as (typeof ADMIN_SYSTEM_ROLES)[number]))
  );
}

function ehTrainer(user: SessionPayload): boolean {
  return (user.roles ?? []).includes(ROLES.PROFESSIONAL);
}

/** Fatia 18 — porte de `training-plans/route.ts` (GET/list) + `[id]/route.ts` + `active/route.ts`. Sem a geração por IA (POST) — fatia própria. */
@Injectable()
export class TrainingPlansService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
    private readonly notifications: NotificationsService,
  ) {}

  async listar(user: SessionPayload, query: ListPlansQuery): Promise<unknown> {
    const isAdmin = ehAdmin(user);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: Record<string, any> = {};

    if (isAdmin && !query.studentId && !query.athleteId && !ehTrainer(user)) {
      // Admin puro, sem filtro — vê todos os planos do sistema.
    } else if (isAdmin && (query.studentId || query.athleteId)) {
      if (query.studentId) where.studentId = query.studentId;
      else if (query.athleteId) where.athleteId = query.athleteId;
    } else if (ehTrainer(user)) {
      where.trainerId = user.id;
      if (query.studentId) where.studentId = query.studentId;
      else if (query.athleteId) where.athleteId = query.athleteId;
    } else {
      where.OR = [{ athleteId: user.id }, { student: { userId: user.id } }];
      where.status = { in: ATHLETE_ALLOWED_STATUSES };
    }

    if (query.status && VALID_STATUSES.includes(query.status)) {
      if (!isAdmin && !ehTrainer(user)) {
        if (ATHLETE_ALLOWED_STATUSES.includes(query.status as (typeof ATHLETE_ALLOWED_STATUSES)[number])) {
          where.status = query.status;
        }
      } else {
        where.status = query.status;
      }
    }

    const q = (query.q ?? '').trim().slice(0, 100);
    if (q) where.title = { contains: q, mode: 'insensitive' };

    const rawPage = parseInt(query.page ?? '1', 10);
    const page = Math.max(1, Number.isFinite(rawPage) ? rawPage : 1);
    const skip = (page - 1) * PAGE_SIZE;

    const [plans, total] = await Promise.all([
      this.prisma.trainingPlan.findMany({
        where,
        take: PAGE_SIZE,
        skip,
        select: {
          id: true,
          title: true,
          status: true,
          duration: true,
          createdAt: true,
          updatedAt: true,
          approvedAt: true,
          startDate: true,
          endDate: true,
          isManual: true,
          student: { select: { id: true, name: true } },
          athlete: { select: { id: true, name: true, email: true, image: true } },
          trainer: { select: { id: true, name: true, email: true } },
          trainingSessions: { select: { id: true, day: true, completed: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.trainingPlan.count({ where }),
    ]);

    return { plans, total, page, pages: Math.ceil(total / PAGE_SIZE) };
  }

  async buscar(id: string, user: SessionPayload): Promise<unknown> {
    const plan = await this.prisma.trainingPlan.findUnique({
      where: { id },
      include: {
        athlete: { select: { id: true, name: true, email: true, image: true } },
        student: { select: { id: true, name: true, userId: true, user: { select: { email: true, image: true } } } },
        trainer: { select: { id: true, name: true, email: true } },
        trainingSessions: { orderBy: { day: 'asc' } },
      },
    });
    if (!plan) throw new NotFoundException({ error: 'Plano não encontrado' });

    const isOwnerStudent = plan.student?.userId === user.id;
    const isOwnerAthlete = plan.athleteId === user.id;
    const isTrainer = plan.trainerId === user.id;
    const isSystemAdmin = ehAdmin(user) && !isOwnerStudent && !isOwnerAthlete;

    if (!isOwnerStudent && !isOwnerAthlete && !isTrainer && !isSystemAdmin) {
      throw new ForbiddenException({ error: 'Forbidden' });
    }

    if (isOwnerStudent || isOwnerAthlete) {
      const trainerPartnerAccount = plan.trainerId
        ? await this.prisma.partnerAccount.findFirst({ where: { userId: plan.trainerId }, select: { id: true } })
        : null;
      if (trainerPartnerAccount) {
        const hasSubscription = await this.prisma.partnerSubscription.findFirst({
          where: { userId: user.id, status: { in: SUBS_ATIVAS }, offer: { partnerId: trainerPartnerAccount.id } },
          select: { id: true },
        });
        if (!hasSubscription) {
          throw new ForbiddenException({
            error: 'Assinatura Pendente. Você precisa assinar um plano do seu treinador para acessar os treinos.',
            code: 'SUBSCRIPTION_REQUIRED',
          });
        }
      }
    }

    return { plan };
  }

  async atualizar(id: string, user: SessionPayload, body: UpdatePlanBody): Promise<unknown> {
    const { status, finalPlan, trainerNotes } = body;

    const plan = await this.prisma.trainingPlan.findUnique({
      where: { id },
      include: { student: { include: { user: true } }, athlete: true, trainer: true },
    });
    if (!plan) throw new NotFoundException({ error: 'Plano não encontrado' });

    const isSystemAdmin = ehAdmin(user);
    if (plan.trainerId !== user.id && !isSystemAdmin) {
      throw new ForbiddenException({ error: 'Apenas o treinador ou administradores podem aprovar/rejeitar planos' });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updateData: Record<string, any> = {};

    if (status) {
      if (!VALID_STATUSES.includes(status)) throw new BadRequestException({ error: 'Status inválido.' });
      updateData.status = status;
      if (status === PLAN_STATUS.APPROVED) updateData.approvedAt = new Date();
    }
    if (finalPlan !== undefined) {
      if (typeof finalPlan === 'string' && finalPlan.length > 50_000) {
        throw new BadRequestException({ error: 'finalPlan excede o limite de 50.000 caracteres.' });
      }
      updateData.finalPlan = finalPlan;
    }
    if (trainerNotes !== undefined) {
      if (typeof trainerNotes === 'string' && trainerNotes.length > 5000) {
        throw new BadRequestException({ error: 'trainerNotes excede o limite de 5.000 caracteres.' });
      }
      updateData.trainerNotes = trainerNotes;
    }

    const updatedPlan = await this.prisma.trainingPlan.update({
      where: { id },
      data: updateData,
      include: {
        athlete: { select: { id: true, name: true, email: true, image: true } },
        student: { select: { id: true, name: true, userId: true, user: { select: { id: true, email: true } } } },
        trainer: { select: { id: true, name: true, email: true } },
      },
    });

    if (status === PLAN_STATUS.APPROVED && updatedPlan.trainer) {
      const targetEmail = updatedPlan.student?.user?.email ?? updatedPlan.athlete?.email;
      const targetName = updatedPlan.student?.name ?? updatedPlan.athlete?.name;
      if (targetEmail) {
        void this.email
          .enviarPlanoAprovado({
            athleteName: targetName ?? '',
            athleteEmail: targetEmail,
            trainerName: updatedPlan.trainer.name ?? '',
            planTitle: updatedPlan.title,
          })
          .catch((err) => console.error('Email send failed (non-blocking):', err));
      }
    }

    const recipientId = updatedPlan.athlete?.id ?? updatedPlan.student?.user?.id ?? updatedPlan.student?.userId;
    if (status && recipientId) {
      const notifMap: Record<string, { type: string; title: string; message: string; link: string }> = {
        [PLAN_STATUS.APPROVED]: {
          type: 'PLAN_APPROVED',
          title: 'Plano aprovado! ✅',
          message: `Seu plano "${updatedPlan.title}" foi aprovado por ${updatedPlan.trainer?.name ?? 'seu treinador'}.`,
          link: `/dashboard/plans/${updatedPlan.id}`,
        },
        [PLAN_STATUS.REJECTED]: {
          type: 'PLAN_REJECTED',
          title: 'Plano rejeitado',
          message: `Seu plano "${updatedPlan.title}" foi rejeitado. Um novo plano será criado em breve.`,
          link: '/dashboard/plans',
        },
        [PLAN_STATUS.DELIVERED]: {
          type: 'PLAN_DELIVERED',
          title: 'Plano entregue! 📋',
          message: `Seu plano "${updatedPlan.title}" foi entregue por ${updatedPlan.trainer?.name ?? 'seu treinador'}.`,
          link: `/dashboard/plans/${updatedPlan.id}`,
        },
      };
      const notif = notifMap[status];
      if (notif) {
        void this.notifications.criar({ userId: recipientId, ...notif }).catch(() => {});
      }
    }

    return { message: 'Plano atualizado com sucesso', plan: updatedPlan };
  }

  async remover(id: string, user: SessionPayload): Promise<unknown> {
    const plan = await this.prisma.trainingPlan.findUnique({ where: { id } });
    if (!plan) throw new NotFoundException({ error: 'Plano não encontrado' });

    const isSystemAdmin = ehAdmin(user);
    if (plan.trainerId !== user.id && !isSystemAdmin) {
      throw new ForbiddenException({ error: 'Apenas o treinador ou administradores podem deletar planos' });
    }

    await this.prisma.trainingPlan.delete({ where: { id } });
    return { message: 'Plano deletado com sucesso' };
  }

  async listarAtivos(user: SessionPayload): Promise<unknown> {
    const activeSubs = await this.prisma.partnerSubscription.findMany({
      where: { userId: user.id, status: { in: SUBS_ATIVAS } },
      take: 100,
      include: { offer: { include: { partner: { include: { user: { select: { id: true } } } } } } },
    });
    const activeTrainerIds = activeSubs
      .map((s) => s.offer?.partner?.user?.id)
      .filter((id): id is string => !!id);

    if (user.email && activeTrainerIds.length > 0) {
      await this.prisma.student
        .updateMany({
          where: { email: user.email, userId: null, trainerId: { in: activeTrainerIds } },
          data: { userId: user.id },
        })
        .catch(() => {});
    }

    let extraStudentIds: string[] = [];
    if (activeTrainerIds.length > 0) {
      const linkedStudents = await this.prisma.student.findMany({
        where: {
          trainerId: { in: activeTrainerIds },
          OR: [{ userId: user.id }, ...(user.email ? [{ email: user.email }] : [])],
        },
        select: { id: true },
      });
      extraStudentIds = linkedStudents.map((s) => s.id);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const orConditions: any[] = [{ athleteId: user.id }, { student: { userId: user.id } }];
    if (extraStudentIds.length > 0) orConditions.push({ studentId: { in: extraStudentIds } });

    const plans = await this.prisma.trainingPlan.findMany({
      where: { OR: orConditions, status: { in: ['APPROVED', 'DELIVERED', 'COMPLETED'] } },
      take: 100,
      orderBy: { approvedAt: 'desc' },
      include: {
        trainer: { select: { id: true, name: true, email: true, image: true } },
        trainingSessions: {
          orderBy: { day: 'asc' },
          select: {
            id: true,
            day: true,
            title: true,
            description: true,
            duration: true,
            completed: true,
            completedAt: true,
            athleteFeedback: true,
            exercises: true,
          },
        },
      },
    });

    if (!plans.length) return { plans: [] };

    const mappedPlans = plans.map((plan) => {
      const totalSessions = plan.trainingSessions.length;
      const completedCount = plan.trainingSessions.filter((s) => s.completed).length;
      return {
        ...plan,
        progress: {
          total: totalSessions,
          completed: completedCount,
          percent: totalSessions > 0 ? Math.round((completedCount / totalSessions) * 100) : 0,
        },
      };
    });

    const subscribedTrainerIds = activeSubs.filter((sub) => sub.offer?.partner).map((sub) => sub.offer.partner!.userId);
    const planTrainerIds = [...new Set(plans.map((p) => p.trainerId).filter((tid): tid is string => !!tid))];
    const partnerAccounts =
      planTrainerIds.length > 0
        ? await this.prisma.partnerAccount.findMany({ where: { userId: { in: planTrainerIds } }, select: { userId: true } })
        : [];
    const allPartnerUserIds = new Set(partnerAccounts.map((p) => p.userId));
    const subscribedSet = new Set(subscribedTrainerIds);

    const filteredPlans = mappedPlans.filter((plan) => {
      const trainerIsPartner = plan.trainerId !== null && allPartnerUserIds.has(plan.trainerId);
      const hasActiveSub = plan.trainerId !== null && subscribedSet.has(plan.trainerId);
      return !(trainerIsPartner && !hasActiveSub);
    });

    const settings = await this.prisma.systemSettings.findFirst();

    return {
      plans: filteredPlans,
      settings: {
        enableVideoHoverPreview: settings?.enableVideoHoverPreview ?? true,
        videoHoverType: settings?.videoHoverType ?? 'TEASER',
      },
    };
  }
}
