/**
 * Porte 1:1 de `lib/plan-state-machine.ts` do legado (fatia 29, D100).
 *
 * Define as transições válidas entre status de plano de treino. Antes do
 * legado ter isso, qualquer status podia ir para qualquer outro (sem guard).
 */

export type PlanStatus =
  | 'PENDING'
  | 'APPROVED'
  | 'REJECTED'
  | 'DELIVERED'
  | 'COMPLETED'
  | 'ARCHIVED';

/**
 * Mapa de transições válidas.
 * Chave = status atual → Valor = status para os quais pode transicionar.
 */
export const PLAN_TRANSITIONS: Record<PlanStatus, PlanStatus[]> = {
  PENDING: ['APPROVED', 'REJECTED'],
  APPROVED: ['DELIVERED', 'REJECTED'],
  REJECTED: ['PENDING'], // treinador pode re-gerar o plano
  DELIVERED: ['COMPLETED'],
  COMPLETED: ['ARCHIVED'],
  ARCHIVED: [],
};

/**
 * Verifica se a transição de `from` para `to` é válida.
 * Lança um erro descritivo se a transição for inválida.
 */
export function assertValidTransition(from: PlanStatus, to: PlanStatus): void {
  const allowed = PLAN_TRANSITIONS[from];
  if (!allowed || !allowed.includes(to)) {
    throw new Error(
      `Transição inválida: ${from} → ${to}. Permitidas: [${(allowed ?? []).join(', ') || 'nenhuma'}]`,
    );
  }
}

/**
 * Verifica se a transição é válida sem lançar erro.
 * Útil para validações de formulário no frontend.
 */
export function isValidTransition(from: PlanStatus, to: PlanStatus): boolean {
  return (PLAN_TRANSITIONS[from] ?? []).includes(to);
}

/**
 * Retorna os status para os quais um plano pode ser movido a partir do status atual.
 */
export function getAllowedTransitions(from: PlanStatus): PlanStatus[] {
  return PLAN_TRANSITIONS[from] ?? [];
}
