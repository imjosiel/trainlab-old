# Fatia 19 — checkout de créditos

**Estado:** spec.

## O recorte, e por que ele existe

`POST /stripe/checkout-credits` cria a sessão de pagamento único (Stripe
Checkout, `mode: 'payment'`) para compra de um pacote de créditos. Diferente
da fatia B2B (14/15), este endpoint **não depende do webhook** — só cria a
sessão e devolve a URL de redirect. A concessão dos créditos acontece
depois, no handler `credit_purchase` do webhook compartilhado
(`stripe/webhook/route.ts`), que continua fora do escopo (mesma razão da
fatia 14/15/17: webhook multi-uso, coordenação de Painel pendente).

Por isso essa migração é mais simples que as anteriores: sem coordenar
nada na Stripe agora, o endpoint novo já pode receber tráfego real assim
que o cutover trocar a URL no frontend.

### Entra

| legado | verbo | o que faz |
|---|---|---|
| `stripe/checkout-credits` | POST | cria sessão Stripe (payment, pacote de créditos), devolve `{ url }` |

~106 linhas legadas, 1 rota.

### Não entra (registrado, não corrigido)

- **Handler `credit_purchase` do webhook** — continua no legado, junto do
  resto do webhook multi-uso (A85-style, mesma decisão de sempre).
- **`checkRateLimit('checkoutCredits', ...)`** — mesmo gap do A85.

## Decisões

### D92 — usa `SessionPayload.stripeCustomerId` direto, sem consultar `User.subscription`

O legado busca `user.subscription.stripeCustomerId` via Prisma — a mesma
relação SaaS/B2C que o D83/D87 já decidiram não portar. O JWT que o
`SessionPayload` carrega **já tem** `stripeCustomerId` (usado em outras
fatias); ler direto do payload evita reabrir a relação `subscription`
inteira só para um campo, e não depende do sistema SaaS legado de jeito
nenhum.

### D93 — `StripeService` ganha `criarSessaoDeCheckoutDeCreditos`

Porta de `criarSessaoDeCheckoutAssinatura` (fatia 15): mesmo `StripeService`,
método novo — `mode: 'payment'` em vez de `'subscription'`, sem
`transfer_data` (não há parceiro nem comissão aqui, é pagamento direto pra
plataforma).
