/**
 * Fatia 37 — RED. VideoService (ainda não existe).
 *
 * Porta separada D66/D62 como o CalendarService: falha externa não derruba
 * escrita, e corpo inválido não chega a tocar no provider.
 */
import { VideoService } from './video.service';

describe('VideoService (fatia 37 — RED)', () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...OLD_ENV };
    delete process.env.DAILY_API_KEY;
    delete process.env.VIDEO_PROVIDER;
    delete process.env.JITSI_DOMAIN;
  });

  afterAll(() => {
    process.env = OLD_ENV;
  });

  it('[controle] sem chave Daily + auto → Jitsi com roomName trainlab-…', async () => {
    const svc = new VideoService();
    const sala = await svc.criarSala('appt-123456', {
      scheduledAt: new Date('2026-10-01T10:00:00.000Z'),
      durationMinutes: 60,
    });
    expect(sala.provider).toBe('jitsi');
    expect(sala.roomName).toMatch(/^trainlab-[a-z0-9]{6}-[a-f0-9]{16}$/);
    expect(sala.joinUrl).toBe(`https://meet.jit.si/${sala.roomName}`);
  });

  it('daily pedido sem chave → fallback Jitsi, sem exceção', async () => {
    const svc = new VideoService();
    const sala = await svc.criarSala(
      'appt-123456',
      { scheduledAt: new Date('2026-10-01T10:00:00.000Z'), durationMinutes: 60 },
      'daily',
    );
    expect(sala.provider).toBe('jitsi');
    expect(sala.joinUrl).toContain('https://');
  });

  it('Daily com chave → POST /v1/rooms com privacy private, max 2, exp coerente', async () => {
    process.env.DAILY_API_KEY = 'k-test';
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ name: 'trainlab-abc123-deadbeef', url: 'https://x.daily.co/trainlab-abc123-deadbeef' }),
    });
    const svc = new VideoService(fetchMock as unknown as typeof fetch);
    const inicio = new Date('2026-10-01T10:00:00.000Z');
    const sala = await svc.criarSala('appt-123456', { scheduledAt: inicio, durationMinutes: 60 });
    expect(sala.provider).toBe('daily');
    expect(sala.joinUrl).toBe('https://x.daily.co/trainlab-abc123-deadbeef');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.daily.co/v1/rooms');
    const corpo = JSON.parse(init.body as string) as {
      privacy: string;
      properties: { max_participants: number; exp: number };
    };
    expect(corpo.privacy).toBe('private');
    expect(corpo.properties.max_participants).toBe(2);
    // exp = início + 60min + 30min de margem, em segundos
    const esperado = Math.floor(inicio.getTime() / 1000) + 60 * 60 + 30 * 60;
    expect(Math.abs(corpo.properties.exp - esperado)).toBeLessThanOrEqual(5);
  });

  it('falha do fetch Daily → lança (quem engole é o AppointmentsService)', async () => {
    process.env.DAILY_API_KEY = 'k-test';
    const fetchMock = jest.fn().mockResolvedValue({ ok: false, status: 500, text: async () => 'boom' });
    const svc = new VideoService(fetchMock as unknown as typeof fetch);
    await expect(
      svc.criarSala('appt-123456', {
        scheduledAt: new Date('2026-10-01T10:00:00.000Z'),
        durationMinutes: 60,
      }),
    ).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('roomName difere entre chamadas (aleatoriedade real)', async () => {
    const svc = new VideoService();
    const dados = { scheduledAt: new Date('2026-10-01T10:00:00.000Z'), durationMinutes: 60 };
    const a = await svc.criarSala('appt-123456', dados);
    const b = await svc.criarSala('appt-123456', dados);
    expect(a.roomName).not.toBe(b.roomName);
  });
});
