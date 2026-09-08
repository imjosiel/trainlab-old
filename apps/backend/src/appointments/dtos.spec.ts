import { plainToInstance } from 'class-transformer';
import { validateSync, ValidationError } from 'class-validator';

import {
  CreateAppointmentBody,
  CreateBlockedSlotBody,
  UpdateAppointmentBody,
  UpdateScheduleConfigBody,
} from './dtos';

function achatar(erros: ValidationError[]): string[] {
  return erros.flatMap((e) => [
    ...Object.values(e.constraints ?? {}),
    ...achatar(e.children ?? []),
  ]);
}

function errosDe<T extends object>(cls: new () => T, plain: unknown): string[] {
  return achatar(validateSync(plainToInstance(cls, plain), { whitelist: true }));
}

function valido<T extends object>(cls: new () => T, plain: unknown): boolean {
  return errosDe(cls, plain).length === 0;
}

/**
 * Fatia 30b (D104) — RED. Appointments.
 *
 * DTO valida FORMA; regra que precisa de banco (aluno é meu? data válida?)
 * fica no service (D104). Faixas portadas dos validators do service.
 */
describe('DTOs de appointments (fatia 30b)', () => {
  describe('CreateAppointmentBody', () => {
    it('[controle] aceita mínimo válido', () => {
      expect(
        valido(CreateAppointmentBody, {
          title: 'Treino',
          scheduledAt: '2026-09-03T10:00:00.000Z',
          studentId: 'stu-1',
        }),
      ).toBe(true);
    });

    it.each([
      ['sem title', { scheduledAt: '2026-09-03T10:00:00.000Z', studentId: 's' }],
      ['title vazio', { title: '', scheduledAt: '2026-09-03T10:00:00.000Z', studentId: 's' }],
      ['title acima de 150', { title: 'x'.repeat(151), scheduledAt: '2026-09-03T10:00:00.000Z', studentId: 's' }],
      ['sem scheduledAt', { title: 'T', studentId: 's' }],
      ['scheduledAt inválido', { title: 'T', scheduledAt: 'ontem', studentId: 's' }],
    ])('rejeita %s', (_rotulo, body) => {
      expect(valido(CreateAppointmentBody, body)).toBe(false);
    });

    it('[controle] sem participante passa na FORMA (service exige studentId ou athleteId)', () => {
      expect(
        valido(CreateAppointmentBody, { title: 'T', scheduledAt: '2026-09-03T10:00:00.000Z' }),
      ).toBe(true);
    });
  });

  describe('UpdateAppointmentBody', () => {
    it('[controle] aceita vazio (PATCH parcial)', () => {
      expect(valido(UpdateAppointmentBody, {})).toBe(true);
    });

    it('[controle] aceita action generate-link', () => {
      expect(valido(UpdateAppointmentBody, { action: 'generate-link' })).toBe(true);
    });

    it('rejeita status fora da lista', () => {
      expect(valido(UpdateAppointmentBody, { status: 'VOANDO' })).toBe(false);
    });

    it('rejeita action fora da lista', () => {
      expect(valido(UpdateAppointmentBody, { action: 'explodir' })).toBe(false);
    });
  });

  describe('CreateBlockedSlotBody', () => {
    it('[controle] aceita intervalo válido', () => {
      expect(
        valido(CreateBlockedSlotBody, {
          startTime: '2026-09-03T10:00:00.000Z',
          endTime: '2026-09-03T11:00:00.000Z',
        }),
      ).toBe(true);
    });

    it.each([
      ['sem startTime', { endTime: '2026-09-03T11:00:00.000Z' }],
      ['sem endTime', { startTime: '2026-09-03T10:00:00.000Z' }],
      ['data inválida', { startTime: 'x', endTime: 'y' }],
    ])('rejeita %s', (_rotulo, body) => {
      expect(valido(CreateBlockedSlotBody, body)).toBe(false);
    });
  });

  describe('UpdateScheduleConfigBody', () => {
    it('[controle] aceita vazio', () => {
      expect(valido(UpdateScheduleConfigBody, {})).toBe(true);
    });

    it('[controle] aceita expediente válido', () => {
      expect(
        valido(UpdateScheduleConfigBody, { workStartHour: 7, workEndHour: 22, workDays: [1, 2, 3] }),
      ).toBe(true);
    });

    it.each([
      ['hora acima de 23', { workStartHour: 24 }],
      ['hora negativa', { workEndHour: -1 }],
      ['hora fracionária', { workStartHour: 7.5 }],
      ['hora string (virava 0 no legado — A58)', { workStartHour: '' }],
      ['workDays não-lista', { workDays: 1 }],
    ])('rejeita %s', (_rotulo, body) => {
      expect(valido(UpdateScheduleConfigBody, body)).toBe(false);
    });

    it('[controle] workDays passa como array (itens validados no service)', () => {
      expect(valido(UpdateScheduleConfigBody, { workDays: [1, 2, 3] })).toBe(true);
    });
  });
});
