import { plainToInstance } from 'class-transformer';
import { validateSync, ValidationError } from 'class-validator';

import { CreateConversationBody, SendMessageBody } from './dtos';

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
 * Fatia 30c (D104) — RED. Messages.
 */
describe('DTOs de messages (fatia 30c)', () => {
  describe('CreateConversationBody', () => {
    it('[controle] aceita os dois ids', () => {
      expect(valido(CreateConversationBody, { trainerId: 't1', studentId: 's1' })).toBe(true);
    });

    it.each([
      ['sem trainerId', { studentId: 's1' }],
      ['sem studentId', { trainerId: 't1' }],
      ['vazio', {}],
    ])('rejeita %s', (_rotulo, body) => {
      expect(valido(CreateConversationBody, body)).toBe(false);
    });
  });

  describe('SendMessageBody', () => {
    it('[controle] aceita conteúdo', () => {
      expect(valido(SendMessageBody, { content: 'oi' })).toBe(true);
    });

    it.each([
      ['vazio', {}],
      ['acima de 5000', { content: 'x'.repeat(5001) }],
    ])('rejeita %s', (_rotulo, body) => {
      expect(valido(SendMessageBody, body)).toBe(false);
    });

    it('[controle] branco passa na FORMA (service mede o trimado e rejeita — A54)', () => {
      expect(valido(SendMessageBody, { content: '   ' })).toBe(true);
    });
  });
});
