import { Injectable } from '@nestjs/common';

import { PrismaService } from '@/prisma/prisma.service';
import { calcularStreak } from './streak';

/**
 * Estatísticas de gamificação do perfil próprio.
 *
 * O legado fazia UMA query para as duas perguntas:
 *
 *   orderBy: { completedAt: 'desc' }, take: 500   // sem filtrar por completed
 *
 * Em Postgres, `ORDER BY … DESC` implica NULLS FIRST, e sessão não concluída tem
 * `completedAt = null`. Resultado medido: com 500 sessões nunca concluídas na
 * janela, as concluídas não entram na amostra — 7 dias consecutivos de treino
 * viravam `streak: 0` e `completionRate: 0`.
 *
 * Trocar para `nulls: 'last'` consertaria o streak e INVERTERIA o viés da taxa
 * (a amostra passaria a ser as 500 concluídas mais recentes, e a taxa tenderia a
 * 100%). O teto é o problema, não só a ordem. Então são duas perguntas, cada uma
 * com a query que ela pede.
 *
 * Ver A12/D28 em docs/implementation-plans/epic-nest-perfil-proprio.md.
 */
@Injectable()
export class ProfileStatsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Sessões que pertencem a este usuário: como atleta direto ou como aluno vinculado. */
  private escopo(userId: string) {
    const umAnoAtras = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
    return {
      OR: [{ plan: { athleteId: userId } }, { plan: { student: { userId } } }],
      createdAt: { gte: umAnoAtras },
    };
  }

  async compute(userId: string): Promise<{ completionRate: number; streak: number }> {
    const escopo = this.escopo(userId);
    const concluidas = { ...escopo, completed: true, completedAt: { not: null } };

    // Taxa: duas contagens sobre a janela INTEIRA, sem `take`. Número exato, sem
    // amostragem — e `count` resolve no índice em vez de trazer linha.
    const [total, feitas] = await Promise.all([
      this.prisma.trainingSession.count({ where: escopo }),
      this.prisma.trainingSession.count({ where: concluidas }),
    ]);
    const completionRate = total > 0 ? Math.round((feitas / total) * 100) : 0;

    // Streak: só as concluídas. Sem `null` na coluna ordenada, o NULLS FIRST
    // deixa de existir como questão.
    //
    // O `take` fica, e o limite dele é honesto: a 3 sessões/dia são ~166 dias de
    // sequência. Truncar aí só SUBESTIMA um streak já implausível, nunca inventa.
    const recentes = await this.prisma.trainingSession.findMany({
      where: concluidas,
      orderBy: { completedAt: 'desc' },
      take: 500,
      select: { completedAt: true },
    });

    return { completionRate, streak: calcularStreak(recentes.map((s) => s.completedAt)) };
  }
}
