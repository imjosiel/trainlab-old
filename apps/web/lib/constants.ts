/**
 * Constantes centralizadas do TrainLab (web).
 *
 * Vocabulário genérico de papéis (fatia 11 — rename TRAINER→PROFESSIONAL,
 * ATHLETE→INDIVIDUAL, STUDENT→CLIENT): os valores são contrato do banco e
 * precisam estar em paridade com `apps/backend/src/common/constants.ts` e
 * `@trainlab/papeis`. Mudar aqui sem mudar lá quebra a leitura de
 * `roles`/`systemRoles` gravados pelo NextAuth.
 */

// ── Roles de usuário (campo `roles` no User) ────────────────────────────────
export const ROLES = {
  PROFESSIONAL: 'PROFESSIONAL',
  INDIVIDUAL: 'INDIVIDUAL',
  CLIENT: 'CLIENT',
  PARTNER: 'PARTNER_B2B',
  AFFILIATE: 'AFFILIATE',
  PENDING: 'PENDING',
  BOTH: 'BOTH', // compatibilidade com onboarding legado — depreciado
} as const

export type UserRole = (typeof ROLES)[keyof typeof ROLES]

// ── Roles de sistema (campo `systemRoles` no User) ──────────────────────────
export const SYSTEM_ROLES = {
  ADMIN: 'ADMIN',
  MODERATOR: 'MODERATOR',
  USER: 'USER',
  PARTNER: 'PARTNER',
} as const

export type SystemRoleValue = (typeof SYSTEM_ROLES)[keyof typeof SYSTEM_ROLES]

// ── Status de planos de treino ──────────────────────────────────────────────
export const PLAN_STATUS = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  DELIVERED: 'DELIVERED',
  COMPLETED: 'COMPLETED',
  ARCHIVED: 'ARCHIVED',
} as const

export type PlanStatusValue = (typeof PLAN_STATUS)[keyof typeof PLAN_STATUS]

// ── Whitelist de roles aceitos no onboarding ────────────────────────────────
export const VALID_ONBOARDING_ROLES: UserRole[] = [
  ROLES.INDIVIDUAL,
  ROLES.PROFESSIONAL,
  ROLES.CLIENT,
  ROLES.PARTNER,
  ROLES.AFFILIATE,
  ROLES.BOTH,
]

// ── Roles de sistema com acesso ao painel admin ─────────────────────────────
export const ADMIN_SYSTEM_ROLES: SystemRoleValue[] = [
  SYSTEM_ROLES.ADMIN,
  SYSTEM_ROLES.MODERATOR,
]

// ── Roles que o usuário pode auto-atribuir ──────────────────────────────────
// PARTNER_B2B é excluído — só pode ser concedido via fluxo de aprovação do admin.
export const SELF_ASSIGNABLE_ROLES: UserRole[] = [
  ROLES.PROFESSIONAL,
  ROLES.INDIVIDUAL,
  ROLES.CLIENT,
  ROLES.AFFILIATE,
]

// ── Esportes padrão da plataforma ───────────────────────────────────────────
export const DEFAULT_SPORTS = [
  { slug: 'soccer',            name: 'Futebol',           positions: ['Goleiro', 'Zagueiro', 'Lateral Direito', 'Lateral Esquerdo', 'Volante', 'Meia', 'Ponta', 'Atacante'] },
  { slug: 'futsal',            name: 'Futsal',            positions: ['Goleiro', 'Fixo', 'Ala Direita', 'Ala Esquerda', 'Pivô'] },
  { slug: 'basketball',        name: 'Basquete',          positions: ['Armador', 'Ala-armador', 'Ala', 'Ala-pivô', 'Pivô'] },
  { slug: 'volleyball',        name: 'Vôlei',             positions: ['Líbero', 'Levantador', 'Ponteiro', 'Oposto', 'Central'] },
  { slug: 'beach-volley',      name: 'Vôlei de Praia',    positions: ['Atacante', 'Defensor'] },
  { slug: 'tennis',            name: 'Tênis',             positions: ['Simples', 'Duplas'] },
  { slug: 'swimming',          name: 'Natação',           positions: ['Crawl', 'Costas', 'Peito', 'Borboleta', 'Medley'] },
  { slug: 'athletics',         name: 'Atletismo',         positions: ['Velocista', 'Meio-fundista', 'Fundista', 'Saltador', 'Arremessador'] },
  { slug: 'martial-arts',      name: 'Artes Marciais',    positions: ['Faixa Branca', 'Faixa Azul', 'Faixa Roxa', 'Faixa Marrom', 'Faixa Preta'] },
  { slug: 'gym',               name: 'Musculação',        positions: ['Iniciante', 'Intermediário', 'Avançado'] },
  { slug: 'running',           name: 'Corrida',           positions: ['5k', '10k', 'Meia Maratona', 'Maratona', 'Ultra'] },
  { slug: 'cycling',           name: 'Ciclismo',          positions: ['Speed', 'Mountain Bike', 'BMX', 'Pista'] },
  { slug: 'handball',          name: 'Handebol',          positions: ['Goleiro', 'Ponta', 'Meia', 'Pivô'] },
  { slug: 'american-football', name: 'Futebol Americano', positions: ['QB', 'RB', 'WR', 'TE', 'OL', 'DL', 'LB', 'CB', 'S', 'K'] },
] as const

export type SportSlug = (typeof DEFAULT_SPORTS)[number]['slug']
