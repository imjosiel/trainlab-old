export interface StatusBrutoDaContaConectada {
  payoutsEnabled: boolean;
  chargesEnabled: boolean;
  disabledReason: string | null;
}

/**
 * Deriva o `stripeAccountStatus` (`active` | `restricted` | `pending`) a
 * partir do status bruto retornado pela Stripe. Usada por três lugares que
 * precisam concordar sempre: `PartnerConnectService.sincronizar()`,
 * `AffiliatesService.sincronizar()`, e `WebhookConnectService` (fatia 25,
 * `account.updated`). Extraída no terceiro uso — os dois primeiros já
 * comentavam a obrigação de mudar juntos, e uma terceira cópia manual era o
 * exato risco que o comentário avisava.
 *
 * `exigeChargesEnabled` é o único ponto onde parceiro e afiliado divergem:
 * parceiro cobra do aluno (precisa de `chargesEnabled` além de
 * `payoutsEnabled`), afiliado só recebe repasse (`payoutsEnabled` basta).
 */
export function derivarStatusDaContaConectada(
  status: StatusBrutoDaContaConectada,
  exigeChargesEnabled: boolean,
): string {
  const ativo = exigeChargesEnabled ? status.payoutsEnabled && status.chargesEnabled : status.payoutsEnabled;
  if (ativo) return 'active';
  if (status.disabledReason) return 'restricted';
  return 'pending';
}
