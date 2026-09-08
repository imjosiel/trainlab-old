import { plainToInstance } from 'class-transformer';
import { validateSync, ValidationError } from 'class-validator';

import { DecidirTierRequestBody, ForcarTierBody } from './dtos';

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
 * Fatia 30d (D104) — RED. Tier-requests (DTOs inline viram classes).
 */
describe('DTOs de tier-requests (fatia 30d)', () => {
  describe('DecidirTierRequestBody', () => {
    it('[controle] aceita approve', () => {
      expect(valido(DecidirTierRequestBody, { action: 'approve' })).toBe(true);
    });

    it('[controle] aceita reject com note', () => {
      expect(valido(DecidirTierRequestBody, { action: 'reject', note: 'motivo' })).toBe(true);
    });

    it.each([[{}], [{ action: 'talvez' }], [{ action: '' }]])('rejeita %j', (body) => {
      expect(valido(DecidirTierRequestBody, body)).toBe(false);
    });
  });

  describe('ForcarTierBody', () => {
    it('[controle] aceita toTierId', () => {
      expect(valido(ForcarTierBody, { toTierId: 't1' })).toBe(true);
    });

    it.each([[{}], [{ toTierId: '' }]])('rejeita %j', (body) => {
      expect(valido(ForcarTierBody, body)).toBe(false);
    });
  });
});
