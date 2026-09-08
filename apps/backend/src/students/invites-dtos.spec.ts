import { plainToInstance } from 'class-transformer';
import { validateSync, ValidationError } from 'class-validator';

import { CreateNoteBody, InviteEmailBody, InviteTokenBody } from './dtos';

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
 * Fatia 36 (D122) — RED. Invites + notes.
 */
describe('DTOs de invites/notes (fatia 36)', () => {
  describe('InviteEmailBody', () => {
    it('[controle] aceita email', () => {
      expect(valido(InviteEmailBody, { email: 'a@e.com' })).toBe(true);
    });

    it.each([[{}], [{ email: '' }], [{ email: 'nao-email' }]])('rejeita %j', (body) => {
      expect(valido(InviteEmailBody, body)).toBe(false);
    });
  });

  describe('InviteTokenBody', () => {
    it('[controle] aceita token', () => {
      expect(valido(InviteTokenBody, { token: 'tok-1' })).toBe(true);
    });

    it.each([[{}], [{ token: '' }]])('rejeita %j', (body) => {
      expect(valido(InviteTokenBody, body)).toBe(false);
    });
  });

  describe('CreateNoteBody', () => {
    it('[controle] aceita conteúdo', () => {
      expect(valido(CreateNoteBody, { content: 'nota' })).toBe(true);
    });

    it.each([[{}], [{ content: '' }], [{ content: 'x'.repeat(2001) }]])('rejeita %j', (body) => {
      expect(valido(CreateNoteBody, body)).toBe(false);
    });
  });
});
