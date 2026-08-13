/**
 * Porte de apps/web/lib/pagination.ts.
 *
 * O ponto destes helpers é que `parseInt('abc')` é NaN, e NaN chegando ao
 * Prisma como `take`/`skip` não dá erro claro — dá comportamento errado.
 */

/** Clampa entre min e max, com fallback quando o valor não é número. */
export function parseLimit(
  raw: string | null | undefined,
  defaultVal: number,
  max: number,
  min = 1,
): number {
  const n = parseInt(raw ?? String(defaultVal), 10);
  const safe = Number.isFinite(n) ? n : defaultVal;
  return Math.min(max, Math.max(min, safe));
}

/** Retorna o fallback se o valor for NaN ou menor que ele. */
export function parsePage(raw: string | null | undefined, fallback = 1): number {
  const n = parseInt(raw ?? String(fallback), 10);
  return Math.max(fallback, Number.isFinite(n) ? n : fallback);
}
