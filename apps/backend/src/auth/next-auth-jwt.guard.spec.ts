import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

// Mock com factory explícita: automock bare quebra em função async
// (o retorno vira jest.fn() síncrono e o `await` não se comporta).
jest.mock('next-auth/jwt', () => ({
  decode: jest.fn(),
}));
import { decode } from 'next-auth/jwt';

import { NextAuthJwtGuard } from './next-auth-jwt.guard';
import { IS_PUBLIC_KEY } from './public.decorator';

const decodeMock = decode as jest.MockedFunction<typeof decode>;

/** Monta um ExecutionContext mínimo com um request inspecionável. */
function contextFor(headers: Record<string, string> = {}) {
  const request: Record<string, unknown> = { headers };
  const ctx = {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => function handler() {},
    getClass: () => class Controller {},
  } as unknown as ExecutionContext;
  return { ctx, request };
}

describe('NextAuthJwtGuard', () => {
  let guard: NextAuthJwtGuard;
  let reflector: Reflector;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.NEXTAUTH_SECRET = 'test-secret';
    reflector = new Reflector();
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);
    guard = new NextAuthJwtGuard(reflector);
  });

  // Propriedade 1
  it('nega requisição sem header Authorization', async () => {
    const { ctx } = contextFor({});
    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
    expect(decodeMock).not.toHaveBeenCalled();
  });

  // Propriedade 2
  it.each([
    ['sem o prefixo Bearer', { authorization: 'abc.def.ghi' }],
    ['prefixo sem token', { authorization: 'Bearer ' }],
    ['header vazio', { authorization: '' }],
    ['esquema errado', { authorization: 'Basic dXNlcjpwYXNz' }],
  ])('nega header malformado: %s', async (_label, headers) => {
    const { ctx } = contextFor(headers);
    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
    expect(decodeMock).not.toHaveBeenCalled();
  });

  // Propriedade 3
  it('nega token que não decodifica com o secret', async () => {
    decodeMock.mockResolvedValue(null);
    const { ctx } = contextFor({ authorization: 'Bearer inválido' });
    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });

  it('nega quando decode lança', async () => {
    decodeMock.mockRejectedValue(new Error('JWEDecryptionFailed'));
    const { ctx } = contextFor({ authorization: 'Bearer corrompido' });
    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });

  // Propriedade 4
  it('nega token que decodifica mas não tem id', async () => {
    decodeMock.mockResolvedValue({ roles: ['ADMIN'] } as never);
    const { ctx } = contextFor({ authorization: 'Bearer sem-sujeito' });
    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });

  // Propriedade 5
  it('aceita token válido e popula request.user', async () => {
    decodeMock.mockResolvedValue({
      id: 'user_1',
      name: 'Josiel',
      email: 'j@example.com',
      roles: ['PROFESSIONAL'],
      systemRoles: ['USER'],
    } as never);

    const { ctx, request } = contextFor({ authorization: 'Bearer válido' });
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(request.user).toMatchObject({
      id: 'user_1',
      roles: ['PROFESSIONAL'],
      systemRoles: ['USER'],
      isAdmin: false,
    });
  });

  it('passa o token e o secret para o decode', async () => {
    decodeMock.mockResolvedValue({ id: 'u' } as never);
    const { ctx } = contextFor({ authorization: 'Bearer o-token' });
    await guard.canActivate(ctx);
    expect(decodeMock).toHaveBeenCalledWith({
      token: 'o-token',
      secret: 'test-secret',
    });
  });

  // Propriedade 6
  it('libera rota @Public() sem token, sem inventar um user falso', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(true);
    const { ctx, request } = contextFor({});
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(request.user).toBeUndefined();
    expect(decodeMock).not.toHaveBeenCalled();
  });

  // Propriedade 7 — público significa "não exige", não "ignora".
  it('em rota @Public() com token válido, ainda popula request.user', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(true);
    decodeMock.mockResolvedValue({ id: 'user_9', systemRoles: ['ADMIN'] } as never);

    const { ctx, request } = contextFor({ authorization: 'Bearer válido' });
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(request.user).toMatchObject({ id: 'user_9', isAdmin: true });
  });

  it('em rota @Public() com token inválido, libera sem user em vez de negar', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(true);
    decodeMock.mockResolvedValue(null);

    const { ctx, request } = contextFor({ authorization: 'Bearer lixo' });
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(request.user).toBeUndefined();
  });

  it('consulta o metadata de @Public() no handler e na classe', async () => {
    const spy = jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(true);
    const { ctx } = contextFor({});
    await guard.canActivate(ctx);
    expect(spy).toHaveBeenCalledWith(IS_PUBLIC_KEY, expect.any(Array));
    expect(spy.mock.calls[0][1]).toHaveLength(2);
  });

  // Propriedade 11 — o corpo, não o instanceof.
  it('o corpo do 401 é { error: "Não autorizado" }', async () => {
    const { ctx } = contextFor({});
    try {
      await guard.canActivate(ctx);
      throw new Error('deveria ter lançado');
    } catch (err) {
      expect(err).toBeInstanceOf(UnauthorizedException);
      expect((err as UnauthorizedException).getResponse()).toEqual({
        error: 'Não autorizado',
      });
    }
  });

  it('falha fechado se NEXTAUTH_SECRET não estiver configurado', async () => {
    delete process.env.NEXTAUTH_SECRET;
    const { ctx } = contextFor({ authorization: 'Bearer qualquer' });
    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
    expect(decodeMock).not.toHaveBeenCalled();
  });
});
