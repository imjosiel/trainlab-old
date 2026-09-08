# Fatia 20 — webhook de créditos

**Estado:** spec.

## O recorte, e por que ele existe

Mesmo formato da fatia 14/15 (B2B): endpoint **dedicado e separado**, não
uma edição do webhook compartilhado. `credit_purchase` só precisa de
**um** tipo de evento — `checkout.session.completed` — porque é pagamento
único, sem assinatura recorrente por trás. Isso torna esta a migração de
webhook mais simples até agora: sem `customer.subscription.*`, sem
`invoice.payment_*`.

### Entra

- Endpoint novo: `POST /stripe/webhook-credits`, `@Public()`, segredo
  próprio (`STRIPE_WEBHOOK_SECRET_CREDITS`).
- `handleCreditPurchase` → `addPurchasedCredits` (registrado, não portado,
  na fatia 17 — "entra quando o webhook entrar". Chegou a vez.)
- Escrita em `UserSubscription.stripeCustomerId` quando a sessão tem
  `customer` — preserva o comportamento de reusar o mesmo cliente Stripe em
  compras futuras (não é o D92 sendo revertido: D92 é sobre *ler*
  `stripeCustomerId` do JWT; aqui é *escrever* na tabela que o JWT lê depois).

### Não entra

- **Troca de tráfego real no Painel da Stripe** — ação do Josiel, mesma
  razão e mesmos passos da fatia 14/15: cadastrar o endpoint novo, copiar o
  segredo, só then remover o handler do webhook antigo. Os dois **não**
  podem ficar recebendo o mesmo tráfego ao mesmo tempo — dobraria a
  concessão de créditos numa corrida, mesmo risco documentado pro B2B.

## Decisões

### D94 — falha ao conceder crédito agora sobe, não é engolida

O legado (`handleCreditPurchase`) envolve `addPurchasedCredits` num
try/catch que só loga — se a concessão falhar por qualquer motivo
inesperado (banco fora do ar, etc.), o evento ainda é marcado como
processado, e o crédito comprado **some sem ninguém saber** (nem o
cliente recebe, nem o Stripe reentrega, porque o evento já foi marcado).

Mesmo princípio do D77 (fatia 15): falha esperada (metadata ausente,
pacote não encontrado — a sessão pode não ser nossa, ou o pacote pode ter
sido apagado depois da compra) continua um no-op silencioso. Falha
inesperada (o `create`/`upsert` em si der erro) agora **sobe** — o claim é
liberado (D75) e a Stripe reentrega.

Verificado por mutação: reintroduzir o `try/catch` mudo ao redor de
`registrarCompra` não quebra nenhum outro teste — só o que afirma
especificamente "falha no processamento libera o claim e sobe o erro".

### Suítes finais

Backend: **808** unitários (+20 desta fatia) + **232** e2e. `tsc` limpo.

## O que fica pendente, e é ação do Josiel

Mesma sequência da fatia 14/15, sem sobreposição de tráfego real:

1. Cadastrar o endpoint novo no Painel da Stripe:
   `<domínio>/api/backend/stripe/webhook-credits`, assinando
   `checkout.session.completed`.
2. Copiar o segredo gerado para `STRIPE_WEBHOOK_SECRET_CREDITS`.
3. **Só depois** de confirmar que o endpoint novo está recebendo de
   verdade, remover `handleCreditPurchase` do webhook antigo
   (`apps/web/app/api/stripe/webhook/route.ts`).

Até lá, o endpoint novo processa zero compras de créditos reais — testado,
verde, no ar, desligado da fonte de eventos até essa troca manual.
