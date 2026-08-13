import { SetMetadata } from '@nestjs/common';

export const ADMIN_ONLY_KEY = 'adminOnly';

/**
 * Exige papel administrativo. Lido pelo RolesGuard, que é o único emissor de
 * 403 (D11) — nenhuma rota decide isso por conta própria.
 *
 * "Administrativo" inclui MODERATOR, não só ADMIN: é o que `ADMIN_SYSTEM_ROLES`
 * significa no legado e é o privilégio que os moderadores têm hoje de fato.
 * Ver o achado A1 em docs/implementation-plans/epic-nest-sports.md — a
 * intenção documentada no technical_handbook é mais restrita que a regra real,
 * e apertar isso é decisão de produto, não de migração.
 */
export const AdminOnly = () => SetMetadata(ADMIN_ONLY_KEY, true);
