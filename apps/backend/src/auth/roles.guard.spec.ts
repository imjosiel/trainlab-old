import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { ADMIN_ONLY_KEY } from './admin-only.decorator';
import { RolesGuard } from './roles.guard';
import { SessionPayload } from './session-payload';

function sessionWith(systemRoles: string[], isAdmin: boolean): SessionPayload {
  return {
    id: 'u',
    name: null,
    email: null,
    image: null,
    roles: ['PROFESSIONAL'],
    systemRoles,
    isAdmin,
    subscriptionStatus: null,
    subscriptionPlan: null,
    stripeCustomerId: null,
  };
}

function contextFor(user?: SessionPayload) {
  const request: Record<string, unknown> = { user };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => function handler() {},
    getClass: () => class Controller {},
  } as unknown as ExecutionContext;
}

describe('RolesGuard (D11)', () => {
  let guard: RolesGuard;
  let reflector: Reflector;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new RolesGuard(reflector);
  });

  function requireAdmin(required: boolean) {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(required);
  }

  it('libera rota sem @AdminOnly() independentemente do papel', () => {
    requireAdmin(false);
    expect(guard.canActivate(contextFor(sessionWith(['USER'], false)))).toBe(true);
  });

  // Propriedade 9
  it('libera ADMIN em rota @AdminOnly()', () => {
    requireAdmin(true);
    expect(guard.canActivate(contextFor(sessionWith(['ADMIN'], true)))).toBe(true);
  });

  // Propriedade 10 — fidelidade ao legado (achado A1): MODERATOR passa.
  it('libera MODERATOR em rota @AdminOnly()', () => {
    requireAdmin(true);
    expect(guard.canActivate(contextFor(sessionWith(['MODERATOR'], true)))).toBe(true);
  });

  // Propriedade 8
  it('nega usuário comum com 403', () => {
    requireAdmin(true);
    expect(() => guard.canActivate(contextFor(sessionWith(['USER'], false)))).toThrow(
      ForbiddenException,
    );
  });

  it('o corpo do 403 é { error: "Acesso negado" }', () => {
    requireAdmin(true);
    try {
      guard.canActivate(contextFor(sessionWith(['USER'], false)));
      throw new Error('deveria ter lançado');
    } catch (err) {
      expect(err).toBeInstanceOf(ForbiddenException);
      expect((err as ForbiddenException).getResponse()).toEqual({ error: 'Acesso negado' });
    }
  });

  it('nega PARTNER, que não é papel administrativo', () => {
    requireAdmin(true);
    expect(() => guard.canActivate(contextFor(sessionWith(['PARTNER'], false)))).toThrow(
      ForbiddenException,
    );
  });

  /**
   * Propriedade 7 — a ordem entre os guards é a garantia de que ninguém escolhe
   * entre 401 e 403 por conta própria. Sem sessão, o guard de auth já negou com
   * 401 antes daqui; se ainda assim chegar sem user, negar (não presumir).
   */
  it('nega quando não há sessão no request, em vez de presumir permissão', () => {
    requireAdmin(true);
    expect(() => guard.canActivate(contextFor(undefined))).toThrow(ForbiddenException);
  });

  // Deriva de systemRoles, não confia no booleano — mesma propriedade do D3.
  it('ignora isAdmin do payload e decide por systemRoles', () => {
    requireAdmin(true);
    expect(() => guard.canActivate(contextFor(sessionWith(['USER'], true)))).toThrow(
      ForbiddenException,
    );
  });

  it('consulta o metadata no handler e na classe', () => {
    const spy = jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(true);
    guard.canActivate(contextFor(sessionWith(['ADMIN'], true)));
    expect(spy).toHaveBeenCalledWith(ADMIN_ONLY_KEY, expect.any(Array));
    expect(spy.mock.calls[0][1]).toHaveLength(2);
  });
});
