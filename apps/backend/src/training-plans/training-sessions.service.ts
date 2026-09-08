import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';

import { SessionPayload } from '@/auth/session-payload';
import { PrismaService } from '@/prisma/prisma.service';
import { EmailService } from '@/email/email.service';
import { NotificationsService } from '@/notifications/notifications.service';
import { CreateSessionBody, EditSessionBody, UpdateSessionBody } from './dtos';

function ehDono(session: {
  plan: { athleteId: string | null; trainerId: string | null; student: { userId: string | null } | null };
}, user: SessionPayload): boolean {
  return (
    session.plan.athleteId === user.id ||
    session.plan.student?.userId === user.id ||
    session.plan.trainerId === user.id ||
    user.isAdmin
  );
}

/** Fatia 18 — porte de `training-plans/sessions/[id]/route.ts` + `[id]/sessions/route.ts`. */
@Injectable()
export class TrainingSessionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
    private readonly notifications: NotificationsService,
  ) {}

  async buscar(id: string, user: SessionPayload): Promise<unknown> {
    const trainingSession = await this.prisma.trainingSession.findUnique({
      where: { id },
      include: { plan: { select: { trainerId: true, athleteId: true, student: { select: { userId: true } } } } },
    });
    if (!trainingSession) throw new NotFoundException({ error: 'Sessao nao encontrada' });
    if (!ehDono(trainingSession, user)) throw new ForbiddenException({ error: 'Sem permissão' });

    return { session: trainingSession };
  }

  async atualizar(id: string, user: SessionPayload, body: UpdateSessionBody): Promise<{ session: unknown; planCompleted: boolean; message?: string }> {
    const trainingSession = await this.prisma.trainingSession.findUnique({
      where: { id },
      include: {
        plan: {
          include: {
            athlete: { select: { id: true, name: true, email: true } },
            student: { select: { id: true, name: true, userId: true } },
            trainer: { select: { id: true, name: true, email: true } },
            trainingSessions: { select: { id: true, completed: true } },
          },
        },
      },
    });
    if (!trainingSession) throw new NotFoundException({ error: 'Sessao nao encontrada' });

    const isOwnerAthlete = trainingSession.plan.athleteId === user.id;
    const isOwnerStudent = trainingSession.plan.student?.userId === user.id;
    const isTrainer = trainingSession.plan.trainerId === user.id;
    const isSystemAdmin = user.isAdmin;
    if (!isOwnerAthlete && !isOwnerStudent && !isTrainer && !isSystemAdmin) {
      throw new ForbiddenException({ error: 'Sem permissão' });
    }

    const { completed, athleteFeedback, athleteFeedbackRating, exercises } = body;

    if (trainingSession.completed && completed === false && !isTrainer && !isSystemAdmin) {
      throw new ConflictException({ error: 'Sessão já concluída não pode ser reaberta.' });
    }

    let safeExercises = trainingSession.exercises;
    if (exercises !== undefined) safeExercises = typeof exercises === 'string' ? exercises : JSON.stringify(exercises);

    const updated = await this.prisma.trainingSession.update({
      where: { id },
      data: {
        completed: completed !== undefined ? Boolean(completed) : trainingSession.completed,
        completedAt:
          completed === true && !trainingSession.completed
            ? new Date()
            : completed === false
              ? null
              : trainingSession.completedAt,
        athleteFeedback: athleteFeedback ? String(athleteFeedback).substring(0, 1000) : trainingSession.athleteFeedback,
        athleteFeedbackRating: (() => {
          if (athleteFeedbackRating === undefined) return trainingSession.athleteFeedbackRating;
          const parsed = parseInt(String(athleteFeedbackRating), 10);
          return !isNaN(parsed) && parsed >= 1 && parsed <= 5 ? parsed : trainingSession.athleteFeedbackRating;
        })(),
        exercises: safeExercises,
      },
    });

    if (completed === true) {
      const [completedCount, totalCount] = await Promise.all([
        this.prisma.trainingSession.count({ where: { planId: trainingSession.planId, completed: true } }),
        this.prisma.trainingSession.count({ where: { planId: trainingSession.planId } }),
      ]);
      if (totalCount > 0 && completedCount >= totalCount) {
        const result = await this.prisma.trainingPlan.updateMany({
          where: { id: trainingSession.planId, status: { not: 'COMPLETED' } },
          data: { status: 'COMPLETED' },
        });
        if (result.count > 0 && trainingSession.plan.trainer) {
          const targetName = trainingSession.plan.student?.name ?? trainingSession.plan.athlete?.name ?? 'Praticante';
          void this.email
            .enviarPlanoConcluido({
              trainerName: trainingSession.plan.trainer.name ?? '',
              trainerEmail: trainingSession.plan.trainer.email ?? '',
              athleteName: targetName,
              planTitle: trainingSession.plan.title,
            })
            .catch((err) => console.error('Email send failed (non-blocking):', err));
          if (trainingSession.plan.trainerId) {
            void this.notifications
              .criar({
                userId: trainingSession.plan.trainerId,
                type: 'PLAN_COMPLETED',
                title: `${targetName} concluiu um plano! 🏆`,
                message: `"${trainingSession.plan.title}" foi 100% concluído.`,
                link: `/dashboard/plans/${trainingSession.planId}`,
              })
              .catch(() => {});
          }
          return { session: updated, planCompleted: true, message: 'Parabéns! Você concluiu todas as sessões do plano! 🏆' };
        }
      }
    }

    const hasFeedback = typeof athleteFeedback === 'string' && athleteFeedback.trim().length > 0;
    const isAthleteAction = isOwnerAthlete || isOwnerStudent;
    if (hasFeedback && isAthleteAction && trainingSession.plan.trainerId) {
      const athleteName = trainingSession.plan.student?.name ?? trainingSession.plan.athlete?.name ?? 'Um atleta';
      void this.notifications
        .criar({
          userId: trainingSession.plan.trainerId,
          type: 'PLAN_FEEDBACK',
          title: `Feedback de ${athleteName}`,
          message: `${athleteName} enviou um feedback na sessão do plano "${trainingSession.plan.title}".`,
          link: `/dashboard/plans/${trainingSession.planId}`,
        })
        .catch(() => {});
    }

    return { session: updated, planCompleted: false };
  }

  async editar(id: string, user: SessionPayload, body: EditSessionBody): Promise<unknown> {
    const trainingSession = await this.prisma.trainingSession.findUnique({
      where: { id },
      include: { plan: { select: { trainerId: true } } },
    });
    if (!trainingSession) throw new NotFoundException({ error: 'Sessao nao encontrada' });

    if (trainingSession.plan.trainerId !== user.id && !user.isAdmin) {
      throw new ForbiddenException({ error: 'Sem permissão' });
    }

    const { title, day, duration, description, exercises } = body;

    let safeExercises = trainingSession.exercises;
    if (exercises !== undefined) safeExercises = typeof exercises === 'string' ? exercises : JSON.stringify(exercises);

    const updated = await this.prisma.trainingSession.update({
      where: { id },
      data: {
        title: title ? String(title).substring(0, 150) : trainingSession.title,
        day: day ? Math.min(Math.max(parseInt(String(day), 10), 1), 365) : trainingSession.day,
        duration: duration ? Math.min(Math.max(parseInt(String(duration), 10), 1), 480) : trainingSession.duration,
        description: description !== undefined ? String(description).substring(0, 2000) : trainingSession.description,
        exercises: safeExercises,
      },
    });
    return { session: updated, message: 'Sessão atualizada com sucesso' };
  }

  async remover(id: string, user: SessionPayload): Promise<unknown> {
    const trainingSession = await this.prisma.trainingSession.findUnique({
      where: { id },
      include: { plan: { select: { trainerId: true } } },
    });
    if (!trainingSession) throw new NotFoundException({ error: 'Sessao nao encontrada' });

    if (trainingSession.plan.trainerId !== user.id && !user.isAdmin) {
      throw new ForbiddenException({ error: 'Sem permissão' });
    }

    await this.prisma.trainingSession.delete({ where: { id } });
    return { message: 'Sessão removida com sucesso' };
  }

  async criar(planId: string, user: SessionPayload, body: CreateSessionBody): Promise<unknown> {
    const plan = await this.prisma.trainingPlan.findUnique({ where: { id: planId } });
    if (!plan) throw new NotFoundException({ error: 'Plano não encontrado' });

    if (plan.trainerId !== user.id && !user.isAdmin) {
      throw new ForbiddenException({ error: 'Sem permissão' });
    }

    const { title, description, exercises, day, duration } = body;

    if (!title || !day) throw new BadRequestException({ error: 'Título e dia são obrigatórios' });
    if (typeof title === 'string' && title.length > 200) {
      throw new BadRequestException({ error: 'title deve ter no máximo 200 caracteres.' });
    }
    if (description !== undefined && typeof description === 'string' && description.length > 2000) {
      throw new BadRequestException({ error: 'description deve ter no máximo 2000 caracteres.' });
    }

    const parsedDay = parseInt(String(day), 10);
    if (!Number.isFinite(parsedDay) || parsedDay <= 0) {
      throw new BadRequestException({
        error: 'O campo "dia" deve ser um número inteiro positivo (ex: 1, 2, 7).',
      });
    }
    const parsedDuration = duration ? parseInt(String(duration), 10) : null;
    if (parsedDuration !== null && (!Number.isFinite(parsedDuration) || parsedDuration <= 0)) {
      throw new BadRequestException({
        error: 'O campo "duração" deve ser um número inteiro positivo (em minutos).',
      });
    }

    const trainingSession = await this.prisma.trainingSession.create({
      data: {
        planId,
        title: String(title).trim(),
        description: description ? String(description).trim() : '',
        day: parsedDay,
        duration: parsedDuration ?? 0,
        intensity: 'media',
        exercises: exercises ? (typeof exercises === 'string' ? exercises : JSON.stringify(exercises)) : '[]',
        completed: false,
      },
    });
    return { session: trainingSession };
  }
}
