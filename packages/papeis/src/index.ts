/**
 * Regras de papéis — fonte única para os dois apps.
 *
 * MOTIVO (D55): a mesma decisão de autorização vivia em três lugares —
 * `apps/web/lib/roles.ts`, o `resolverPapeis` do Nest e inline no
 * `/api/onboarding` — e as **strings dos papéis** estavam duplicadas em dois
 * arquivos de constantes (`apps/web/lib/constants.ts` e
 * `apps/backend/src/common/constants.ts`).
 *
 * Isso não é preferência de estilo. A fatia 6 tabelou os escritores de `roles`
 * lendo cada um separadamente e concluiu que estavam certos; a fatia 10 achou o
 * A42 e o A44 justamente onde as regras divergiam. Regra de autorização copiada
 * é regra que vai divergir, e divergência em autorização não dá erro — dá acesso
 * errado, em silêncio.
 *
 * Este pacote é **puro**: sem Prisma, sem Nest, sem Next. É o que permite que os
 * dois apps o importem sem arrastar dependência de runtime.
 */

/**
 * Os valores que vão para o banco.
 *
 * `PARTNER_B2B` é a armadilha: a constante se chama `PARTNER` nos dois apps, mas
 * o valor gravado é `'PARTNER_B2B'`. Quem escrever a lista de preservados à mão
 * usando `'PARTNER'` produz um erro que passa calado — preservar um papel
 * inexistente é indistinguível de preservar corretamente.
 */
export const PAPEIS = {
  PENDING: 'PENDING',
  PROFESSIONAL: 'PROFESSIONAL',
  INDIVIDUAL: 'INDIVIDUAL',
  CLIENT: 'CLIENT',
  PARTNER_B2B: 'PARTNER_B2B',
  AFFILIATE: 'AFFILIATE',
} as const;

export type Papel = (typeof PAPEIS)[keyof typeof PAPEIS];

/**
 * Papéis que descrevem o que a pessoa **faz** no produto. O próprio titular
 * escolhe, e são mutuamente substituíveis por essa escolha.
 */
export const PAPEIS_DE_PRODUTO: readonly string[] = [
  PAPEIS.PENDING,
  PAPEIS.PROFESSIONAL,
  PAPEIS.INDIVIDUAL,
  PAPEIS.CLIENT,
];

/**
 * Papéis de **relação comercial ou financeira**. Nunca são consequência de uma
 * escolha de produto: entram por fluxo próprio (candidatura, aprovação de admin)
 * e só saem pelo mesmo caminho.
 *
 * Apagar um destes deixa registro órfão — `PartnerAccount` aprovada sem o papel
 * que dá acesso a ela. Foi o estado inconsistente do A17, do A42 e do A44.
 */
export const PAPEIS_PRESERVADOS: readonly string[] = [PAPEIS.PARTNER_B2B, PAPEIS.AFFILIATE];

/**
 * Os papéis de `atuais` que nenhuma escolha de produto pode remover.
 *
 * Definido por **EXCLUSÃO** — "tudo que não é papel de produto" — e não por
 * inclusão na lista acima. A diferença só aparece num papel que não esteja em
 * nenhuma das duas listas, e é justamente aí que ela importa:
 *
 *   por inclusão  ⇒ papel desconhecido é APAGADO em silêncio  (falha aberto)
 *   por exclusão  ⇒ papel desconhecido SOBREVIVE              (falha fechado)
 *
 * Quem adicionar um papel novo ao produto amanhã e esquecer de atualizar a lista
 * de preservados perde o papel em toda escolha de perfil, sem erro nenhum.
 *
 * Esta era a semântica do `resolverPapeis` do Nest (coberta por 69 e2e) e a
 * primeira versão deste pacote a trocou por inclusão sem perceber. `PAPEIS_
 * PRESERVADOS` continua existindo como **documentação** dos financeiros
 * conhecidos, e há teste afirmando que ambos sobrevivem.
 */
export function papeisPreservados(atuais: readonly string[]): string[] {
  return atuais.filter((r) => !PAPEIS_DE_PRODUTO.includes(r));
}

/**
 * CONCESSÃO (aditiva): o sistema dá um papel, e nada é perdido — exceto
 * `PENDING`, que significa "ainda não decidiu" e deixa de fazer sentido quando
 * existe papel de verdade.
 *
 * Devolve `null` quando não há nada a gravar, para o chamador poder evitar o
 * UPDATE.
 *
 * Não confundir com `resolverPapeis`: lá o **usuário escolhe** e os outros papéis
 * de produto saem. Tratar concessão e escolha como a mesma operação foi o que
 * produziu o A42.
 */
export function concederPapeis(
  atuais: readonly string[],
  papeis: readonly string[],
): string[] | null {
  const semPendente = atuais.filter((r) => r !== PAPEIS.PENDING);
  const faltantes = papeis.filter((p) => !semPendente.includes(p));

  if (faltantes.length === 0) {
    // Nada a conceder — mas ainda vale gravar se sobrou `PENDING` para limpar.
    return atuais.length === semPendente.length ? null : semPendente;
  }

  return Array.from(new Set([...semPendente, ...faltantes]));
}

/** Açúcar para conceder um único papel. */
export function concederPapel(atuais: readonly string[], papel: string): string[] | null {
  return concederPapeis(atuais, [papel]);
}

/**
 * ESCOLHA: o titular pede um papel de produto. Os outros papéis de produto saem;
 * os preservados ficam.
 *
 * Devolve `undefined` quando o papel pedido não é escolhível — e o chamador
 * responde **200 sem alterar nada**. Peculiaridade preservada de propósito do
 * legado (D30 de `epic-nest-perfil-proprio.md`): responder erro seria mudança de
 * comportamento observável.
 */
export function resolverPapeis(
  atuais: readonly string[],
  solicitado: unknown,
): string[] | undefined {
  const papel = String(solicitado);
  if (!PAPEIS_DE_PRODUTO.includes(papel)) return undefined;

  return Array.from(new Set([...papeisPreservados(atuais), papel]));
}

/**
 * ESCOLHA MÚLTIPLA: o wizard de onboarding mapeia uma opção para um conjunto
 * (`PARTNER` ⇒ `[PROFESSIONAL, PARTNER_B2B]`, por exemplo). O mapeamento é política do
 * onboarding e fica lá; o que é regra geral, e mora aqui, é preservar o
 * financeiro ao aplicar o conjunto escolhido.
 */
export function aplicarEscolha(
  atuais: readonly string[],
  escolhidos: readonly string[],
): string[] {
  return Array.from(new Set([...papeisPreservados(atuais), ...escolhidos]));
}
