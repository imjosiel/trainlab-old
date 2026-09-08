# Fatia 25 — webhook de Connect, tier pago e reembolso

**Estado:** backend feito e verde. Cutover é ação no Painel da Stripe, não código — ver seção final.

## O recorte

O webhook compartilhado (`stripe/webhook`, 766 linhas) não migra inteiro —
boa parte dele já está duplicada em Nest desde fatias anteriores. O que
sobra depois de tirar essa duplicação é bem menor, e vira um **terceiro
webhook dedicado**, `stripe/webhook-connect`, no mesmo padrão de
`webhook-b2b` (fatia 15) e `webhook-credits` (fatia 20): endpoint próprio,
segredo próprio, reivindicação via `WebhookClaimService` (D75).

### Já coberto — não entra de novo

| branch do legado | quem já cobre |
|---|---|
| `checkout.session.completed` (`b2b_subscription`), `customer.subscription.{created,updated,deleted}` (B2B), `invoice.payment_{succeeded,failed}` (B2B) | `b2b-webhook.service.ts` |
| `checkout.session.completed` (`credit_purchase`) | `credits-webhook.service.ts` |
| Comissão de afiliado no `invoice.payment_succeeded` + rede de segurança no `checkout.session.completed` | `AffiliateCommissionService`, já chamado de dentro do `B2BWebhookService` (D76) |

### Entra

| evento | filtro por metadata | o que faz |
|---|---|---|
| `checkout.session.completed` | `type === 'partner_tier_payment'` | `handlePartnerTierUpgrade` — upgrade de tier pago |
| `customer.subscription.created`/`.updated` | idem | mesma função, fonte `subscription` em vez de `checkout` |
| `account.updated` | — (evento de conta CONECTADA) | sincroniza status/payouts de `PartnerAccount` OU `AffiliateAccount` — tenta as duas, a que achar ganha |
| `account.application.deauthorized` | — | reseta `stripeAccountId`/flags de `PartnerAccount` OU `AffiliateAccount` |
| `charge.refunded` | — | reverte a comissão de afiliado associada à invoice (earning → `cancelled`, saldo decrementado, reversão do transfer na Stripe se já tinha saído) |
| `application_fee.refunded` | — | busca a charge na Stripe e delega pro mesmo handler de `charge.refunded` |

~430 linhas legadas líquidas (766 menos o que já foi portado).

### Não entra

- **Todos os handlers SaaS/B2C**: `handleCheckoutComplete`,
  `handleSubscriptionUpdate`, `handleSubscriptionDeleted`,
  `handleInvoicePaymentSucceeded`, `handleInvoicePaymentFailed` — mesma
  categoria do `create-checkout` excluído na fatia 24. Sistema morto, sem
  consumidor.

## Por que os filtros por metadata são seguros sem `else`

`b2b-webhook.service.ts` já estabeleceu o padrão: `customer.subscription.*`
não filtra por `metadata.type` no código, filtra por **não achar a linha**
(`if (!sub) return`). Um endpoint da Stripe assina por *tipo de evento*, não
por metadata — então se `webhook-b2b` e `webhook-connect` assinarem os dois
`customer.subscription.updated`, cada handler só reage ao que reconhece e
ignora o resto em silêncio, sem risco de um pisar no dado do outro. Mesmo
princípio aplicado aqui: `handlePartnerTierUpgrade` já tinha esse guard no
legado (`if (!partnerId || !toTierId || !toTierSlug) return`), preservado
como está.

## Decisões

### Achado ao portar — `charge.invoice` não existe mais no tipo do SDK

`buscarCharge()` (nova porta, usada pelo `application_fee.refunded`) foi
escrita lendo `charge.invoice`, igual o legado — e não compilou.
Investigado: a Stripe removeu `invoice` do objeto `Charge` (e `charge`/
`payment_intent`/`paid`/`paid_out_of_band` do `Invoice`) só na API version
`2025-03-31`. A fixada aqui é `2025-02-24.acacia`, **anterior** a essa
remoção — o campo continua vindo de verdade na resposta HTTP, só o pacote
`stripe` instalado (que traz os tipos da versão mais nova por padrão) não
o declara mais. Resolvido com um cast documentado em `buscarCharge()`, não
com um redesenho da busca — o gap é de tipagem, não de API.

### D102 — Connect sync tenta PartnerAccount e AffiliateAccount, não filtra por rota

`account.updated`/`account.application.deauthorized` chegam com só o
`stripeAccountId` — o legado tenta achar como `PartnerAccount` primeiro,
cai pra `AffiliateAccount` se não achar, e os dois nunca coincidem (um
Connect account é ou de parceiro ou de afiliado, nunca os dois). Portado
como está: um método, duas tentativas sequenciais.

### D103 — reversão de comissão ganha método próprio no `AffiliateCommissionService`

O legado busca o transfer na Stripe por metadata (`transfers.list` +
`.find()`) porque não guarda o `transferId` no `AffiliateEarning`. Reverter
exige 3 chamadas novas no `StripeService` (`listarTransferenciasPorDestino`,
`reverterTransferencia`, `buscarCharge` — esta pro `application_fee.refunded`
buscar a charge antes de delegar). `reverter()` novo no
`AffiliateCommissionService`, ao lado do `processar()` que já existe —
mesma dona do domínio, não um serviço à parte.

### D105 — reembolso: falha SOBE, não é engolida (D77 aplicado de novo)

O legado engolia qualquer erro dentro de `handleChargeRefunded` num
try/catch mudo — o webhook sempre devolvia 200 pro Stripe mesmo que a
reversão da comissão tivesse falhado por inteiro. É a mesma classe de
problema que o D77 já resolveu em `processar()` (A76 — comissão que some
sem ninguém perceber), só que do lado da reversão. Portado com o
comportamento invertido: erro sobe, o envelope libera o claim (D75), a
Stripe reentrega. `AffiliateCommissionService.reverter()` já é resiliente
por dentro (cada earning revertido em seu próprio try/catch — um earning
com problema não trava os outros); o que muda aqui é só a falha *inteira*
do método não ser escondida do chamador.

### D104 — endpoint próprio, sem tentar unificar com `webhook-b2b`

`account.updated` e `account.application.deauthorized` são eventos de
**conta conectada**, não da conta da plataforma — o Painel da Stripe tem um
toggle separado ("Listen to events on Connected accounts") pra isso. O
legado nunca teve esse toggle ligado no endpoint certo (era outra rota,
`connect-webhook`, que **nunca foi cadastrada no Painel** — os eventos
caíam no `default` do webhook principal e retornavam 200 sem fazer nada,
silenciosamente, até alguém notar). Fica documentado como passo manual
obrigatório abaixo — não dá pra testar isso localmente.

## Pendência pós-fatia — ação da Stripe Dashboard, não de código

Isso fecha a dívida acumulada desde a fatia 14 (3 trocas de Painel
pendentes viram 1 tarefa):

1. Cadastrar os **três** endpoints no Painel (`webhook-b2b`,
   `webhook-credits`, `webhook-connect`), cada um com seu segredo.
2. No endpoint de `webhook-connect`, ligar "Listen to events on Connected
   accounts" — sem isso, `account.updated`/`account.application.deauthorized`
   não chegam nunca, do jeito que já aconteceu com o legado.
3. Confirmar tráfego real chegando nos três (ex: `stripe trigger` ou uma
   ação real de baixo risco) antes do próximo passo.
4. Só depois disso, apagar `apps/web/app/api/stripe/webhook/route.ts` e
   `apps/web/lib/webhook-helpers.ts` — enquanto o Painel não apontar pros
   três novos, o legado continua sendo o que processa dinheiro de verdade.

Esta fatia entrega o código Nest testado e pronto; os passos acima são do
Josiel, no Painel — não algo que dá pra automatizar ou verificar daqui.

### Achado ao portar — triplicação evitada: `derivarStatusDaContaConectada`

`PartnerConnectService.sincronizar()` e `AffiliatesService.sincronizar()` já
tinham a mesma derivação copiada à mão, com um comentário avisando que as
duas (agora três, com o webhook) precisam mudar juntas. Extraída pro
terceiro uso em `common/stripe-connect-status.ts`, parametrizada por
`exigeChargesEnabled` — a única coisa que diverge entre parceiro (`payoutsEnabled
&& chargesEnabled`) e afiliado (`payoutsEnabled` sozinho basta). Os dois
serviços existentes foram atualizados pra usar a função em vez da cópia
manual; os testes deles continuam verdes sem alteração — comportamento
idêntico, só a fonte deixou de estar duplicada.

## Suítes finais

Backend: **1028** unitários (+43 desta fatia — 7 de `derivarStatusDaContaConectada`,
9 de `AffiliateCommissionService.reverter()`, 26 do `WebhookConnectService`,
mais 1 achado de mutação que virou teste novo), **234** e2e (sem novos —
webhook não tem rota autenticada pra testar por esse caminho). `tsc` limpo.
Mutação verificada em 3 pontos de comportamento real, incluindo um caso em
que a mutação **não foi pega da primeira vez** (trocar `exigeChargesEnabled`
de `true` pra `false` no branch do parceiro não quebrou nada, porque a
fixture de teste tinha `chargesEnabled: true` também) — corrigido
adicionando o cenário que discrimina antes de seguir.
