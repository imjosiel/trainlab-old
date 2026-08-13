import { ADMIN_SYSTEM_ROLES, ROLES, SYSTEM_ROLES } from '@/common/constants';

/**
 * Contrato idêntico ao SessionPayload de apps/web/lib/auth-helpers.ts (D3).
 * Manter os dois em paridade é o que torna a migração de cada rota uma
 * tradução de sintaxe, não de semântica.
 */
export interface SessionPayload {
  id: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
  roles: string[];
  systemRoles: string[];
  isAdmin: boolean;
  subscriptionStatus: string | null;
  subscriptionPlan: string | null;
  stripeCustomerId: string | null;
}

/** Forma bruta do token decodificado. Tudo opcional: é entrada não confiável. */
type DecodedToken = Record<string, unknown> | null;

function asStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const strings = value.filter((v): v is string => typeof v === 'string');
  return strings.length > 0 ? strings : null;
}

function asNullableString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

/**
 * Converte o token decodificado no payload de sessão, ou null se o token não
 * representa uma identidade.
 *
 * Sem `id` não há sujeito — um token válido em forma mas sem sujeito não
 * autentica ninguém, então retorna null em vez de um payload incompleto.
 */
export function toSessionPayload(token: DecodedToken): SessionPayload | null {
  if (!token || typeof token.id !== 'string' || token.id.length === 0) {
    return null;
  }

  const systemRoles = asStringArray(token.systemRoles) ?? [SYSTEM_ROLES.USER];

  return {
    id: token.id,
    name: asNullableString(token.name),
    email: asNullableString(token.email),
    image: asNullableString(token.picture),
    roles: asStringArray(token.roles) ?? [ROLES.PENDING],
    systemRoles,
    // Derivado, nunca lido de `token.isAdmin`: se fosse transportado, um token
    // que se autodeclara admin viraria admin. A fonte é sempre systemRoles.
    isAdmin: ADMIN_SYSTEM_ROLES.some((role) => systemRoles.includes(role)),
    subscriptionStatus: asNullableString(token.subscriptionStatus),
    subscriptionPlan: asNullableString(token.subscriptionPlan),
    stripeCustomerId: asNullableString(token.stripeCustomerId),
  };
}
