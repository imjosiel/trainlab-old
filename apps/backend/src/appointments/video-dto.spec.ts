import { plainToInstance } from 'class-transformer';
import { validateSync, ValidationError } from 'class-validator';

import { CreateVideoBody } from './video-dto';

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
 * Fatia 37 — RED. DTO de vídeo (forma; regra fica no service, D104).
 */
describe('CreateVideoBody (fatia 37 — RED)', () => {
  it('[controle] aceita vazio (auto)', () => {
    expect(valido(CreateVideoBody, {})).toBe(true);
  });

  it.each([['daily'], ['jitsi'], ['auto']])('[controle] aceita %s', (provider) => {
    expect(valido(CreateVideoBody, { provider })).toBe(true);
  });

  it('rejeita provider fora da lista', () => {
    expect(valido(CreateVideoBody, { provider: 'zoom' })).toBe(false);
  });
});
