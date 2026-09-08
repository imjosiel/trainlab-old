/**
 * Validação numérica de entrada — um lugar só (D71).
 *
 * MOTIVO, e ele é medido, não estético. Esta base tem uma forma de defeito que
 * já apareceu três vezes:
 *
 * 1. BUG-102 pôs checagem de tipo em `workDays` e deixou `workStartHour` sem —
 *    `'' < 0` é `false`, então a string vazia passava e `Number('')` gravava `0`.
 *    Expediente começando à meia-noite, com HTTP 200 (A58).
 * 2. `POST /admin/partner-tiers` valida `commissionRate`, `payoutDelayDays` e
 *    `creditsPerPeriod`, e deixa `price` e `minPrice` sem guarda — justamente os
 *    dois campos de dinheiro. `parseFloat('abc')` é `NaN`, e `NaN` num `Float` do
 *    Prisma é 500 (A68).
 * 3. O mesmo POST valida `commissionRate` entre 0 e 1 e aceita `price: -100`.
 *
 * O padrão não é "alguém esqueceu": é que a validação foi escrita **campo a
 * campo**. Correção aplicada a um campo e não aos irmãos é o defeito mais
 * recorrente deste código, e a resposta é um helper que os campos compartilham
 * em vez de um `if` por campo.
 *
 * Nenhum dos dois converte nada. A conversão que salvaria `'10'` é a mesma que
 * transforma `''` em `0`.
 */

/** `true` só para inteiro de verdade dentro da faixa. Veio da fatia 13 (D65). */
export function inteiroNaFaixa(valor: unknown, min: number, max: number): boolean {
  // `Number.isInteger` já reprova string, null, array, objeto, NaN, Infinity e
  // fracionário — SEM converter. É a diferença que importa.
  if (!Number.isInteger(valor)) return false;
  return (valor as number) >= min && (valor as number) <= max;
}

/**
 * `true` só para número finito de verdade dentro da faixa.
 *
 * Aceita fracionário (é para dinheiro e para taxa de comissão) e rejeita o resto
 * pelo mesmo critério do irmão acima.
 */
export function numeroNaFaixa(valor: unknown, min: number, max: number): boolean {
  // `typeof === 'number'` mais `Number.isFinite` reprova string, null, array,
  // objeto, booleano, NaN e Infinity — sem converter. `Number.isFinite` sozinho
  // já basta para o valor, mas o `typeof` deixa explícito que boolean não conta.
  if (typeof valor !== 'number' || !Number.isFinite(valor)) return false;
  return valor >= min && valor <= max;
}
