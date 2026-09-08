import { plainToInstance } from 'class-transformer';
import { validateSync, ValidationError } from 'class-validator';

import {
  AdminPartnerActionBody,
  AdminUsersActionBody,
  AdminUsersQuery,
  AffiliatesReservedBody,
  AuditLogsQuery,
  PlatformFinanceBody,
  ProfileQuery,
  ProfileUpsertBody,
  PusherAuthBody,
  ReportExpensesBody,
  SaaSTierBody,
  SaaSTierPatchBody,
  StripeConnectRemoveBody,
  VideoProcessorBody,
} from './dtos-admin';

function achatar(erros: ValidationError[]): string[] {
  // Erro nested mora em `children`, não em `constraints` do pai — sem
  // recursão, um filho inválido passa como válido (foi o que aconteceu aqui:
  // 46/48 com os dois casos nested passando calados).
  return erros.flatMap((e) => [
    ...Object.values(e.constraints ?? {}),
    ...achatar(e.children ?? []),
  ]);
}

function errosDe<T extends object>(cls: new () => T, plain: unknown): string[] {
  const dto = plainToInstance(cls, plain);
  return achatar(validateSync(dto, { whitelist: true }));
}

function valido<T extends object>(cls: new () => T, plain: unknown): boolean {
  return errosDe(cls, plain).length === 0;
}

/**
 * Fatia 28 (SDD: Tampering + Elevation) — RED.
 *
 * Par positivo+negativo por DTO: sem o controle positivo, um DTO que rejeita
 * tudo "passaria" nos testes de rejeição (padrão `numeros.spec.ts`).
 */
describe('DTOs da fatia 28 (admin + profile + realtime)', () => {
  describe('AffiliatesReservedBody', () => {
    it('[controle] aceita earningIds + release', () => {
      expect(valido(AffiliatesReservedBody, { earningIds: ['e1'], action: 'release' })).toBe(true);
    });

    it.each([
      ['sem earningIds', { action: 'release' }],
      ['vazio', { earningIds: [], action: 'release' }],
      ['ação fora da lista', { earningIds: ['e1'], action: 'pagar' }],
      ['sem ação', { earningIds: ['e1'] }],
    ])('rejeita %s', (_rotulo, body) => {
      expect(valido(AffiliatesReservedBody, body)).toBe(false);
    });
  });

  describe('AdminUsersActionBody', () => {
    it('[controle] aceita toggle_admin', () => {
      expect(valido(AdminUsersActionBody, { action: 'toggle_admin' })).toBe(true);
    });

    it('[controle] aceita grant_test_b2b com offerId', () => {
      expect(valido(AdminUsersActionBody, { action: 'grant_test_b2b', offerId: 'o1' })).toBe(
        true,
      );
    });

    it.each([
      ['ação desconhecida', { action: 'virar_dono' }],
      ['sem ação', {}],
      ['ação vazia', { action: '' }],
    ])('rejeita %s', (_rotulo, body) => {
      expect(valido(AdminUsersActionBody, body)).toBe(false);
    });
  });

  describe('AdminPartnerActionBody', () => {
    it('[controle] aceita approve', () => {
      expect(valido(AdminPartnerActionBody, { action: 'approve' })).toBe(true);
    });

    it.each([
      ['ação desconhecida', { action: 'excluir' }],
      ['sem ação', {}],
    ])('rejeita %s', (_rotulo, body) => {
      expect(valido(AdminPartnerActionBody, body)).toBe(false);
    });
  });

  describe('PlatformFinanceBody', () => {
    it('[controle] aceita corpo vazio (PUT parcial)', () => {
      expect(valido(PlatformFinanceBody, {})).toBe(true);
    });

    it('[controle] aceita taxas dentro da faixa', () => {
      expect(
        valido(PlatformFinanceBody, {
          stripePercentFee: 0.0399,
          stripeFixedFeeInCents: 39,
          usdToBrlRate: 5.85,
          distributionRules: [
            { label: 'A', percentage: 0.4 },
            { label: 'B', percentage: 0.6 },
          ],
        }),
      ).toBe(true);
    });

    it.each([
      ['percentual acima de 0.1', { stripePercentFee: 0.5 }],
      ['fixo acima de 200', { stripeFixedFeeInCents: 500 }],
      ['câmbio abaixo de 1', { usdToBrlRate: 0.5 }],
      ['21 regras (acima do teto de 20)', { distributionRules: Array.from({ length: 21 }, () => ({ percentage: 0.05 })) }],
      ['percentual de regra acima de 1', { distributionRules: [{ percentage: 2 }] }],
    ])('rejeita %s', (_rotulo, body) => {
      expect(valido(PlatformFinanceBody, body)).toBe(false);
    });
  });

  describe('ReportExpensesBody', () => {
    it('[controle] aceita corpo vazio', () => {
      expect(valido(ReportExpensesBody, {})).toBe(true);
    });

    it('[controle] aceita 1 despesa', () => {
      expect(valido(ReportExpensesBody, { expenses: [{ category: 'x', amount: 10 }] })).toBe(
        true,
      );
    });

    it('rejeita 101 despesas (acima do teto de 100)', () => {
      expect(
        valido(ReportExpensesBody, { expenses: Array.from({ length: 101 }, () => ({})) }),
      ).toBe(false);
    });
  });

  describe('SaaSTierBody / SaaSTierPatchBody', () => {
    it('[controle] aceita create completo', () => {
      expect(valido(SaaSTierBody, { name: 'Base', price: 97, description: 'd' })).toBe(true);
    });

    it.each([
      ['sem name', { price: 97, description: 'd' }],
      ['sem price', { name: 'Base', description: 'd' }],
      ['preço negativo', { name: 'Base', price: -1, description: 'd' }],
      ['preço acima do teto', { name: 'Base', price: 20000, description: 'd' }],
    ])('create rejeita %s', (_rotulo, body) => {
      expect(valido(SaaSTierBody, body)).toBe(false);
    });

    it('[controle] patch aceita corpo vazio', () => {
      expect(valido(SaaSTierPatchBody, {})).toBe(true);
    });

    it('patch rejeita preço negativo', () => {
      expect(valido(SaaSTierPatchBody, { price: -5 })).toBe(false);
    });
  });

  describe('StripeConnectRemoveBody', () => {
    it('[controle] aceita accountId', () => {
      expect(valido(StripeConnectRemoveBody, { accountId: 'acct_1' })).toBe(true);
    });

    it.each([[{}], [{ accountId: '' }], [{ accountId: 123 }]])('rejeita %j', (body) => {
      expect(valido(StripeConnectRemoveBody, body)).toBe(false);
    });
  });

  describe('VideoProcessorBody', () => {
    it('[controle] aceita id + progresso', () => {
      expect(valido(VideoProcessorBody, { id: 'ex-1', processingProgress: 50 })).toBe(true);
    });

    it.each([
      ['sem id', { processingProgress: 50 }],
      ['progresso acima de 100', { id: 'ex-1', processingProgress: 101 }],
      ['progresso negativo', { id: 'ex-1', processingProgress: -1 }],
    ])('rejeita %s', (_rotulo, body) => {
      expect(valido(VideoProcessorBody, body)).toBe(false);
    });
  });

  describe('ProfileQuery / ProfileUpsertBody', () => {
    it('[controle] query aceita vazia', () => {
      expect(valido(ProfileQuery, {})).toBe(true);
    });

    it('[controle] upsert aceita 1 esporte', () => {
      expect(valido(ProfileUpsertBody, { sports: [{ sportId: 's1' }] })).toBe(true);
    });

    it.each([
      ['sem sports', {}],
      ['vazio', { sports: [] }],
      ['6 esportes (acima do teto de 5)', { sports: Array.from({ length: 6 }, () => ({ sportId: 's' })) }],
      ['sem sportId', { sports: [{}] }],
    ])('upsert rejeita %s', (_rotulo, body) => {
      expect(valido(ProfileUpsertBody, body)).toBe(false);
    });
  });

  describe('PusherAuthBody', () => {
    it('[controle] aceita par socket_id/channel_name', () => {
      expect(valido(PusherAuthBody, { socket_id: 's', channel_name: 'c' })).toBe(true);
    });

    it('[controle] aceita par camelCase', () => {
      expect(valido(PusherAuthBody, { socketId: 's', channel: 'c' })).toBe(true);
    });

    it('[controle] aceita corpo vazio (service responde Missing params)', () => {
      expect(valido(PusherAuthBody, {})).toBe(true);
    });
  });

  describe('AuditLogsQuery / AdminUsersQuery', () => {
    it('[controle] aceitam vazias', () => {
      expect(valido(AuditLogsQuery, {})).toBe(true);
      expect(valido(AdminUsersQuery, {})).toBe(true);
    });
  });
});
