# Fatia 24 — checkout de vitrine (B2B convidado, tier do parceiro, portal)

**Estado:** backend feito e verde. Cutover ainda não.

## O recorte

"Resto do Stripe" tinha 6 rotas. Isso virou **duas fatias**, não uma — o
webhook compartilhado é grande e arriscado demais pra entrar junto (ver
"Fica pra fatia própria" abaixo).

### Entra

| legado | verbo | quem chama hoje |
|---|---|---|
| `stripe/checkout-b2b` | POST | `invite/partner/[offerId]/page.js` — landing pública de convite, **suporta guest** (sem login) |
| `stripe/checkout-partner-tier` | POST | nenhum caller no frontend hoje, mas é capacidade real (upgrade de tier pago) e o webhook já trata `type=partner_tier_payment` |
| `stripe/checkout-status/[sessionId]` | GET | nenhum caller no frontend hoje — status de qualquer sessão de checkout, sem acoplamento a B2B/tier |
| `stripe/portal` | POST | `dashboard/settings/page.js` — abre o Customer Portal da Stripe |

~580 linhas legadas.

### Não entra

- **`stripe/create-checkout`** — checkout de assinatura SaaS/B2C individual
  (`SaaSTier`). **Zero callers no frontend** (nem página, nem componente).
  Mesma categoria das decisões D83/D87/D92: o sistema B2C está superado
  pelo B2B de parceiro, e aqui nem UI sobrou. Não migra.
- **`stripe/webhook`** (766 linhas) — fica pra **fatia 25**, própria.
  Motivos: (1) tamanho — trata `checkout.session.completed`,
  `customer.subscription.{created,updated,deleted}`,
  `invoice.payment_{succeeded,failed}`, `charge.refunded`,
  `application_fee.refunded`, sync de conta Connect
  (`account.updated`/`account.application.deauthorized`), cada um com
  ramificação B2B vs. legado; (2) risco — é o webhook que **está recebendo
  tráfego real hoje** (as trocas de Painel das fatias 14/15/20 continuam
  pendentes, D-débito #1), então portar isso é inseparável de finalmente
  fazer as três trocas de Painel de uma vez; (3) parte do que ele faz já
  está duplicado em Nest (`b2b-webhook.service.ts`,
  `stripe/webhook-credits`), então o recorte real da fatia 25 é bem menor
  que 766 linhas — mas precisa de leitura própria pra separar o que já foi
  superado do que ainda falta (`partner_tier_payment`, sync de Connect,
  reembolsos, e os ramos legados de SaaS que nem chamam mais nada).

## Achado ao portar — A89

`subscriptions.service.ts.checkout()` (fatia do B2B autenticado, já em
produção) **não usa `calcCommission()`** — usa
`percentualDeTaxa: Math.round(commissionRate * 100 * 100) / 100`, um
percentual puro que ignora a correção #68 do legado: quando a oferta tem
`hourlyRate > 0` e a política é `base_only`, uma fatia proporcional da taxa
do Stripe sobre a `hourlyRate` precisa ser absorvida pelo treinador (senão
a plataforma sai no prejuízo nessa parcela). `calcCommission()` é "fonte
única de verdade" comentada no próprio legado (usada em checkout-b2b,
`partner/offers/[id]/checkout` — o antecessor do `checkout()` atual,
`partner/metrics`, `admin/finance`) — o port anterior recriou o cálculo do
zero em vez de portar essa função, e a versão recriada é mais simples e
**cobra errado toda oferta com `hourlyRate` no fluxo autenticado**, ao vivo,
desde que aquela fatia foi ao ar.

Corrigido nesta fatia: `calcCommission`/`formatRate` viram
`common/commission.ts` (função pura, sem I/O — motivo direto pra virar
utilitário compartilhado em vez de duplicar), e `subscriptions.service.ts`
passa a usá-la também. Efeito colateral: `checkout()` autenticado, que hoje
ignora `hourlyRate` na comissão, começa a cobrar corretamente quando a
oferta tiver taxa por hora.

## Decisões

### D100 — dois modos de checkout Stripe coexistem, não generalizar

`StripeService.criarSessaoDeCheckoutAssinatura` (já existe, usada por
`checkout()`) é `ui_mode: 'embedded'`: cria `price_data` inline a cada
chamada, devolve `clientSecret` pro Stripe Elements embutido no dashboard.
As rotas desta fatia usam o modo **redirect** clássico: `success_url`/
`cancel_url`, devolvem `.url` pra redirecionar o browser inteiro — e
`checkout-b2b` usa um **Stripe Price já existente** (`offer.stripePriceId`)
em vez de `price_data` inline. São dois produtos de eras diferentes da
mesma base de código, não uma duplicação a eliminar — a página de convite
público (`invite/partner/[offerId]`) não roda dentro do dashboard
autenticado pra hospedar o Elements embutido. Novo método
`criarSessaoDeCheckoutRedirect` ao lado do existente, sem tentar
generalizar os dois num só.

### D101 — `checkout-partner-tier` cria produto+preço num único `prices.create`

O legado usa `stripe.prices.create({ product_data: {...} })` — cria produto
e preço juntos, diferente do par `criarProduto` + `criarPreco` que já existe
(dois `create()` separados, usado em outro fluxo). Novo método
`criarPrecoComProduto` só pra esse formato; não generalizado com os dois
existentes.

## Suítes finais

Backend: **982** unitários (+47 desta fatia — 8 de `calcCommission` puro,
39 do `StripeCheckoutService`, mais o teste do A89 dentro de
`subscriptions.service.spec.ts`, que já estava contado nos 934 anteriores).
`tsc` limpo, inclusive dois casos em que a própria checagem de tipos
rejeitou a mutação antes de qualquer teste rodar (mesma classe do R2 na
fatia 23 — `user` deixa de ser garantido não-nulo sem o `user?.id`).
Mutação verificada em 3 pontos de comportamento real (guest bypass do
`statusDoCheckout`, reaproveitamento de Price do tier, mais os dois
capturados pelo compilador).

### Pendência de cutover

- 4 rotas novas em `apps/web`: `stripe/checkout-b2b` → `invite/partner/[offerId]/page.js`;
  `stripe/portal` → `dashboard/settings/page.js`; `stripe/checkout-partner-tier` e
  `stripe/checkout-status/[sessionId]` sem consumidor atual no frontend (portados
  mesmo assim — API completa, sem UI ainda).
- `stripe/create-checkout` **não migra** — SaaS/B2C morto, sem consumidor.
- **BFF**: `apps/web/app/api/backend/[...path]/route.ts` precisa ganhar
  `'stripe/checkout-b2b'` e `'stripe/checkout-status'` em `PUBLIC_PREFIXES`
  — são as duas rotas com suporte a guest, e o BFF hoje bloqueia com 401
  antes mesmo de chegar no Nest se não estiverem na lista.

### O que fica pra fatia 25 (webhook)

`stripe/webhook` (766 linhas, ainda recebendo tráfego real — trocas de
Painel das fatias 14/15/20 seguem pendentes). Ramos a portar: `partner_tier_payment`
(checkout + subscription update), sync de Connect (`account.updated`/
`account.application.deauthorized`, nada disso existe em Nest ainda),
`charge.refunded`, `application_fee.refunded`. Ramos que **não** migram:
`handleCheckoutComplete`/`handleSubscriptionUpdate`/`handleSubscriptionDeleted`/
`handleInvoicePaymentSucceeded`/`handleInvoicePaymentFailed` — todos do
SaaS/B2C legado, mesma categoria do `create-checkout` excluído aqui. Os
ramos B2B (`handleB2BCheckoutComplete` e afins) e de crédito
(`handleCreditPurchase`) já estão duplicados em `b2b-webhook.service.ts` e
no webhook de créditos — a fatia 25 não os porta de novo, só remove a
duplicata do legado quando a troca de Painel finalmente acontecer.
