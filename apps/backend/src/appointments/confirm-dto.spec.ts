import { plainToInstance } from 'class-transformer';
import { validateSync, ValidationError } from 'class-validator';

import { ConfirmAppointmentBody } from './confirm-dto';

function valido(plain: unknown): boolean {
  const dto = plainToInstance(ConfirmAppointmentBody, plain);
  const erros: string[] = [];
  const achatar = (lista: ValidationError[]): void => {
    for (const e of lista) {
      erros.push(...Object.values(e.constraints ?? {}));
      achatar(e.children ?? []);
    }
  };
  achatar(validateSync(dto, { whitelist: true }));
  return erros.length === 0;
}

/**
 * Fatia 36 — RED. Confirm do link mágico.
 */
describe('ConfirmAppointmentBody (fatia 36)', () => {
  it('[controle] aceita vazio', () => {
    expect(valido({})).toBe(true);
  });

  it('[controle] aceita confirm e cancel', () => {
    expect(valido({ action: 'confirm' })).toBe(true);
    expect(valido({ action: 'cancel' })).toBe(true);
  });

  it('rejeita ação fora da lista', () => {
    expect(valido({ action: 'explodir' })).toBe(false);
  });
});
