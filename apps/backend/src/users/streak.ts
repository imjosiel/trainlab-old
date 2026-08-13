/**
 * Cálculo de sequência de dias treinados.
 *
 * Função pura, separada do Prisma de propósito: a regra de "o que conta como
 * sequência" é a parte que tem casos de borda (mesmo dia repetido, lacuna,
 * treino velho), e ela merece teste sem banco. O que precisa de banco é a
 * ORDENAÇÃO, e isso é problema da query — ver A12/D28 em
 * docs/implementation-plans/epic-nest-perfil-proprio.md.
 */

/** Meia-noite local do dia de `date`, em milissegundos. */
function inicioDoDia(date: Date): number {
  const d = new Date(date);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

const UM_DIA = 86_400_000;

/**
 * Conta dias consecutivos com pelo menos um treino concluído, andando para trás
 * a partir do treino mais recente.
 *
 * Devolve 0 se o treino mais recente não foi hoje nem ontem — uma sequência que
 * já quebrou não é uma sequência. "Ontem" conta porque o dia de hoje ainda não
 * terminou; exigir hoje zeraria o streak de todo mundo até o treino da noite.
 *
 * `referencia` existe para o teste poder escolher que dia é "hoje" — sem isso,
 * virada de mês, de ano e 29 de fevereiro só seriam exercitados por acaso, no dia
 * em que a suíte rodasse.
 */
export function calcularStreak(
  completedAt: Array<Date | null>,
  referencia: Date = new Date(),
): number {
  const dias = Array.from(
    new Set(completedAt.filter((d): d is Date => d != null).map(inicioDoDia)),
  ).sort((a, b) => b - a);

  if (dias.length === 0) return 0;

  const hoje = inicioDoDia(referencia);
  if (dias[0] !== hoje && dias[0] !== hoje - UM_DIA) return 0;

  let streak = 1;
  let anterior = dias[0];
  for (let i = 1; i < dias.length; i++) {
    if (anterior - dias[i] !== UM_DIA) break;
    streak++;
    anterior = dias[i];
  }
  return streak;
}
