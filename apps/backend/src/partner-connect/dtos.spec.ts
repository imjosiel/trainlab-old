import { plainToInstance } from 'class-transformer';
import { validateSync, ValidationError } from 'class-validator';

import { CandidatarBody, CriarSessaoDeOnboardingBody } from './dtos';

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
 * Fatia 30d (D104) — RED. Partner-connect.
 */
describe('DTOs de partner-connect (fatia 30d)', () => {
  describe('CandidatarBody', () => {
    it('[controle] aceita vazio (auto-approve dispensa motivação)', () => {
      expect(valido(CandidatarBody, {})).toBe(true);
    });

    it('[controle] aceita motivação', () => {
      expect(valido(CandidatarBody, { motivation: 'Quero ensinar.' })).toBe(true);
    });
  });

  describe('CriarSessaoDeOnboardingBody', () => {
    it('[controle] aceita vazio', () => {
      expect(valido(CriarSessaoDeOnboardingBody, {})).toBe(true);
    });

    it('[controle] aceita components válido', () => {
      expect(valido(CriarSessaoDeOnboardingBody, { components: 'account_onboarding' })).toBe(
        true,
      );
    });

    it('rejeita components fora da lista', () => {
      expect(valido(CriarSessaoDeOnboardingBody, { components: 'saque_pix' })).toBe(false);
    });
  });
});
