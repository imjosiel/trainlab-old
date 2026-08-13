import { MeController } from './me.controller';
import { SessionPayload } from './session-payload';

const SESSION: SessionPayload = {
  id: 'user_1',
  name: 'Josiel',
  email: 'josiel@example.com',
  image: null,
  roles: ['PROFESSIONAL'],
  systemRoles: ['USER'],
  isAdmin: false,
  subscriptionStatus: 'active',
  subscriptionPlan: 'premium',
  stripeCustomerId: 'cus_123',
};

describe('MeController', () => {
  const controller = new MeController();

  it('devolve o payload da sessão como recebido do guard', () => {
    expect(controller.me(SESSION)).toEqual(SESSION);
  });

  // A rota existe para tornar a ponte observável — se ela inventasse dados,
  // não serviria para diagnosticar nada.
  it('não acrescenta nem remove campos', () => {
    expect(Object.keys(controller.me(SESSION)).sort()).toEqual(Object.keys(SESSION).sort());
  });
});
