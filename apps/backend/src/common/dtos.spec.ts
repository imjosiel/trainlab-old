import { plainToInstance } from 'class-transformer';
import { validateSync, ValidationError } from 'class-validator';

import {
  AdminSettingsBody,
  OnboardingBody,
  PartnerSettingsBody,
  SaasCheckoutBody,
  TierRequestBody,
  UploadPresignBody,
} from './dtos';

function achatar(erros: ValidationError[]): string[] {
  // Erro nested mora em `children`, não em `constraints` do pai (lição da
  // fatia 28: sem recursão, filho inválido passa como válido em silêncio).
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
 * Fatia 27 (SDD: Tampering) — RED.
 *
 * Seis corpos hoje `body: any` no núcleo quente. Cada DTO tem o par
 * positivo+negativo: sem o controle positivo, um DTO que rejeita tudo
 * "passaria" nos testes de rejeição (mesma armadilha documentada em
 * `numeros.spec.ts`).
 */
describe('DTOs da fatia 27', () => {
  describe('OnboardingBody', () => {
    it.each([['PROFESSIONAL'], ['INDIVIDUAL'], ['CLIENT'], ['PARTNER_B2B'], ['AFFILIATE']])(
      '[controle] aceita role %s',
      (role) => {
        expect(valido(OnboardingBody, { role })).toBe(true);
      },
    );

    it.each([
      ['ausente', {}],
      ['fora da lista', { role: 'ADMIN' }],
      ['BOTH depreciado', { role: 'BOTH' }],
      ['vazio', { role: '' }],
    ])('rejeita role %s', (_rotulo, body) => {
      expect(valido(OnboardingBody, body)).toBe(false);
    });
  });

  describe('UploadPresignBody', () => {
    const umArquivo = { field: 'manifest', name: 'master.m3u8', type: 'application/x-mpegURL' };

    it('[controle] aceita lista com 1 arquivo válido', () => {
      expect(valido(UploadPresignBody, { files: [umArquivo] })).toBe(true);
    });

    it.each([
      ['ausente', {}],
      ['vazia', { files: [] }],
      ['não é lista', { files: 'x' }],
      ['21 arquivos (acima do teto de 20)', { files: Array.from({ length: 21 }, () => umArquivo) }],
    ])('rejeita files %s', (_rotulo, body) => {
      expect(valido(UploadPresignBody, body)).toBe(false);
    });
  });

  describe('TierRequestBody', () => {
    it('[controle] aceita toTierId presente', () => {
      expect(valido(TierRequestBody, { toTierId: 'tier-1' })).toBe(true);
    });

    it.each([[{}], [{ toTierId: '' }], [{ toTierId: 123 }]])(
      'rejeita %j',
      (body) => {
        expect(valido(TierRequestBody, body)).toBe(false);
      },
    );
  });

  describe('SaasCheckoutBody', () => {
    it('[controle] aceita tierId + originUrl', () => {
      expect(
        valido(SaasCheckoutBody, { tierId: 'tier-1', originUrl: 'http://localhost:3000/x' }),
      ).toBe(true);
    });

    it.each([
      ['sem tierId', { originUrl: 'http://localhost:3000/x' }],
      ['sem originUrl', { tierId: 'tier-1' }],
      ['vazio', {}],
    ])('rejeita %s', (_rotulo, body) => {
      expect(valido(SaasCheckoutBody, body)).toBe(false);
    });
  });

  describe('AdminSettingsBody', () => {
    it('[controle] aceita corpo vazio (PATCH parcial)', () => {
      expect(valido(AdminSettingsBody, {})).toBe(true);
    });

    it('rejeita aiProvider fora de groq|gemini', () => {
      expect(valido(AdminSettingsBody, { aiProvider: 'outro' })).toBe(false);
    });

    it('[controle] aceita aiProvider groq', () => {
      expect(valido(AdminSettingsBody, { aiProvider: 'groq' })).toBe(true);
    });
  });

  describe('PartnerSettingsBody', () => {
    it('[controle] aceita allowTestMode booleano', () => {
      expect(valido(PartnerSettingsBody, { allowTestMode: true })).toBe(true);
    });

    it.each([[{}], [{ allowTestMode: 'sim' }]])('rejeita %j', (body) => {
      expect(valido(PartnerSettingsBody, body)).toBe(false);
    });
  });
});
