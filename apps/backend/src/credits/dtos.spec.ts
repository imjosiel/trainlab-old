import { plainToInstance } from 'class-transformer';
import { validateSync, ValidationError } from 'class-validator';

import { CreatePackageBody, GrantBody, UpdatePackageBody } from './dtos';

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
 * Fatia 30d (D104) — RED. Credits admin (grant + pacotes).
 * Faixas portadas dos validadores do service.
 */
describe('DTOs de credits-admin (fatia 30d)', () => {
  describe('GrantBody', () => {
    it('[controle] aceita userId + amount', () => {
      expect(valido(GrantBody, { userId: 'u1', amount: 100 })).toBe(true);
    });

    it.each([
      ['sem userId', { amount: 100 }],
      ['sem amount', { userId: 'u1' }],
      ['amount zero', { userId: 'u1', amount: 0 }],
      ['amount negativo', { userId: 'u1', amount: -1 }],
      ['amount acima do teto', { userId: 'u1', amount: 100_001 }],
      ['bucket fora da lista', { userId: 'u1', amount: 10, bucket: 'bonus' }],
    ])('rejeita %s', (_rotulo, body) => {
      expect(valido(GrantBody, body)).toBe(false);
    });

    it('[controle] aceita bucket purchased', () => {
      expect(valido(GrantBody, { userId: 'u1', amount: 10, bucket: 'purchased' })).toBe(true);
    });
  });

  describe('CreatePackageBody', () => {
    it('[controle] aceita pacote válido', () => {
      expect(
        valido(CreatePackageBody, { name: 'P100', credits: 100, price: 97, stripePriceId: 'price_1' }),
      ).toBe(true);
    });

    it.each([
      ['sem name', { credits: 100, price: 97 }],
      ['credits zero', { name: 'P', credits: 0, price: 97 }],
      ['credits acima do teto', { name: 'P', credits: 600_000, price: 97 }],
      ['price zero', { name: 'P', credits: 100, price: 0 }],
      ['price acima do teto', { name: 'P', credits: 100, price: 20000 }],
    ])('rejeita %s', (_rotulo, body) => {
      expect(valido(CreatePackageBody, body)).toBe(false);
    });
  });

  describe('UpdatePackageBody', () => {
    it('[controle] aceita vazio', () => {
      expect(valido(UpdatePackageBody, {})).toBe(true);
    });

    it('rejeita credits zero', () => {
      expect(valido(UpdatePackageBody, { credits: 0 })).toBe(false);
    });
  });
});
