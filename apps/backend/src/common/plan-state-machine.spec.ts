import {
  assertValidTransition,
  getAllowedTransitions,
  isValidTransition,
  PLAN_TRANSITIONS,
  PlanStatus,
} from './plan-state-machine';

/**
 * Fatia 29 (D100) — RED.
 *
 * Porte 1:1 de `lib/plan-state-machine.ts` do legado. A tabela é o contrato:
 * qualquer divergência aqui muda o que trainer/admin pode fazer com o plano.
 */
describe('plan-state-machine (fatia 29, D100)', () => {
  describe('tabela PLAN_TRANSITIONS', () => {
    it('tem os 6 estados do legado, sem estado a mais nem a menos', () => {
      expect(Object.keys(PLAN_TRANSITIONS).sort()).toEqual(
        ['APPROVED', 'ARCHIVED', 'COMPLETED', 'DELIVERED', 'PENDING', 'REJECTED'].sort(),
      );
    });

    it.each([
      ['PENDING', ['APPROVED', 'REJECTED']],
      ['APPROVED', ['DELIVERED', 'REJECTED']],
      ['REJECTED', ['PENDING']],
      ['DELIVERED', ['COMPLETED']],
      ['COMPLETED', ['ARCHIVED']],
      ['ARCHIVED', []],
    ])('%s → %j', (from, allowed) => {
      expect(PLAN_TRANSITIONS[from as PlanStatus]).toEqual(allowed);
    });
  });

  describe('isValidTransition', () => {
    it('[controle] PENDING → APPROVED é válido', () => {
      expect(isValidTransition('PENDING', 'APPROVED')).toBe(true);
    });

    it('[controle] REJECTED → PENDING é válido (treinador re-gera)', () => {
      expect(isValidTransition('REJECTED', 'PENDING')).toBe(true);
    });

    it.each([
      ['PENDING', 'COMPLETED'],
      ['PENDING', 'DELIVERED'],
      ['COMPLETED', 'PENDING'],
      ['ARCHIVED', 'PENDING'],
      ['DELIVERED', 'APPROVED'],
    ])('%s → %s é inválido', (from, to) => {
      expect(isValidTransition(from as PlanStatus, to as PlanStatus)).toBe(false);
    });
  });

  describe('assertValidTransition', () => {
    it('[controle] transição válida não lança', () => {
      expect(() => assertValidTransition('PENDING', 'APPROVED')).not.toThrow();
    });

    it('transição inválida lança erro que cita from → to', () => {
      expect(() => assertValidTransition('PENDING', 'COMPLETED')).toThrow(/PENDING.*COMPLETED/);
    });

    it('estado terminal ARCHIVED não sai para nada', () => {
      expect(() => assertValidTransition('ARCHIVED', 'PENDING')).toThrow();
    });
  });

  describe('getAllowedTransitions', () => {
    it('[controle] PENDING permite APPROVED e REJECTED', () => {
      expect(getAllowedTransitions('PENDING')).toEqual(['APPROVED', 'REJECTED']);
    });

    it('ARCHIVED retorna vazio', () => {
      expect(getAllowedTransitions('ARCHIVED')).toEqual([]);
    });
  });
});
