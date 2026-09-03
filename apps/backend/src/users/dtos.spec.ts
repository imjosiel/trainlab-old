import { plainToInstance } from 'class-transformer';
import { validateSync, ValidationError } from 'class-validator';

import { UpdateOwnProfileBody } from './dtos';

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
 * Fatia 36 (D121) — RED. Profile próprio.
 *
 * `role` NÃO tem IsIn de propósito: papel fora da lista responde 200 sem
 * alterar nada (D30). O DTO só garante string quando presente.
 */
describe('DTO de users/profile (fatia 36)', () => {
  it('[controle] aceita vazio', () => {
    expect(valido(UpdateOwnProfileBody, {})).toBe(true);
  });

  it('[controle] aceita os seis campos', () => {
    expect(
      valido(UpdateOwnProfileBody, {
        username: 'ana',
        bio: 'oi',
        isPublic: true,
        name: 'Ana',
        role: 'INDIVIDUAL',
        phone: '11988887777',
      }),
    ).toBe(true);
  });

  it('[controle] role fora da lista passa na FORMA (service ignora — D30)', () => {
    expect(valido(UpdateOwnProfileBody, { role: 'DONO' })).toBe(true);
  });

  it('rejeita username não-string', () => {
    expect(valido(UpdateOwnProfileBody, { username: 123 })).toBe(false);
  });
});
