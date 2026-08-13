/**
 * Validação e normalização do corpo do PATCH /users/profile.
 *
 * Funções puras, sem Prisma: são regras de formato, e teste sem banco é o teste
 * certo para elas. Mensagens de erro idênticas às do legado — são texto que o
 * usuário lê na tela, então mudar seria mudança de comportamento observável.
 */

import { BadRequestException } from '@nestjs/common';
import { PAPEIS_DE_PRODUTO, resolverPapeis as resolverPapeisCompartilhado } from '@trainlab/papeis';

/**
 * Papéis de PRODUTO que o titular pode escolher para si.
 *
 * Reexportado de `@trainlab/papeis` (D55): a lista e a regra de resolução são as
 * mesmas usadas pelo `apps/web`. O nome local é mantido porque é o que os
 * chamadores e os testes desta pasta já importam.
 */
export const PAPEIS_ESCOLHIVEIS = PAPEIS_DE_PRODUTO;

const USERNAME_VALIDO = /^[a-zA-Z0-9_]{3,20}$/;

export const MSG_USERNAME_INVALIDO =
  'Username inválido. Use apenas letras, números e underlines, entre 3 e 20 caracteres.';
export const MSG_TELEFONE_INVALIDO =
  'Telefone inválido. Informe DDD + número (10 ou 11 dígitos).';
export const MSG_USERNAME_EM_USO = 'Este @username já está em uso por outra pessoa.';

/**
 * O legado fazia `substring(0, 20)` DEPOIS deste regex. Como o regex já rejeita
 * qualquer coisa acima de 20, não existia entrada em que aquele corte agisse —
 * era código morto. Saiu; a fronteira é provada por teste em 20 e em 21 (D33).
 */
export function validarUsername(valor: unknown): string {
  const username = String(valor ?? '');
  if (!valor || !USERNAME_VALIDO.test(username)) {
    throw new BadRequestException({ error: MSG_USERNAME_INVALIDO });
  }
  return username;
}

/**
 * Aceita dígitos com qualquer pontuação em volta e grava formatado.
 * `null`, string vazia e só-espaços apagam o telefone.
 *
 * Código do país é removido quando presente. Isso REVERTE o A13, onde eu recusei
 * tratar `+55` alegando ambiguidade com o DDD 55 (Santa Maria/RS). A ambiguidade
 * não existe se o comprimento for olhado: número brasileiro é DDD(2) + 8 ou 9
 * dígitos = 10 ou 11; com o 55 na frente, 12 ou 13. Um número de DDD 55 nunca
 * chega a 12 dígitos.
 *
 * E existe motivo concreto além da conveniência: `POST /api/onboarding` gravava
 * `+55DDDNUMERO`, então quem fez onboarding como treinador tinha no banco um
 * telefone que ESTA validação recusava — a pessoa não conseguia salvar o próprio
 * perfil por causa de um campo que nunca editou. Ver A25/D44 em
 * docs/implementation-plans/epic-nest-papeis.md.
 */
export function normalizarTelefone(valor: unknown): string | null {
  if (valor === null || String(valor).trim() === '') return null;

  let digitos = String(valor).replace(/\D/g, '');
  if ((digitos.length === 12 || digitos.length === 13) && digitos.startsWith('55')) {
    digitos = digitos.slice(2);
  }

  if (digitos.length < 10 || digitos.length > 11) {
    throw new BadRequestException({ error: MSG_TELEFONE_INVALIDO });
  }
  return digitos.length === 11
    ? `(${digitos.slice(0, 2)}) ${digitos.slice(2, 7)}-${digitos.slice(7)}`
    : `(${digitos.slice(0, 2)}) ${digitos.slice(2, 6)}-${digitos.slice(6)}`;
}

/**
 * Troca o papel de produto preservando `PARTNER_B2B` e `AFFILIATE`.
 *
 * CORREÇÃO de um comentário anterior meu, que chamava os dois de "concedidos por
 * admin". Só `PARTNER_B2B` é: `PartnerAccount.status` nasce `pending` e existe
 * fluxo de aprovação em `/api/admin/partners/[id]`. **`AFFILIATE` é auto-serviço**
 * — `AffiliateAccount.status` tem default `approved` e não há aprovação nenhuma.
 *
 * O comportamento (preservar, não conceder) está certo para os dois, por motivos
 * diferentes: `PARTNER_B2B` porque exige admin; `AFFILIATE` porque conceder o
 * papel aqui daria um papel **sem** a `AffiliateAccount`, e os endpoints de
 * afiliado responderiam 404. Quem concede afiliado é `POST /api/onboarding`, que
 * cria a conta junto. Ver A16/D39 em docs/implementation-plans/epic-nest-papeis.md.
 *
 * Papel fora da lista devolve `undefined`: nada muda, e o PATCH responde 200 sem
 * erro. Isso PARECE defeito e é preservado de propósito — a tela de perfil monta
 * o formulário com `roles[0]`, que para um parceiro é `PARTNER_B2B`, ou seja um
 * papel inválido para esta rota. Um 400 aqui quebraria o salvamento inteiro do
 * perfil de todo parceiro por causa de um campo que ele não editou. Ver D30.
 */
export function resolverPapeis(atuais: string[], solicitado: unknown): string[] | undefined {
  // Delegação para `@trainlab/papeis` (D55). O corpo daqui era idêntico; manter a
  // assinatura local evita tocar em chamadores e testes desta pasta.
  //
  // A semântica canônica é a que estava AQUI — preservar por EXCLUSÃO dos papéis
  // de produto, não por inclusão numa lista de financeiros. A primeira versão do
  // pacote compartilhado trocou isso por inclusão, o que apagaria em silêncio
  // qualquer papel futuro fora das duas listas. Falha fechado é o requisito.
  return resolverPapeisCompartilhado(atuais, solicitado);
}

/**
 * Extrai `name` do payload de um id_token do Google, sem verificar assinatura.
 *
 * Não é falha: o token foi guardado pela própria aplicação no fluxo OAuth, então
 * a confiança vem de lá e não deste parse. Fica registrado porque é o tipo de
 * código que, copiado para um contexto onde o token vem de fora, viraria falha.
 * Ver D34.
 */
export function nomeDoIdToken(idToken: string | null | undefined): string | null {
  if (!idToken) return null;
  try {
    const payload = idToken.split('.')[1];
    if (!payload) return null;
    const json = JSON.parse(Buffer.from(payload, 'base64').toString('utf8')) as { name?: string };
    return json.name ?? null;
  } catch {
    return null;
  }
}
