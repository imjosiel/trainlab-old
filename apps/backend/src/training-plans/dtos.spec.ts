import { plainToInstance } from 'class-transformer';
import { validateSync, ValidationError } from 'class-validator';

import { CreatePlanBody, CreateSessionBody, EditSessionBody, UpdatePlanBody, UpdateSessionBody } from './dtos';

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
 * Fatia 30b (D104) — RED. Training plans + sessions.
 */
describe('DTOs de training-plans (fatia 30b)', () => {
  describe('UpdatePlanBody', () => {
    it('[controle] aceita vazio', () => {
      expect(valido(UpdatePlanBody, {})).toBe(true);
    });

    it('[controle] aceita status válido', () => {
      expect(valido(UpdatePlanBody, { status: 'APPROVED' })).toBe(true);
    });

    it('rejeita status fora da lista', () => {
      expect(valido(UpdatePlanBody, { status: 'VOANDO' })).toBe(false);
    });
  });

  describe('CreatePlanBody', () => {
    it('[controle] aceita vazio (defaults no service)', () => {
      expect(valido(CreatePlanBody, {})).toBe(true);
    });

    it('[controle] aceita studentId + duration', () => {
      expect(valido(CreatePlanBody, { studentId: 's1', duration: 30 })).toBe(true);
    });
  });

  describe('CreateSessionBody', () => {
    it('[controle] aceita vazio', () => {
      expect(valido(CreateSessionBody, {})).toBe(true);
    });

    it('[controle] aceita title + day', () => {
      expect(valido(CreateSessionBody, { title: 'S1', day: 1 })).toBe(true);
    });
  });

  describe('UpdateSessionBody', () => {
    it('[controle] aceita vazio', () => {
      expect(valido(UpdateSessionBody, {})).toBe(true);
    });

    it('[controle] aceita completed + rating 5', () => {
      expect(valido(UpdateSessionBody, { completed: true, athleteFeedbackRating: 5 })).toBe(true);
    });

    it('rejeita rating acima de 5', () => {
      expect(valido(UpdateSessionBody, { athleteFeedbackRating: 6 })).toBe(false);
    });

    it('rejeita rating abaixo de 1', () => {
      expect(valido(UpdateSessionBody, { athleteFeedbackRating: 0 })).toBe(false);
    });
  });

  describe('EditSessionBody', () => {
    it('[controle] aceita vazio', () => {
      expect(valido(EditSessionBody, {})).toBe(true);
    });

    it('[controle] aceita title', () => {
      expect(valido(EditSessionBody, { title: 'Novo' })).toBe(true);
    });
  });
});
