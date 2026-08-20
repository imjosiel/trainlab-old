export type CommissionPolicy = 'base_only' | 'full';

export interface CommissionInput {
  /** Preço base da oferta em R$ (ex: 100.00) */
  basePrice: number;
  /** Taxa de serviço adicional em R$ (ex: 300.00 ou 0 se não houver) */
  hourlyRate: number;
  /** Comissão da plataforma como decimal (ex: 0.60 = 60%) */
  commissionRate: number;
  /**
   * 'base_only': comissão apenas sobre o preço base (padrão Starter).
   * 'full': comissão sobre base + hourlyRate.
   */
  policy: CommissionPolicy;
  /** Taxa percentual do Stripe como decimal (ex: 0.0399 = 3,99%). Default: 0.0399 */
  stripePercentFee?: number;
  /** Taxa fixa do Stripe em centavos (ex: 39 = R$0,39). Default: 39 */
  stripeFixedFeeInCents?: number;
}

export interface CommissionResult {
  /** Total que o aluno paga, em centavos */
  totalCents: number;
  /** Valor retido pela plataforma, em centavos (application_fee_amount no Stripe) */
  platformFeeCents: number;
  /** Valor líquido recebido pelo treinador, em centavos */
  trainerNetCents: number;
  /** Percentual efetivo cobrado pela plataforma sobre o total */
  effectiveRateOnTotal: number;
}

/**
 * Fonte única de verdade pro cálculo de comissão da plataforma — porte de
 * `apps/web/lib/commission.ts` (fatia 24, A89). Usada por qualquer checkout
 * que passa por um `PartnerOffer`, e por relatórios que precisam recalcular
 * a mesma divisão (métricas do parceiro, financeiro do admin).
 *
 * Quando `policy='base_only'` e `hourlyRate > 0`, a parcela da taxa do
 * Stripe atribuível à `hourlyRate` é somada ao `platformFeeCents` — a
 * `hourlyRate` é receita 100% do treinador, então ele absorve o custo do
 * Stripe sobre ela (correção #68 do legado).
 */
export function calcCommission(input: CommissionInput): CommissionResult {
  const {
    basePrice,
    hourlyRate,
    commissionRate,
    policy,
    stripePercentFee = 0.0399,
    stripeFixedFeeInCents = 39,
  } = input;

  const totalCents = Math.round((basePrice + hourlyRate) * 100);

  const commissionBase = policy === 'base_only' ? basePrice : basePrice + hourlyRate;

  let platformFeeCents = Math.round(commissionBase * commissionRate * 100);

  if (policy === 'base_only' && hourlyRate > 0 && totalCents > 0) {
    const totalStripeFee = totalCents * stripePercentFee + stripeFixedFeeInCents;
    const hourlyRateRatio = (hourlyRate * 100) / totalCents;
    const stripeFeeSurcharge = Math.round(totalStripeFee * hourlyRateRatio);
    platformFeeCents += stripeFeeSurcharge;
  }

  const trainerNetCents = totalCents - platformFeeCents;
  const effectiveRateOnTotal = totalCents > 0 ? Math.round((platformFeeCents / totalCents) * 10000) / 100 : 0;

  return { totalCents, platformFeeCents, trainerNetCents, effectiveRateOnTotal };
}

/** Ex: 0.4 → "40%" */
export function formatRate(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}
