# Fatia 17 — créditos

**Estado:** spec.

## O recorte, e por que ele existe

Mesmo formato de decisão da fatia 14 (tiers do parceiro): o levantamento
achou uma perna que passa pelo webhook compartilhado da Stripe
(`stripe/webhook/route.ts`, o mesmo que atende B2C, B2B, créditos e
pagamento de tier — já documentado como "não mexer sem coordenar o Painel"
desde a fatia 14/15).

**Josiel escolheu o mesmo recorte sem Stripe.** Entra o que é
CRUD/leitura/decisão administrativa; a criação da sessão de compra
(`POST /stripe/checkout-credits`) e a confirmação (`credit_purchase` dentro
do webhook) ficam para uma fatia de webhook dedicada.

### Entra

| legado | verbo | o que faz |
|---|---|---|
| `credits` | GET | saldo (plan + purchased) + últimas 20 transações; reset preguiçoso se o período venceu |
| `credits/packages` | GET | pacotes ativos, para quem vai comprar |
| `admin/credits/grant` | POST | concede créditos manualmente (bucket plan ou purchased) |
| `admin/credits/packages` | GET/POST | lista todos os pacotes / cria pacote novo |
| `admin/credits/packages/[id]` | PATCH/DELETE | edita / apaga pacote |
| `admin/credits/transactions` | GET | últimas 50 transações, todas |

Mais o serviço em si (`spendCredits`, `checkAndResetCredits`, `grantCredits`)
— **`spendCredits` não tem chamador nesta fatia** (só `training-plans`, que
ainda não migrou), mas entra como preparo: quando `training-plans` migrar,
o débito já existe, testado, pronto pra ser chamado.

~430 linhas legadas, 7 rotas.

### Não entra (registrado, não corrigido)

- **`POST /stripe/checkout-credits`** e o handler `credit_purchase` do
  webhook compartilhado — fatia de webhook dedicada, mesma razão da B2B
  (fatia 14/15): coordenar o Painel da Stripe de novo é ação do Josiel, não
  do código.
- **`addPurchasedCredits`** — só tem um chamador (o webhook, excluído).
  Entra junto quando o webhook entrar.
- **`checkRateLimit('creditsGrant', ...)`** — mesmo gap do A85: sem
  limitador equivalente no Nest ainda.
- **Fallback SaaS/B2C em `getTrainerCreditConfig`** — mesma decisão do D83
  (fatia 16): o parceiro B2B (`PartnerTier.creditsPerPeriod`) é o caminho
  vigente; o SaaS (`SaaSTier`) é resíduo pré-tiers.

## Decisões

### D87 — `getTrainerCreditConfig` só o caminho Partner/B2B

Mesma decisão do D83, aplicada aqui: a alocação periódica de créditos
(`planCredits`) só considera `PartnerAccount.tier.creditsPerPeriod` /
`creditResetPeriod`. Um treinador sem `PartnerAccount` não recebe alocação
periódica — fica só com `purchasedCredits` (comprados), que não depende de
tier nenhum.

### D88 — `spendCredits` entra sem chamador, como preparo

Diferente do resto desta fatia (cada rota migrada tem um endpoint real por
trás), `spendCredits` não é chamado por nada ainda no escopo migrado — é
`training-plans/route.ts`, no legado, quem chama. Portar agora significa que
a trava atômica (`updateMany` com `gte`) e a ordem de débito
(`planCredits` primeiro, `purchasedCredits` de fallback) já nascem testadas,
e a fatia de `training-plans` vira só ligar o fio, não escrever a lógica.

### D89 — mock de `updateMany` não prova trava nenhuma; achado por mutação

Verificação por mutação em `gastar()`: apagar o `where` da trava atômica
(`{ userId, planCredits: { gte: ... }, purchasedCredits: { gte: ... } }`,
deixando só `{ userId }`) **não quebrou nenhum teste unitário**. Motivo: o
mock de `prisma.userCredits.updateMany` devolve o `count` que o teste mandou
ele devolver — a mutação nunca é exercitada, porque não existe `where` de
verdade sendo filtrado contra dado nenhum.

Escrito um e2e novo (`test/credits-corridas.e2e-spec.ts`, mesmo padrão do
D78 no checkout da fatia 15): saldo de 10 créditos, três `gastar()` de custo
5 disparados juntos contra Postgres real. Com a trava: exatamente 2 sucessos,
saldo final 0. Sem a trava: 3 sucessos passaram, e um dos débitos ficou com
`planCredits: 5` sobrando — update perdido, dinheiro (crédito) duplicado.

Nota de método: a mensagem de erro da falha varia com o timing (pode bater
na pré-checagem de saldo insuficiente OU na trava atômica do `updateMany` —
os dois são desfechos corretos da mesma proteção), então o teste afirma a
propriedade financeira (2 sucessos, 1 falha, saldo final exato), não qual
mensagem específica aparece.

### A90 — a trava do D89 estava pela metade: lost update no débito (CORRIGIDO em 2026-08-20)

O D89 acima acertou o diagnóstico (só Postgres real prova a trava) e ainda
assim deixou passar o bug, porque olhou só pro `where`. O `data` gravava o
valor **absoluto** calculado da leitura pré-débito:

```ts
where: { userId, planCredits: { gte: debitFromPlan }, ... },
data:  { planCredits: newPlan, ... },   // ← absoluto, de leitura velha
```

Sob READ COMMITTED, quem esbarra na linha travada bloqueia e **reavalia o
`where`** contra a versão nova (EvalPlanQual) — então o guard cumpria metade
do trabalho: impedia saldo negativo. Mas com três débitos de 5 sobre 10,
todos liam 10, todos passavam no `gte`, e todos gravavam 5. Saldo final 5,
três sucessos: **o usuário gastava 15 pagando 5.**

Corrigido trocando o absoluto por `{ decrement: n }`, que o Postgres resolve
na própria linha travada. O `where` continua igual — ele nunca foi o problema.

**Como escapou, e o que muda no método.** O e2e do D89 afirma a propriedade
certa, mas o desfecho dele dependia do escalonador: se as três chamadas não
se sobrepusessem, passava. Foi o que aconteceu — em CI virou *falha
intermitente*, e um `gh run rerun` verde chegou a ser lido como flakiness
(era o bug). Duas lições:

1. **Rerun verde não é evidência de correção** num teste de corrida. A
   assinatura estava no log o tempo todo: as três respostas com o mesmo
   `newBalance: 5`. Três sucessos idênticos não são "pouca contenção" — são
   três escritas colapsando numa.
2. **Teste de corrida precisa de janela alargada pra ser determinístico** —
   mesma conclusão do D98a (afiliados), mas por caminho inverso: lá o
   alargamento fez um teste fraco começar a falhar; aqui tornou determinística
   uma falha que já existia. Adicionado o caso `A90` no mesmo arquivo, que
   atrasa 60ms entre a leitura e a escrita (só no teste, via spy no
   `findUnique`) forçando as três a lerem antes de qualquer uma escrever.

**Não foi regressão da migração** — `apps/web/lib/credits.ts` tinha o defeito
idêntico, linha por linha, e o port foi fiel. Estava em produção desde antes.
Corrigido nos dois lugares: o legado segue vivo enquanto
`POST /api/training-plans` (geração por IA) não migrar, e os dois precisam
ficar em paridade até lá.

**Sobre paridade comportamental como critério.** Este é o caso-limite do
método: portar fielmente propaga o bug junto. O que pegou não foi o teste
derivado do legado, foi o teste derivado da *propriedade financeira*. Em
invariante de dinheiro, o teste tem que sair da propriedade, não do
comportamento observado.

**Efeito colateral corrigido junto:** `newBalance`/`balanceAfter` vinham da
conta sobre a leitura pré-débito e mentiam sob concorrência (o segundo débito
reportava o saldo do primeiro). Agora saem de uma releitura pós-débito.

**Varredura do padrão.** Todo `updateMany` do backend foi auditado. Os demais
são transição de estado (`pending`→`flushing`, `accepted:false`→`true`, CAS
de `claimedAt`), seguros por construção: o `where` reavaliado não casa mais.
Todas as outras mutações numéricas (flush de afiliado, comissão, conceder e
comprar crédito) já usavam `increment`/`decrement`. O `gastar()` era o único
outlier — não é padrão sistêmico.

**Fica anotado, severidade menor:** `resetarCreditos` grava `planCredits`
absoluto, mas o valor vem da config do tier, não de leitura do saldo — dois
resets concorrentes gravam o mesmo número (idempotente). O risco é um reset
atropelar um gasto simultâneo na virada do período. Janela estreita, e é
concessão, não débito.
