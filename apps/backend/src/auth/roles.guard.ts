import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { ADMIN_ONLY_KEY } from './admin-only.decorator';
import { ADMIN_SYSTEM_ROLES } from '@/common/constants';
import { SessionPayload } from './session-payload';

/**
 * Dono exclusivo do 403 (D11).
 *
 * Roda DEPOIS do NextAuthJwtGuard, que é dono exclusivo do 401. A separação é o
 * conserto estrutural da divergência medida na fatia 1: a mesma condição
 * ("logado, mas não é admin") respondia 401 em 5 rotas legadas e 403 em 4.
 * Aqui nenhuma rota escolhe — a ordem dos guards escolhe.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const adminOnly = this.reflector.getAllAndOverride<boolean>(ADMIN_ONLY_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!adminOnly) return true;

    const user: SessionPayload | undefined = context.switchToHttp().getRequest().user;

    // Decide por systemRoles, não pelo booleano `isAdmin` do payload — mesma
    // razão do D3: o que é derivado não deve ser reconsumido como fato.
    const systemRoles = user?.systemRoles ?? [];
    const isAdmin = ADMIN_SYSTEM_ROLES.some((role) => systemRoles.includes(role));

    if (!isAdmin) throw new ForbiddenException({ error: 'Acesso negado' });

    return true;
  }
}
