import { BadRequestException } from '@nestjs/common';

import {
  MSG_TELEFONE_INVALIDO,
  MSG_USERNAME_INVALIDO,
  nomeDoIdToken,
  normalizarTelefone,
  resolverPapeis,
  validarUsername,
} from './update-profile';

/** Lê o corpo da exceção: com objeto, `err.message` é genérico e não serve. */
function corpoDoErro(fn: () => unknown): unknown {
  try {
    fn();
  } catch (e) {
    return (e as BadRequestException).getResponse();
  }
  throw new Error('esperava exceção, não houve');
}

describe('validarUsername', () => {
  it.each([['abc'], ['a'.repeat(20)], ['___'], ['user_2026'], ['ABC'], ['999']])(
    '%s é válido',
    (username) => {
      expect(validarUsername(username)).toBe(username);
    },
  );

  it.each([
    ['dois caracteres', 'ab'],
    ['21 caracteres', 'a'.repeat(21)],
    ['hífen', 'joao-silva'],
    ['espaço', 'joao silva'],
    ['acento', 'josié'],
    ['ponto', 'joao.silva'],
    ['arroba', '@joao'],
    ['vazio', ''],
    ['undefined', undefined],
    ['null', null],
  ])('%s é rejeitado com a mensagem do legado', (_caso, entrada) => {
    expect(corpoDoErro(() => validarUsername(entrada))).toEqual({ error: MSG_USERNAME_INVALIDO });
  });

  /**
   * A fronteira que o `substring(0, 20)` morto do legado escondia (D33): como o
   * regex já barra 21, aquele corte nunca teve entrada em que agisse. Se alguém
   * afrouxar o regex sem reintroduzir um limite, é este par que acusa.
   */
  it('20 passa e 21 falha — nada trunca no meio', () => {
    expect(validarUsername('a'.repeat(20))).toHaveLength(20);
    expect(corpoDoErro(() => validarUsername('a'.repeat(21)))).toEqual({
      error: MSG_USERNAME_INVALIDO,
    });
  });
});

describe('normalizarTelefone', () => {
  it.each([
    ['11 dígitos', '11988887777', '(11) 98888-7777'],
    ['10 dígitos', '1133334444', '(11) 3333-4444'],
    ['já formatado', '(21) 99999-8888', '(21) 99999-8888'],
    ['com pontos e espaços', '11 9.8888-7777', '(11) 98888-7777'],
    ['com barras', '11/98888/7777', '(11) 98888-7777'],
  ])('%s → %s', (_caso, entrada, esperado) => {
    expect(normalizarTelefone(entrada)).toBe(esperado);
  });

  it.each([['null', null], ['vazio', ''], ['espaços', '   ']])('%s apaga o telefone', (_caso, v) => {
    expect(normalizarTelefone(v)).toBeNull();
  });

  /**
   * D44 — reversão explícita do A13. Lá eu recusei tratar `+55` por "ambiguidade
   * com o DDD 55". A ambiguidade não existe no comprimento: DDD 55 dá 10 ou 11
   * dígitos, com código do país dá 12 ou 13.
   *
   * O motivo concreto: o onboarding gravava `+55DDDNUMERO`, e essa validação
   * recusava o valor que a própria plataforma gravou (A25).
   */
  it.each([
    ['+55 com celular', '+55 (31) 98765-4321', '(31) 98765-4321'],
    ['+55 com fixo', '+55 (11) 3333-4444', '(11) 3333-4444'],
    ['55 sem o mais', '5511988887777', '(11) 98888-7777'],
    ['formato que o onboarding gravava', '+5511988887777', '(11) 98888-7777'],
  ])('%s → %s', (_caso, entrada, esperado) => {
    expect(normalizarTelefone(entrada)).toBe(esperado);
  });

  it('o 55 só é removido quando o comprimento indica código do país', () => {
    // 11 dígitos começando com 55 é DDD 55 legítimo (Santa Maria/RS) — fica.
    expect(normalizarTelefone('55988887777')).toBe('(55) 98888-7777');
    // 10 dígitos idem.
    expect(normalizarTelefone('5533334444')).toBe('(55) 3333-4444');
  });

  it.each([
    ['9 dígitos', '123456789'],
    ['12 dígitos que não começam com 55', '123456789012'],
    ['13 dígitos que não começam com 55', '1234567890123'],
    ['14 dígitos', '12345678901234'],
    ['sem dígito nenhum', 'abc'],
  ])('%s → 400 com a mensagem do legado', (_caso, entrada) => {
    expect(corpoDoErro(() => normalizarTelefone(entrada))).toEqual({
      error: MSG_TELEFONE_INVALIDO,
    });
  });

  it('a normalização é idempotente', () => {
    const uma = normalizarTelefone('11988887777');
    expect(normalizarTelefone(uma)).toBe(uma);
  });
});

describe('resolverPapeis', () => {
  it('troca o papel de produto', () => {
    expect(resolverPapeis(['INDIVIDUAL'], 'PROFESSIONAL')).toEqual(['PROFESSIONAL']);
  });

  // A razão de existir do filtro: papel concedido por admin não pode ser perdido
  // numa troca feita pelo próprio usuário — nem, principalmente, concedido.
  it.each([['PARTNER_B2B'], ['AFFILIATE']])('preserva %s concedido por admin', (concedido) => {
    const resultado = resolverPapeis(['INDIVIDUAL', concedido], 'CLIENT');
    expect(resultado).toContain(concedido);
    expect(resultado).toContain('CLIENT');
    expect(resultado).not.toContain('INDIVIDUAL');
  });

  it('não acumula papéis de produto ao trocar duas vezes', () => {
    const primeiro = resolverPapeis(['PENDING'], 'INDIVIDUAL')!;
    const segundo = resolverPapeis(primeiro, 'CLIENT')!;
    expect(segundo).toEqual(['CLIENT']);
  });

  it('não duplica quando o papel pedido já é o atual', () => {
    expect(resolverPapeis(['INDIVIDUAL'], 'INDIVIDUAL')).toEqual(['INDIVIDUAL']);
  });

  // D30 — peculiaridade preservada de propósito: `undefined` significa "não
  // atualiza", e o PATCH responde 200 sem erro.
  it.each([['ADMIN'], ['MODERATOR'], ['PARTNER_B2B'], ['AFFILIATE'], ['BOTH'], ['SUPER_ADMIN'], ['']])(
    'papel %s não é escolhível → undefined, sem lançar',
    (papel) => {
      expect(resolverPapeis(['INDIVIDUAL'], papel)).toBeUndefined();
    },
  );

  // O eixo de privilégio (D32): ADMIN/MODERATOR vivem em systemRoles, que esta
  // função nem recebe. Aqui só se confirma que eles não entram por `roles`.
  it('ADMIN não entra em roles por nenhum caminho', () => {
    expect(resolverPapeis(['INDIVIDUAL'], 'ADMIN')).toBeUndefined();
    expect(resolverPapeis(['INDIVIDUAL', 'PARTNER_B2B'], 'ADMIN')).toBeUndefined();
  });
});

describe('nomeDoIdToken', () => {
  const jwtFalso = (payload: unknown) =>
    `${Buffer.from('{}').toString('base64url')}.${Buffer.from(
      JSON.stringify(payload),
    ).toString('base64url')}.assinatura`;

  it('extrai o name do payload', () => {
    expect(nomeDoIdToken(jwtFalso({ name: 'Josiel Cardoso' }))).toBe('Josiel Cardoso');
  });

  /**
   * JWT usa base64**url** (`-` e `_`), não base64 padrão (`+` e `/`). O legado
   * decodifica com `Buffer.from(payload, 'base64')`, e isso só funciona porque o
   * Node tolera o alfabeto url no modo 'base64'. Vale afirmar: é uma tolerância
   * do runtime, não algo garantido pelo nome do encoding.
   *
   * Os nomes abaixo foram escolhidos por produzirem `-` ou `_` de fato — a
   * asserção de precondição existe para o teste não passar por vacuidade se
   * alguém trocar o payload por um que não exercite o alfabeto.
   */
  it.each([['~~~'], ['ÿÿ'], ['Ru~n'], ['?>~']])(
    'payload com alfabeto base64url é decodificado (%s)',
    (nome) => {
      const token = jwtFalso({ name: nome });
      expect(token.split('.')[1]).toMatch(/[-_]/);
      expect(nomeDoIdToken(token)).toBe(nome);
    },
  );

  it('nome com acento é decodificado (UTF-8 multibyte)', () => {
    const nome = 'Ação Português Ünïcode';
    expect(nomeDoIdToken(jwtFalso({ name: nome }))).toBe(nome);
  });

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['string vazia', ''],
    ['sem pontos', 'abcdef'],
    ['payload que não é base64', 'a.!!!nao-base64!!!.c'],
    ['payload que não é JSON', `a.${Buffer.from('nao é json').toString('base64url')}.c`],
    ['JSON sem name', `a.${Buffer.from('{"sub":"123"}').toString('base64url')}.c`],
  ])('%s → null, sem lançar', (_caso, token) => {
    expect(nomeDoIdToken(token as string | null | undefined)).toBeNull();
  });
});
