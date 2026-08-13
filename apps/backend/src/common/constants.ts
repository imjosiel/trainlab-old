/**
 * Porte de apps/web/lib/constants.ts.
 *
 * Duplicado de propósito: o backend não importa de dentro do app Next
 * (workspaces separados, e depender do frontend inverteria a direção da
 * dependência). Os valores são contrato do banco — mudar aqui sem mudar lá
 * quebra a leitura de `roles`/`systemRoles` gravados pelo NextAuth.
 */

export const ROLES = {
  PROFESSIONAL: 'PROFESSIONAL',
  INDIVIDUAL: 'INDIVIDUAL',
  CLIENT: 'CLIENT',
  PARTNER: 'PARTNER_B2B',
  AFFILIATE: 'AFFILIATE',
  PENDING: 'PENDING',
  BOTH: 'BOTH',
} as const;

export type UserRole = (typeof ROLES)[keyof typeof ROLES];

export const SYSTEM_ROLES = {
  ADMIN: 'ADMIN',
  MODERATOR: 'MODERATOR',
  USER: 'USER',
  PARTNER: 'PARTNER',
} as const;

export type SystemRoleValue = (typeof SYSTEM_ROLES)[keyof typeof SYSTEM_ROLES];

/**
 * MODERATOR conta como admin — é assim no legado (ADMIN_SYSTEM_ROLES) e é o que
 * `isAdmin` significa: "tem acesso ao painel admin", não "é o ADMIN".
 */
export const ADMIN_SYSTEM_ROLES: SystemRoleValue[] = [
  SYSTEM_ROLES.ADMIN,
  SYSTEM_ROLES.MODERATOR,
];
