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
