import { plainToInstance } from 'class-transformer';
import { validateSync, ValidationError } from 'class-validator';

import {
  CancelBody,
  CheckoutBody,
  CheckoutB2BBody,
  CheckoutTierBody,
  CreateOfferBody,
  GrantOrRevokeBody,
  PortalBody,
  ReactivateBody,
  UpdateOfferBody,
} from './dtos';

function achatar(erros: ValidationError[]): string[] {
  return erros.flatMap((e) => [
    ...Object.values(e.constraints ?? {}),
    ...achatar(e.children ?? []),
  ]);
}

function errosDe<T extends object>(cls: new () => T, plain: unknown): string[] {
  return achatar(validateSync(plainToInstance(cls, plain), { whitelist: true }));
}

function valido<T extends object>(cls: new () => T, plain: unknown): boolean {
  return errosDe(cls, plain).length === 0;
}

/**
 * Fatia 30a (D104) — RED. Billing primeiro (dinheiro).
 *
 * DTO valida FORMA; regra que precisa de banco (tier existe? oferta ativa?)
 * fica no service. Mensagens específicas do service vencem (D105).
 */
describe('DTOs do billing (fatia 30a)', () => {
  describe('CheckoutB2BBody', () => {
    it('[controle] aceita offerId', () => {
      expect(valido(CheckoutB2BBody, { offerId: 'o1' })).toBe(true);
    });

    it('[controle] aceita offerId + email + name + returnUrl', () => {
      expect(
        valido(CheckoutB2BBody, { offerId: 'o1', email: 'ana@example.com', name: 'Ana', returnUrl: 'http://x/y' }),
      ).toBe(true);
    });

    it.each([
      ['sem offerId', {}],
      ['offerId vazio', { offerId: '' }],
      ['offerId não-string', { offerId: 123 }],
    ])('rejeita %s', (_rotulo, body) => {
      expect(valido(CheckoutB2BBody, body)).toBe(false);
    });
  });

  describe('CheckoutTierBody', () => {
    it('[controle] aceita toTierId', () => {
      expect(valido(CheckoutTierBody, { toTierId: 't1' })).toBe(true);
    });

    it.each([[{}], [{ toTierId: '' }]])('rejeita %j', (body) => {
      expect(valido(CheckoutTierBody, body)).toBe(false);
    });

    it('[controle] aceita currency usd', () => {
      expect(valido(CheckoutTierBody, { toTierId: 't1', currency: 'usd' })).toBe(true);
    });

    it('rejeita currency fora de brl|usd', () => {
      expect(valido(CheckoutTierBody, { toTierId: 't1', currency: 'eur' })).toBe(false);
    });
  });

  describe('PortalBody', () => {
    it('[controle] aceita vazio', () => {
      expect(valido(PortalBody, {})).toBe(true);
    });

    it('[controle] aceita returnUrl', () => {
      expect(valido(PortalBody, { returnUrl: 'http://x/y' })).toBe(true);
    });
  });

  describe('CheckoutBody (guest)', () => {
    it('[controle] aceita vazio (trial/logado)', () => {
      expect(valido(CheckoutBody, {})).toBe(true);
    });

    it('[controle] aceita email', () => {
      expect(valido(CheckoutBody, { email: 'aluno@example.com' })).toBe(true);
    });
  });

  describe('CancelBody / ReactivateBody', () => {
    it('[controle] aceitam vazios', () => {
      expect(valido(CancelBody, {})).toBe(true);
      expect(valido(ReactivateBody, {})).toBe(true);
    });
  });

  describe('CreateOfferBody', () => {
    it('[controle] aceita nome + preço', () => {
      expect(valido(CreateOfferBody, { name: 'Mensal', price: 100 })).toBe(true);
    });

    it.each([
      ['sem name', { price: 100 }],
      ['name vazio', { name: '', price: 100 }],
      ['name acima de 100', { name: 'x'.repeat(101), price: 100 }],
      ['sem price', { name: 'Mensal' }],
      ['price negativo', { name: 'Mensal', price: -1 }],
      ['price acima do teto', { name: 'Mensal', price: 20000 }],
      ['descrição acima de 500', { name: 'Mensal', price: 100, description: 'x'.repeat(501) }],
    ])('rejeita %s', (_rotulo, body) => {
      expect(valido(CreateOfferBody, body)).toBe(false);
    });
  });

  describe('UpdateOfferBody', () => {
    it('[controle] aceita vazio (PATCH parcial)', () => {
      expect(valido(UpdateOfferBody, {})).toBe(true);
    });

    it('[controle] aceita isActive', () => {
      expect(valido(UpdateOfferBody, { isActive: false })).toBe(true);
    });

    it('rejeita price negativo', () => {
      expect(valido(UpdateOfferBody, { price: -1 })).toBe(false);
    });
  });

  describe('GrantOrRevokeBody', () => {
    it('[controle] aceita action grant', () => {
      expect(valido(GrantOrRevokeBody, { action: 'grant' })).toBe(true);
    });

    it('[controle] aceita action revoke', () => {
      expect(valido(GrantOrRevokeBody, { action: 'revoke' })).toBe(true);
    });

    it.each([[{}], [{ action: 'outra' }], [{ action: '' }]])('rejeita %j', (body) => {
      expect(valido(GrantOrRevokeBody, body)).toBe(false);
    });
  });
});
