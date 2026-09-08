import { plainToInstance } from 'class-transformer';
import { validateSync, ValidationError } from 'class-validator';

import { CreateStudentBody } from './dtos';

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
 * Fatia 30b (D104) — RED. Students create (o profile update já tem DTO na
 * fatia 28; aqui só o `CreateStudentBody`, que ainda é interface pura).
 */
describe('DTOs de students (fatia 30b)', () => {
  describe('CreateStudentBody', () => {
    it('[controle] aceita só nome', () => {
      expect(valido(CreateStudentBody, { name: 'Aluno' })).toBe(true);
    });

    it('[controle] aceita nome + email', () => {
      expect(valido(CreateStudentBody, { name: 'Aluno', email: 'aluno@example.com' })).toBe(
        true,
      );
    });

    it.each([
      ['sem name', {}],
      ['name vazio', { name: '' }],
      ['name acima de 100', { name: 'x'.repeat(101) }],
      ['email inválido', { name: 'Aluno', email: 'nao-email' }],
    ])('rejeita %s', (_rotulo, body) => {
      expect(valido(CreateStudentBody, body)).toBe(false);
    });
  });
});
