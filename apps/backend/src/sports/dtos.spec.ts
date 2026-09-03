import { plainToInstance } from 'class-transformer';
import { validateSync, ValidationError } from 'class-validator';

import { CreateSportInput, UpdateSportInput } from './dtos';

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
 * Fatia 30c (D104) — RED. Sports.
 *
 * Limites de slug divergem entre criar (50) e editar (30) no legado (A4) —
 * portado fielmente.
 */
describe('DTOs de sports (fatia 30c)', () => {
  describe('CreateSportInput', () => {
    it('[controle] aceita name + slug', () => {
      expect(valido(CreateSportInput, { name: 'Futebol', slug: 'soccer' })).toBe(true);
    });

    it.each([
      ['sem name', { slug: 'soccer' }],
      ['sem slug', { name: 'Futebol' }],
      ['slug maiúsculo', { name: 'F', slug: 'Soccer' }],
      ['slug com espaço', { name: 'F', slug: 'meu esporte' }],
      ['slug acima de 50', { name: 'F', slug: 'x'.repeat(51) }],
    ])('rejeita %s', (_rotulo, body) => {
      expect(valido(CreateSportInput, body)).toBe(false);
    });
  });

  describe('UpdateSportInput', () => {
    it('[controle] aceita vazio', () => {
      expect(valido(UpdateSportInput, {})).toBe(true);
    });

    it('[controle] aceita name', () => {
      expect(valido(UpdateSportInput, { name: 'Novo' })).toBe(true);
    });

    it('rejeita slug acima de 30 (limite do PATCH no legado — A4)', () => {
      expect(valido(UpdateSportInput, { slug: 'x'.repeat(31) })).toBe(false);
    });
  });
});
