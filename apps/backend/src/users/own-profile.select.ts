/**
 * Allowlist de saída do perfil próprio (GET /users/profile).
 *
 * O legado pedia `partnerAccount: true`. `true` numa relação é allowlist de
 * RELAÇÃO, não de campo: devolvia os 25 campos de PartnerAccount, dos quais a UI
 * consome 4. Entre os 21 restantes iam a taxa de comissão negociada
 * (`customCommissionRate`), o estado de moderação (`payoutsFrozen`), alavancas
 * internas (`allowTestMode`) e o id do admin que aprovou (`approvedById` — id de
 * TERCEIRO numa rota de perfil).
 *
 * É o mesmo mecanismo do A9 uma rota depois, e a lição corrigida: o culpado não
 * é `include`, é qualquer forma de pedir relação sem enumerar campo.
 *
 * Ver A11/D26 em docs/implementation-plans/epic-nest-perfil-proprio.md.
 */

/**
 * O estado da candidatura — é para isso que os dois consumidores usam a relação.
 *
 * `commissionRate` fica fora de propósito: o parceiro tem direito de saber a
 * comissão dele, mas o lugar disso é o painel financeiro, que pode mostrar a
 * taxa efetiva (com override) no contexto certo. Aqui a única pergunta da tela é
 * "minha candidatura andou?".
 */
export const OWN_PARTNER_ACCOUNT_SELECT = {
  status: true,
  stripeAccountStatus: true,
  payoutsEnabled: true,
  chargesEnabled: true,
  rejectionReason: true,
  approvedAt: true,
  createdAt: true,
} as const;

/**
 * Campos de PartnerAccount que NUNCA podem sair por esta rota. Usado como
 * asserção negativa nos testes — guarda contra alguém acrescentar de propósito.
 *
 * Sozinha, essa lista não prova nada: com `true` na relação os campos vêm sem
 * serem nomeados, então "o select não menciona X" é trivialmente verdadeiro.
 * Quem reprova o `true` é a igualdade de chaves contra OWN_PARTNER_ACCOUNT_SELECT.
 */
export const NEVER_OWN_PARTNER = [
  'id',
  'userId',
  'motivation',
  'approvedById',
  'stripeAccountId',
  'partnerTier',
  'tierId',
  'commissionRate',
  'customCommissionRate',
  'payoutSchedule',
  'payoutsFrozen',
  'minimumPayoutAmount',
  'bonusThreshold',
  'bonusRateDrop',
  'allowTestMode',
  'affiliateAccountId',
  'updatedAt',
] as const;

export const OWN_PROFILE_SELECT = {
  id: true,
  name: true,
  email: true,
  image: true,
  phone: true,
  roles: true,
  username: true,
  bio: true,
  isPublic: true,
  socialLinks: true,
  systemRoles: true,
  partnerAccount: { select: OWN_PARTNER_ACCOUNT_SELECT },
  _count: { select: { followers: true, following: true } },
} as const;

/** O que o PATCH devolve — igual ao legado. */
export const PATCH_PROFILE_SELECT = {
  id: true,
  name: true,
  phone: true,
  username: true,
  bio: true,
  isPublic: true,
  roles: true,
} as const;
