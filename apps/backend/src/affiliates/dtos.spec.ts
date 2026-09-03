import { plainToInstance } from 'class-transformer';
import { validateSync, ValidationError } from 'class-validator';

import { CriarSessaoDeOnboardingBody, ListarGanhosQuery } from './dtos';

function achatar(erros: ValidationError[]): string[] {
  return erros.flatMap((e) => [
    ...Object.values(e.constraints ?? {}),
    ...achatar(e.children ?? []),
  ]);
}

function valido<T extends object>(cls: new () => T, plain: unknown): boolean {
  return achatar(validateSync(plainToInstance(cls, plain), { whitelist: true })).length === 0;
}

/**
 * Fatia 30d (D104) — RED. Affiliates.
 */
describe('DTOs de affiliates (fatia 30d)', () => {
  describe('CriarSessaoDeOnboardingBody', () => {
    it('[controle] aceita vazio', () => {
      expect(valido(CriarSessaoDeOnboardingBody, {})).toBe(true);
    });

    it('[controle] aceita components válido', () => {
      expect(valido(CriarSessaoDeOnboardingBody, { components: 'payouts' })).toBe(true);
    });

    it('rejeita components fora da lista', () => {
      expect(valido(CriarSessaoDeOnboardingBody, { components: 'saque_pix' })).toBe(false);
    });
  });

  describe('ListarGanhosQuery', () => {
    it('[controle] aceita vazia', () => {
      expect(valido(ListarGanhosQuery, {})).toBe(true);
    });
  });
});
