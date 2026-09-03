import { RealtimeService, canalDaConversa, canalDoUsuario, EVENTOS } from './realtime.service';

/**
 * Fatia 34 (lote 2b) — RED. Realtime: degradação sem credencial.
 */
describe('RealtimeService', () => {
  let warn: jest.SpyInstance;

  beforeEach(() => {
    warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    delete process.env.PUSHER_APP_ID;
    delete process.env.NEXT_PUBLIC_PUSHER_KEY;
    delete process.env.PUSHER_SECRET;
    delete process.env.NEXT_PUBLIC_PUSHER_CLUSTER;
  });

  afterEach(() => warn.mockRestore());

  it('canais seguem o contrato com o navegador (legado)', () => {
    expect(canalDaConversa('c1')).toBe('private-conversation-c1');
    expect(canalDoUsuario('u1')).toBe('private-user-u1');
    expect(EVENTOS.NOVA_MENSAGEM).toBe('new-message');
    expect(EVENTOS.NOVA_NOTIFICACAO).toBe('new-notification');
  });

  it('sem credencial, emitir é no-op sem derrubar', async () => {
    const service = new RealtimeService();
    await expect(service.emitirNovaMensagem('c1', { id: 'm1' })).resolves.toBeUndefined();
    await expect(service.emitirNovaNotificacao('u1', { id: 'n1' })).resolves.toBeUndefined();
  });
});
