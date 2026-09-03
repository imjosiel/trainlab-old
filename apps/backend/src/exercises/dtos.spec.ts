import { plainToInstance } from 'class-transformer';
import { validateSync, ValidationError } from 'class-validator';

import { AtualizarExercicioBody, CriarExercicioBody } from './dtos';

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
 * Fatia 30c (D104) — RED. Exercises.
 */
describe('DTOs de exercises (fatia 30c)', () => {
  describe('CriarExercicioBody', () => {
    it('[controle] aceita mínimo válido', () => {
      expect(
        valido(CriarExercicioBody, {
          name: 'Agachamento',
          description: 'Desça até 90 graus.',
          category: 'Físico',
          difficulty: 'Iniciante',
        }),
      ).toBe(true);
    });

    it.each([
      ['sem name', { description: 'd', category: 'Físico', difficulty: 'Iniciante' }],
      ['sem description', { name: 'n', category: 'Físico', difficulty: 'Iniciante' }],
      ['sem category', { name: 'n', description: 'd', difficulty: 'Iniciante' }],
      ['sem difficulty', { name: 'n', description: 'd', category: 'Físico' }],
      ['name acima de 100', { name: 'x'.repeat(101), description: 'd', category: 'Físico', difficulty: 'Iniciante' }],
      ['categoria fora da lista', { name: 'n', description: 'd', category: 'Dança', difficulty: 'Iniciante' }],
      ['dificuldade fora da lista', { name: 'n', description: 'd', category: 'Físico', difficulty: 'Lendário' }],
    ])('rejeita %s', (_rotulo, body) => {
      expect(valido(CriarExercicioBody, body)).toBe(false);
    });
  });

  describe('AtualizarExercicioBody', () => {
    it('[controle] aceita vazio (PUT parcial)', () => {
      expect(valido(AtualizarExercicioBody, {})).toBe(true);
    });

    it('[controle] aceita name', () => {
      expect(valido(AtualizarExercicioBody, { name: 'Novo' })).toBe(true);
    });

    it('rejeita categoria fora da lista', () => {
      expect(valido(AtualizarExercicioBody, { category: 'Dança' })).toBe(false);
    });
  });
});
