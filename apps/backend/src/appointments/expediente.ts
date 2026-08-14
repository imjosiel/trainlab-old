/**
 * Validação dos campos de expediente (D65).
 *
 * MOTIVO (A58): o legado validava `workStartHour` só por FAIXA —
 * `v < 0 || v > 23` — sem checar tipo. `'abc' < 0` é `false` e `'abc' > 23`
 * também, então a string passava inteira pela validação. Medido ao vivo:
 *
 *     workStartHour="abc"  -> HTTP 500  (Number('abc') é NaN, o Prisma recusa)
 *     workStartHour=""     -> HTTP 200  e o banco gravou 0
 *
 * O segundo é o grave: `Number('')` é `0`, e `0` é hora válida — o expediente
 * do profissional passa a começar à meia-noite, com resposta de sucesso.
 *
 * O legado já tinha a checagem certa em `workDays` (BUG-102), com um comentário
 * explicando exatamente este mecanismo, três linhas abaixo do campo que ficou
 * sem ela. Por isso aqui existe UM helper usado pelos três campos: a correção
 * que não se aplica sozinha aos irmãos é a que produz o próximo A58.
 */

/**
 * `true` só para inteiro de verdade dentro da faixa.
 *
 * Rejeita string (mesmo `'10'`), `NaN`, fracionário, `null`, array e objeto.
 * Aceitar `'10'` seria conveniente e reabriria a porta: a conversão que salva
 * `'10'` é a mesma que transforma `''` em `0`.
 */
export function inteiroNaFaixa(valor: unknown, min: number, max: number): boolean {
  // `Number.isInteger` já reprova string, null, array, objeto, NaN, Infinity e
  // fracionário — SEM converter nada. É a diferença que importa: qualquer
  // conversão implícita reabre a porta do A58.
  if (!Number.isInteger(valor)) return false;
  return (valor as number) >= min && (valor as number) <= max;
}
