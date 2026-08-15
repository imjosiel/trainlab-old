import { inteiroNaFaixa, numeroNaFaixa } from './numeros';

/**
 * Os dois helpers que três achados pediram: A58 (fatia 13) e A68 (fatia 14).
 *
 * Medido contra o servidor rodando, antes de cada correção:
 *
 *     workStartHour=""     -> HTTP 200  e o banco gravou 0
 *     minPrice="abc"       -> NaN chega no Prisma
 *     price=-100           -> gravado
 */
describe('inteiroNaFaixa (D65, corrige A58)', () => {
  describe('rejeita o que não é inteiro — a parte que faltava no legado', () => {
    it.each([
      ['string vazia — virava 0 e gravava meia-noite', ''],
      ['string não numérica — virava NaN e 500', 'abc'],
      ['string numérica — a conversão que a aceita é a que aceita a vazia', '10'],
      ['array vazio — Number([]) é 0', []],
      ['objeto', {}],
      ['null', null],
      ['undefined', undefined],
      ['NaN', NaN],
      ['fracionário', 10.5],
      ['booleano', true],
    ])('%s', (_rotulo, valor) => {
      expect(inteiroNaFaixa(valor, 0, 23)).toBe(false);
    });
  });

  describe('faixa', () => {
    it.each([
      ['abaixo do mínimo', -1],
      ['acima do máximo', 24],
      ['bem acima', 99],
    ])('rejeita %s', (_rotulo, valor) => {
      expect(inteiroNaFaixa(valor, 0, 23)).toBe(false);
    });

    // CONTROLE. Sem estes, um helper `() => false` passaria em tudo acima.
    it.each([
      ['limite inferior', 0],
      ['meio', 10],
      ['limite superior', 23],
    ])('[controle] aceita %s', (_rotulo, valor) => {
      expect(inteiroNaFaixa(valor, 0, 23)).toBe(true);
    });
  });

  it('serve para dia da semana com a mesma regra (0–6)', () => {
    expect(inteiroNaFaixa(0, 0, 6)).toBe(true);
    expect(inteiroNaFaixa(6, 0, 6)).toBe(true);
    expect(inteiroNaFaixa(7, 0, 6)).toBe(false);
    expect(inteiroNaFaixa('1', 0, 6)).toBe(false);
  });
});

describe('numeroNaFaixa (D71, corrige A68)', () => {
  describe('rejeita o que não é número finito', () => {
    it.each([
      ['string vazia', ''],
      ['string não numérica — parseFloat dava NaN e o Prisma dava 500', 'abc'],
      ['string numérica', '10.5'],
      ['array vazio', []],
      ['objeto', {}],
      ['null', null],
      ['undefined', undefined],
      ['NaN', NaN],
      ['Infinity', Infinity],
      ['-Infinity', -Infinity],
      ['booleano', true],
    ])('%s', (_rotulo, valor) => {
      expect(numeroNaFaixa(valor, 0, 1)).toBe(false);
    });
  });

  describe('faixa — inclui os limites', () => {
    it('rejeita abaixo do mínimo', () => {
      expect(numeroNaFaixa(-0.01, 0, 1)).toBe(false);
    });

    it('rejeita acima do máximo', () => {
      expect(numeroNaFaixa(1.01, 0, 1)).toBe(false);
    });

    // CONTROLE do bloco acima.
    it.each([
      ['limite inferior', 0],
      ['fracionário no meio', 0.5],
      ['limite superior', 1],
    ])('[controle] aceita %s', (_rotulo, valor) => {
      expect(numeroNaFaixa(valor, 0, 1)).toBe(true);
    });
  });

  describe('dinheiro — A68', () => {
    // O legado aceitava `price: -100`, enquanto validava commissionRate em 0..1.
    it('rejeita valor monetário negativo', () => {
      expect(numeroNaFaixa(-100, 0, Number.MAX_SAFE_INTEGER)).toBe(false);
      expect(numeroNaFaixa(-0.01, 0, Number.MAX_SAFE_INTEGER)).toBe(false);
    });

    it('[controle] aceita zero e valor com centavos', () => {
      expect(numeroNaFaixa(0, 0, Number.MAX_SAFE_INTEGER)).toBe(true);
      expect(numeroNaFaixa(99.9, 0, Number.MAX_SAFE_INTEGER)).toBe(true);
    });
  });

  it('difere do irmão exatamente no fracionário', () => {
    expect(inteiroNaFaixa(10.5, 0, 100)).toBe(false);
    expect(numeroNaFaixa(10.5, 0, 100)).toBe(true);
  });
});
