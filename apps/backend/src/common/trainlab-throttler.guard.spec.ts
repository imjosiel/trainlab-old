import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ThrottlerModuleOptions } from '@nestjs/throttler';

import { TrainLabThrottlerGuard } from './trainlab-throttler.guard';

function contextFor(user?: { id: string }, ip = '1.2.3.4') {
  const request: Record<string, unknown> = { user, ip };
  return {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => ({}),
    }),
    getHandler: () => function handler() {},
    getClass: () => class Controller {},
  } as unknown as ExecutionContext;
}

/**
 * Fatia 27 (SDD: Spoofing/Elevation + Repudiation) — RED.
 *
 * O `ThrottlerGuard` padrão rastreia por IP. Com sessão, o tracker precisa ser
 * o `user.id` (IP é compartilhável — NAT, rede corporativa — e permite que um
 * usuário consuma a cota do outro ou fuja da própria). Sem sessão (guest:
 * checkout B2B, link mágico), o IP é o único tracker possível.
 */
describe('TrainLabThrottlerGuard (fatia 27)', () => {
  let guard: TrainLabThrottlerGuard;
  const options: ThrottlerModuleOptions = {
    throttlers: [{ name: 'curto', limit: 100, ttl: 60_000 }],
  };

  beforeEach(() => {
    const storage = {
      getRecord: jest.fn(),
      addRecord: jest.fn(),
      increment: jest.fn(),
    };
    guard = new TrainLabThrottlerGuard(options, storage as never, new Reflector());
  });

  it('usa o user.id como tracker quando há sessão', async () => {
    await expect(
      (guard as unknown as { getTracker: (req: unknown) => Promise<string> }).getTracker(
        (contextFor({ id: 'user-1' }).switchToHttp().getRequest() as object),
      ),
    ).resolves.toBe('user-1');
  });

  it('[controle] usa o IP quando não há sessão (guest)', async () => {
    await expect(
      (guard as unknown as { getTracker: (req: unknown) => Promise<string> }).getTracker(
        (contextFor(undefined, '9.9.9.9').switchToHttp().getRequest() as object),
      ),
    ).resolves.toBe('9.9.9.9');
  });

  it('a mensagem de 429 é em português e segue o contrato { error }', async () => {
    const msg = await (
      guard as unknown as {
        getErrorMessage: (c: ExecutionContext, d: never) => Promise<string>;
      }
    ).getErrorMessage(contextFor({ id: 'user-1' }), {
      limit: 100,
      ttl: 60,
    } as never);
    expect(msg).toBe('Muitas requisições. Tente novamente em alguns instantes.');
  });
});
