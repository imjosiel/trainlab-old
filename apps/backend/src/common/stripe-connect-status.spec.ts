import { derivarStatusDaContaConectada } from './stripe-connect-status';

describe('derivarStatusDaContaConectada', () => {
  describe('exigeChargesEnabled=true (parceiro)', () => {
    it('payoutsEnabled e chargesEnabled → active', () => {
      expect(derivarStatusDaContaConectada({ payoutsEnabled: true, chargesEnabled: true, disabledReason: null }, true)).toBe('active');
    });

    it('só payoutsEnabled, sem chargesEnabled → não é active', () => {
      const r = derivarStatusDaContaConectada({ payoutsEnabled: true, chargesEnabled: false, disabledReason: null }, true);
      expect(r).not.toBe('active');
    });

    it('nenhum dos dois, com disabledReason → restricted', () => {
      expect(derivarStatusDaContaConectada({ payoutsEnabled: false, chargesEnabled: false, disabledReason: 'requirements.past_due' }, true)).toBe('restricted');
    });

    it('nenhum dos dois, sem disabledReason → pending', () => {
      expect(derivarStatusDaContaConectada({ payoutsEnabled: false, chargesEnabled: false, disabledReason: null }, true)).toBe('pending');
    });
  });

  describe('exigeChargesEnabled=false (afiliado)', () => {
    it('só payoutsEnabled já é suficiente → active', () => {
      expect(derivarStatusDaContaConectada({ payoutsEnabled: true, chargesEnabled: false, disabledReason: null }, false)).toBe('active');
    });

    it('sem payoutsEnabled, com disabledReason → restricted', () => {
      expect(derivarStatusDaContaConectada({ payoutsEnabled: false, chargesEnabled: false, disabledReason: 'rejected.fraud' }, false)).toBe('restricted');
    });

    it('sem payoutsEnabled, sem disabledReason → pending', () => {
      expect(derivarStatusDaContaConectada({ payoutsEnabled: false, chargesEnabled: true, disabledReason: null }, false)).toBe('pending');
    });
  });
});
