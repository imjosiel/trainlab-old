import { createHmac } from 'crypto';

import { VideoService } from './video.service';

function decodificarSemVerificar(token: string): Record<string, unknown> {
  const [, payload] = token.split('.');
  return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Record<string, unknown>;
}

function verificarHmac(token: string, segredo: string): boolean {
  const [header, payload, assinatura] = token.split('.');
  const esperado = createHmac('sha256', segredo).update(`${header}.${payload}`).digest('base64url');
  return esperado === assinatura;
}

/**
 * Fatia 38 — RED. JWT do Jitsi self-host (ainda não existe).
 */
describe('VideoService.mintJitsiToken (fatia 38 — RED)', () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    process.env = { ...OLD_ENV };
    delete process.env.JITSI_JWT_SECRET;
    delete process.env.JITSI_APP_ID;
    delete process.env.JITSI_DOMAIN;
  });

  afterAll(() => {
    process.env = OLD_ENV;
  });

  it('sem segredo → lança erro explícito (quem engole é o chamador)', async () => {
    const svc = new VideoService();
    await expect(
      svc.mintJitsiToken({
        roomName: 'trainlab-abc123-deadbeef01',
        userId: 'u1',
        displayName: 'Ana',
        email: 'ana@example.com',
        moderator: true,
      }),
    ).rejects.toThrow();
  });

  it('com segredo → token HS256 verificável com iss/aud/sub/room/context', async () => {
    process.env.JITSI_JWT_SECRET = 'segredo-teste';
    process.env.JITSI_APP_ID = 'trainlab';
    process.env.JITSI_DOMAIN = 'meet.exemplo.com';
    const svc = new VideoService();
    const token = await svc.mintJitsiToken({
      roomName: 'trainlab-abc123-deadbeef01',
      userId: 'u1',
      displayName: 'Ana',
      email: 'ana@example.com',
      moderator: true,
    });
    expect(verificarHmac(token, 'segredo-teste')).toBe(true);
    const payload = decodificarSemVerificar(token) as {
      iss: string;
      aud: string;
      sub: string;
      room: string;
      exp: number;
      context: { user: { id: string; name: string; email: string; moderator: boolean } };
    };
    expect(payload.iss).toBe('trainlab');
    expect(payload.aud).toBe('trainlab');
    expect(payload.sub).toBe('meet.exemplo.com');
    expect(payload.room).toBe('trainlab-abc123-deadbeef01');
    expect(payload.context.user).toMatchObject({ id: 'u1', name: 'Ana', moderator: true });
    expect(payload.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  it('exp respeita teto de 12h mesmo com sessão longa', async () => {
    process.env.JITSI_JWT_SECRET = 'segredo-teste';
    const svc = new VideoService();
    const agora = Math.floor(Date.now() / 1000);
    const token = await svc.mintJitsiToken({
      roomName: 'trainlab-abc123-deadbeef01',
      userId: 'u1',
      displayName: 'Ana',
      moderator: false,
      expiraEmSegundos: 72 * 3600,
    });
    const payload = decodificarSemVerificar(token) as { exp: number };
    expect(payload.exp - agora).toBeLessThanOrEqual(12 * 3600 + 5);
  });

  it('room vazio → exceção (nunca curinga *)', async () => {
    process.env.JITSI_JWT_SECRET = 'segredo-teste';
    const svc = new VideoService();
    await expect(
      svc.mintJitsiToken({ roomName: '', userId: 'u1', displayName: 'Ana', moderator: false }),
    ).rejects.toThrow();
  });
});
