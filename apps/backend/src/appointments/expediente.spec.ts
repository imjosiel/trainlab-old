import { inteiroNaFaixa } from './expediente';

/**
 * D65 — o helper que o A58 provou faltar.
 *
 * O legado validava hora só por faixa (`v < 0 || v > 23`). Com string, as duas
 * comparações são `false` e o valor passa. Medido contra o servidor rodando:
 *
 *     workStartHour="abc"  -> HTTP 500  banco=7
 *     workStartHour=""     -> HTTP 200  banco=0    <-- corrupção silenciosa
 *     workStartHour=99     -> HTTP 400             <-- controle: a validação roda
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

  describe('faixa — o que o legado já fazia certo', () => {
    it.each([
      ['abaixo do mínimo', -1],
      ['acima do máximo', 24],
      ['bem acima', 99],
    ])('rejeita %s', (_rotulo, valor) => {
      expect(inteiroNaFaixa(valor, 0, 23)).toBe(false);
    });

    // CONTROLE. Sem estes, "rejeita tudo" passaria em todos os casos acima e o
    // helper poderia ser `() => false`.
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
