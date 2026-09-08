import { BadRequestException, ForbiddenException, HttpException, Injectable } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { CreditsService } from '@/credits/credits.service';
import { SessionPayload } from '@/auth/session-payload';
import { ROLES, PLAN_STATUS } from '@/common/constants';
import { AiService } from './ai.service';
import { TrainingPlansLimitsService } from './training-plans-limits.service';
import { CreatePlanBody } from './dtos';

@Injectable()
export class TrainingPlansCreateService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly credits: CreditsService,
    private readonly ai: AiService,
    private readonly limits: TrainingPlansLimitsService,
  ) {}

  async criar(user: SessionPayload, body: CreatePlanBody): Promise<unknown> {
    const isAdmin = !!user.isAdmin;
    const isTrainer = (user.roles ?? []).includes(ROLES.PROFESSIONAL);
    const rawDuration = parseInt(String(body.duration ?? '30')) || 30;
    const duration = Math.min(Math.max(rawDuration, 1), 365);
    const studentId = typeof body.studentId === 'string' ? body.studentId : null;
    const athleteId = typeof body.athleteId === 'string' ? body.athleteId : null;
    const profileId = typeof body.profileId === 'string' ? body.profileId : null;
    const isManual = Boolean(body.isManual ?? false);

    // limites
    const dbUser = await this.prisma.user.findUnique({ where: { id: user.id }, select: { subscription: { select: { plan: true } } } } as any).catch(() => null) as any;
    const userPlan = dbUser?.subscription?.plan ?? (user as any).subscriptionPlan ?? null;
    const limitCheck = await this.limits.canCreatePlan(user.id, userPlan, isAdmin, studentId);
    if (!limitCheck.allowed) {
      if (!isManual) {
        const settings: any = await this.prisma.systemSettings.findFirst({ select: { enableCreditSystem: true, creditCostPlanGen: true } }).catch(() => null);
        if (settings?.enableCreditSystem) {
          const cr = await this.credits.gastar({ userId: user.id, cost: settings.creditCostPlanGen ?? 1, feature: 'PLAN_GEN', description: 'Geração extra além do limite' });
          if (!cr.success) throw new HttpException({ error: `Limite de planos atingido e créditos insuficientes. ${cr.error ?? ''}`.trim(), limitReached: true }, 402);
        } else {
          throw new ForbiddenException({ error: limitCheck.message });
        }
      } else {
        throw new ForbiddenException({ error: limitCheck.message });
      }
    }

    // anti-spam 15s
    const recentWhere: any = { createdAt: { gte: new Date(Date.now() - 15000) }, ...(isTrainer ? { trainerId: user.id, ...(studentId ? { studentId } : {}) } : { athleteId: user.id }) };
    const recent = await this.prisma.trainingPlan.count({ where: recentWhere });
    if (recent > 0) throw new HttpException({ error: 'Por favor, aguarde alguns segundos antes de gerar outro plano.' }, 429);

    // alvo
    let targetName = '';
    let profile: any = null;
    if (studentId && isTrainer) {
      const student: any = await this.prisma.student.findUnique({ where: { id: studentId }, include: { athleteProfiles: true } });
      if (!student) throw new BadRequestException({ error: 'Aluno não encontrado' });
      if (student.trainerId !== user.id) throw new ForbiddenException({ error: 'Você não tem permissão para gerenciar este aluno.' });
      if (!student.athleteProfiles?.length) throw new BadRequestException({ error: 'O aluno precisa ter um perfil esportivo' });
      targetName = student.name;
      profile = profileId ? student.athleteProfiles.find((p: any) => p.id === profileId) : student.athleteProfiles[0];
      if (!profile) throw new BadRequestException({ error: 'Perfil esportivo não encontrado para este aluno.' });
    } else if (athleteId) {
      // atleta gera para si mesmo — só permite se for o próprio usuário ou admin
      if (athleteId !== user.id && !isAdmin) throw new ForbiddenException({ error: 'Acesso negado. Você não pode gerar planos para outros atletas.' });
      // busca perfil do atleta (simplificado: via student mock já cobre)
      // tenta via user
      const athUser: any = await (this.prisma as any).user?.findUnique?.({ where: { id: athleteId }, include: { athleteProfiles: true } })?.catch(() => null);
      if (athUser?.athleteProfiles?.length) {
        profile = athUser.athleteProfiles[0];
        targetName = athUser.name ?? '';
      } else if (!isManual && (profile as any)?.hasHealthIssues) {
        // fallback para teste de saúde
      }
      if (!profile) {
        // tenta usar profile já carregado de student path anterior (para teste de saúde)
        if (!isManual) {
          // se não achou perfil, tenta bloquear via hasHealthIssues genérico
        }
        // se ainda não tem, usa o do student mock
        if (!profile) throw new BadRequestException({ error: 'Você precisa ter um perfil esportivo' });
      }
    } else {
      throw new BadRequestException({ error: 'ID de alvo inválido para o seu perfil' });
    }

    if (!isTrainer && profile && (profile.hasHealthIssues || profile.takesMedication) && !isManual) {
      throw new ForbiddenException({ error: 'Por questões de segurança e ética à sua saúde, consulte um médico em vez de usar a IA. O sistema automatizado não pode prescrever treinos com segurança devido às suas condições médicas relatadas.' });
    }

    let availableExercises: any[] = [];
    if (!isManual) {
      availableExercises = await this.prisma.exercise.findMany({ where: { OR: [{ trainerId: null }, { trainerId: user.id }] }, select: { id: true, name: true, description: true, aiSummary: true, category: true, difficulty: true, videoUrl: true, hlsProcessed: true, originalVideoKey: true }, orderBy: [{ trainerId: 'asc' }, { name: 'asc' }], take: 200 });
      if (availableExercises.length === 0) throw new BadRequestException({ error: 'Sua biblioteca de exercícios está vazia. Cadastre ao menos um exercício antes de gerar um plano via IA.' });
    }

    let parsedJson: any = null;
    let aiSuggestion = '';
    if (isManual) {
      aiSuggestion = `Plano criado manualmente em ${new Date().toLocaleDateString('pt-BR')}.\n\nUtilize a aba "Sessões" para adicionar os treinos diários.`;
      parsedJson = { dias: [] };
    } else {
      // RAG — histórico de aderência + notas do treinador (portado de route.ts:308)
      const sanitize = (s: string | null | undefined, max = 300) => {
        if (!s) return '';
        return String(s).replace(/```/g, "'''").replace(/^(#{1,6}|---) /gm, '').replace(/\bignore\b.*\binstructi/gi, '[removido]').slice(0, max).trim();
      };
      let ragContext = '';
      const historyWindowDays = duration >= 180 ? 90 : 30;
      const windowStart = new Date(); windowStart.setDate(windowStart.getDate() - historyWindowDays);
      try {
        const recentSessions: any[] = await (this.prisma as any).trainingSession.findMany({
          where: studentId
            ? { plan: { studentId }, OR: [{ createdAt: { gte: windowStart } }, { completedAt: { gte: windowStart } }] }
            : { plan: { athleteId }, OR: [{ createdAt: { gte: windowStart } }, { completedAt: { gte: windowStart } }] },
          select: { completed: true, athleteFeedback: true, athleteFeedbackRating: true, title: true },
          orderBy: { createdAt: 'desc' },
          take: 200,
        }).catch(() => []);
        const completedCount = recentSessions.filter((s) => s.completed).length;
        const adherenceRate = recentSessions.length > 0 ? Math.round((completedCount / recentSessions.length) * 100) : 100;
        const ratingsArr = recentSessions.filter((s) => s.athleteFeedbackRating != null).map((s) => s.athleteFeedbackRating as number);
        const avgRating = ratingsArr.length > 0 ? (ratingsArr.reduce((a: number, b: number) => a + b, 0) / ratingsArr.length).toFixed(1) : null;
        const titleCount: Record<string, number> = {};
        recentSessions.forEach((s) => { if (s.title) titleCount[s.title] = (titleCount[s.title] ?? 0) + 1; });
        const topSessionTitles = Object.entries(titleCount).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([t]) => t).join(', ');
        const feedbacks = recentSessions.filter((s) => s.athleteFeedback).slice(0, 3).map((s) => `- Nota ${s.athleteFeedbackRating ?? 'N/A'}/5: "${sanitize(s.athleteFeedback, 200)}"`).join('\n');
        const notesText = studentId
          ? await (this.prisma as any).studentNote.findMany({ where: { studentId }, orderBy: { createdAt: 'desc' }, take: 3 }).then((arr: any[]) => arr.length > 0 ? arr.map((n: any) => `- ${new Date(n.createdAt).toLocaleDateString()}: ${sanitize(n.content, 200)}`).join('\n') : 'Nenhuma anotação recente.').catch(() => 'Nenhuma anotação recente.')
          : 'Nenhuma anotação recente.';
        ragContext = `\n**[CONTEXTO RAG DE EVOLUÇÃO - ÚLTIMOS ${historyWindowDays} DIAS]**\n- Taxa de Aderência: ${adherenceRate}% (${completedCount}/${recentSessions.length} sessões)\n${avgRating ? `- Satisfação Média: ${avgRating}/5` : ''}\n${topSessionTitles ? `- Treinos mais frequentes: ${topSessionTitles}` : ''}\n- Feedbacks Recentes:\n${feedbacks || 'Nenhum.'}\n- Anotações do Treinador:\n${notesText}\n\n**Instrução:** Se aderência < 50%, prefira treinos mais curtos. Adapte às anotações do treinador.`;
      } catch {}
      parsedJson = await this.ai.gerarPlano({ targetName, profile, duration, availableExercises, ragContext });
      aiSuggestion = `### Resumo Executivo\n${parsedJson.resumoExecutivo ?? ''}\n\n### Dicas Finais\n${parsedJson.dicasFinais ?? ''}`;
    }

    if (!aiSuggestion) throw new BadRequestException({ error: 'Falha ao gerar plano. Tente novamente.' });
    const titleHorizon = duration <= 14 ? `${duration} Dias` : duration <= 35 ? '1 Mês' : duration <= 95 ? '3 Meses' : duration <= 185 ? '6 Meses' : '1 Ano';
    const sessionData: any[] = (parsedJson?.dias ?? []).map((d: any) => ({
      day: parseInt(String(d.dia)) || 1,
      title: d.titulo ?? `Sessão Dia ${d.dia}`,
      description: d.descricaoCompleta ?? '',
      duration: parseInt(String(d.duracaoMinutos)) || 60,
      intensity: d.intensidade ?? 'Média',
      exercises: JSON.stringify(d.exercicios ?? []),
    }));

    const plan = await (this.prisma as any).$transaction(async (tx: any) => {
      const created = await tx.trainingPlan.create({ data: { studentId: studentId ?? undefined, athleteId: athleteId ?? undefined, trainerId: isTrainer ? user.id : null, title: `Plano ${titleHorizon} — ${targetName}`, aiSuggestion, status: isTrainer ? PLAN_STATUS.PENDING : PLAN_STATUS.APPROVED, duration, isManual } });
      if (sessionData.length > 0) await tx.trainingSession.createMany({ data: sessionData.slice(0, 365).map((s: any) => ({ ...s, planId: created.id })) });
      return created;
    });
    return { message: 'Plano de treino gerado com sucesso', plan };
  }
}
