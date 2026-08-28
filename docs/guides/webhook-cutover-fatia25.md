# Cutover — Fatia 25 webhook-connect (P0/P1 já aplicados)

> Backend 1028 testes verdes. Este guia é a parte MANUAL que não dá para automatizar: Painel Stripe.

## 1. Segredos
Em `apps/backend/.env` (e no deploy):
```
STRIPE_WEBHOOK_SECRET_B2B=whsec_...
STRIPE_WEBHOOK_SECRET_CREDITS=whsec_...
STRIPE_WEBHOOK_SECRET_CONNECT=whsec_... # P0-1 adicionado
```
Cada um vem de um endpoint DIFERENTE no Dashboard. Não reutilize.

## 2. Cadastrar 3 endpoints no Dashboard
Stripe Dashboard → Developers → Webhooks → Add endpoint

| Endpoint URL | Eventos a assinar | Toggle Connected accounts |
|---|---|---|
| `https://SEU_DOMINIO/stripe/webhook-b2b` | `checkout.session.completed`, `customer.subscription.created/updated/deleted`, `invoice.payment_succeeded/failed` | OFF |
| `https://SEU_DOMINIO/stripe/webhook-credits` | `checkout.session.completed` (filtra `type=credit_purchase` no código) | OFF |
| `https://SEU_DOMINIO/stripe/webhook-connect` | `checkout.session.completed`, `customer.subscription.created/updated`, `account.updated`, `account.application.deauthorized`, `charge.refunded`, `application_fee.refunded` | **ON** (senão account.* nunca chega — mesmo bug silencioso do legado) |

Copie cada `whsec_...` para o `.env`.

## 3. Teste local com stripe-cli (1.45+)
```bash
# terminal 1: backend
npm run start --workspace=@trainlab/backend # :3001 health 200

# terminal 2,3,4 — um por endpoint (cada um imprime seu whsec_)
stripe listen --forward-to localhost:3001/stripe/webhook-b2b
stripe listen --forward-to localhost:3001/stripe/webhook-credits
stripe listen --forward-to localhost:3001/stripe/webhook-connect

# triggers (em outro terminal, com STRIPE_SECRET_KEY do .env)
stripe trigger checkout_session_completed
stripe trigger customer_subscription_updated
stripe trigger charge_refunded
stripe trigger account_updated
stripe trigger application_fee_refunded
```

### Validação direta sem stripe listen (mesma assinatura)
```bash
node docs/guides/test-webhooks.js # gera header via Stripe.webhooks.generateTestHeaderString e POSTa em :3001
# esperado: 201 {received:true} / 201 {cached:true} na reentrega / 400 com assinatura ruim
```

### Checagem no banco
```sql
SELECT "eventId", status FROM "ProcessedWebhookEvent" ORDER BY "createdAt" DESC LIMIT 10;
-- deve ver b2b:evt_..., connect:evt_..., credits:evt_... com status concluido
-- reenvio do mesmo evt no mesmo endpoint => {cached:true}, no endpoint diferente => {received:true} (prefixo isola)
```

## 4. Quando apagar o legado
Só após ver os 3 endpoints com tráfego real (`status=concluido` sem `liberar()`):
```
rm apps/web/app/api/stripe/webhook/route.ts
rm apps/web/lib/webhook-helpers.ts
```
Remova também `STRIPE_WEBHOOK_SECRET` legado do env.

## 5. Rollback
Se algum endpoint falhar, o legado ainda está em disco (untracked) — basta reverter o DNS do Dashboard para o endpoint antigo.

---
Gerado na Fatia 25 — P0: prefixo eventId (C1), STRIPE_WEBHOOK_SECRET_CONNECT. P1: transação em sincronizarTierPago, fallback invoiceId, idempotencyKey reversal:earn-*, limite 100.
