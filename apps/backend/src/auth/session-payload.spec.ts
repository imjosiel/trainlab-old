import { toSessionPayload } from './session-payload';

describe('toSessionPayload (D3)', () => {
  it('mapeia os campos do token para o SessionPayload do legado', () => {
    const payload = toSessionPayload({
      id: 'user_1',
      name: 'Josiel',
      email: 'josiel@example.com',
      picture: 'https://img/a.png',
      roles: ['PROFESSIONAL'],
      systemRoles: ['USER'],
      subscriptionStatus: 'active',
      subscriptionPlan: 'premium',
      stripeCustomerId: 'cus_123',
    });

    expect(payload).toEqual({
      id: 'user_1',
      name: 'Josiel',
      email: 'josiel@example.com',
      image: 'https://img/a.png',
      roles: ['PROFESSIONAL'],
      systemRoles: ['USER'],
      isAdmin: false,
      subscriptionStatus: 'active',
      subscriptionPlan: 'premium',
      stripeCustomerId: 'cus_123',
    });
  });

  // Propriedade 8
  it('isAdmin é true quando systemRoles contém ADMIN', () => {
    const payload = toSessionPayload({ id: 'u', systemRoles: ['ADMIN'] });
    expect(payload!.isAdmin).toBe(true);
  });

  // Propriedade 8 — MODERATOR também conta (ADMIN_SYSTEM_ROLES do legado)
  it('isAdmin é true quando systemRoles contém MODERATOR', () => {
    const payload = toSessionPayload({ id: 'u', systemRoles: ['MODERATOR'] });
    expect(payload!.isAdmin).toBe(true);
  });

  it('isAdmin é false para systemRoles sem papel administrativo', () => {
    const payload = toSessionPayload({ id: 'u', systemRoles: ['USER', 'PARTNER'] });
    expect(payload!.isAdmin).toBe(false);
  });

  // Propriedade 9 — a que prova que o campo é DERIVADO, não transportado.
  it('ignora isAdmin vindo do token e deriva de systemRoles', () => {
    const payload = toSessionPayload({
      id: 'u',
      systemRoles: ['USER'],
      isAdmin: true, // um token que se autodeclara admin
    });
    expect(payload!.isAdmin).toBe(false);
  });

  // Propriedade 10
  it('sem roles no token, cai em PENDING (não em lista vazia)', () => {
    const payload = toSessionPayload({ id: 'u' });
    expect(payload!.roles).toEqual(['PENDING']);
  });

  it('sem systemRoles no token, cai em USER', () => {
    const payload = toSessionPayload({ id: 'u' });
    expect(payload!.systemRoles).toEqual(['USER']);
  });

  it('roles como lista vazia também cai em PENDING', () => {
    const payload = toSessionPayload({ id: 'u', roles: [] });
    expect(payload!.roles).toEqual(['PENDING']);
  });

  it('campos de assinatura ausentes viram null, não undefined', () => {
    const payload = toSessionPayload({ id: 'u' });
    expect(payload!.subscriptionStatus).toBeNull();
    expect(payload!.subscriptionPlan).toBeNull();
    expect(payload!.stripeCustomerId).toBeNull();
  });

  // Propriedade 4 — um token sem sujeito não é uma identidade.
  it('token sem id retorna null', () => {
    expect(toSessionPayload({ roles: ['ADMIN'] })).toBeNull();
  });

  it('token null retorna null', () => {
    expect(toSessionPayload(null)).toBeNull();
  });

  it('id não-string retorna null', () => {
    expect(toSessionPayload({ id: 123 as unknown as string })).toBeNull();
  });
});
