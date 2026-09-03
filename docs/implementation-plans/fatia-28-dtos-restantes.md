# Fatia 28 — DTOs restantes (admin + profile + realtime)

**Estado:** SDD (este documento). Nada implementado. Testes ainda não escritos.

## 1. SDD

### Threat model (STRIDE)

| Vetor | Foco desta fatia | Controle |
|---|---|---|
| Tampering | 7 `body: any` restantes em admin (`affiliates-reserved`, `partners/:id`, `platform-finance`, `reports/:id`, `stripe-connect`, `tiers`, `tiers/:id`, `users/:id`) + `profile` upsert + `pusher/auth` | DTOs `class-validator`; forma validada no pipe, regra no service |
| Elevation | `users/:id` aceita `action` livre; `partners/:id` aceita `action` livre | DTO com `IsIn` nas ações conhecidas — ação desconhecida vira 400, nunca cai em ramo inesperado |
| DoS | `reports/:id` aceita `expenses` sem teto no DTO (service capa em 100); `tiers` cria Price na Stripe por request | `ArrayMaxSize(100)` no DTO (defesa na borda, service mantém o corte); `@Throttle` em `tiers` (cria produto na Stripe) |
| Info Disclosure | `audit-logs`/`users` com `query: any` — `parseInt` de string arbitrária | DTOs de query com `transform` + tetos (`limit ≤ 100`); erro de forma vira 400 `{ error }` |
| Tampering (financeiro) | `platform-finance` grava taxas que movem dinheiro (audit já existe) | DTO valida faixas (0–0.1, 0–200, 1–50, soma = 100%); service mantém as checagens (dupla barreira, sem remover) |

Fora de escopo: mudar regra de negócio nos services; o service continua
validando (DTO é borda, service é núcleo). `video-processor` PATCH usa
`x-processor-key` além de admin — DTO só valida forma.

### DTOs

| DTO | Substitui | Campos |
|---|---|---|
| `AffiliatesReservedBody` | `affiliates-reserved` resolver | `earningIds: string[]` (1–200), `action: release\|cancel` |
| `AdminUsersActionBody` | `users/:id` PATCH | `action: toggle_admin\|grant_premium\|revoke_premium\|grant_test_b2b`, `offerId?` |
| `AdminPartnerActionBody` | `partners/:id` PATCH | `action: approve\|reject\|suspend\|update_financials`, `rejectionReason?`, `partnerTier?`, `commissionRate?`, `financials?` |
| `PlatformFinanceBody` | `platform-finance` PUT | `stripePercentFee?` (0–0.1), `stripeFixedFeeInCents?` (0–200), `usdToBrlRate?` (1–50), `distributionRules?` (máx. 20, cada `percentage` 0–1; soma = 1 validada no service) |
| `ReportExpensesBody` | `reports/:id` PUT | `expenses?: Array<{category?, description?, amount?}>` (máx. 100) |
| `SaaSTierBody` / `SaaSTierPatchBody` | `tiers` POST / `tiers/:id` PATCH | create: `name`, `price` (0–9999.99), `description` obrigatórios; resto opcional. patch: tudo opcional |
| `StripeConnectRemoveBody` | `stripe-connect` DELETE | `accountId: string` |
| `VideoProcessorBody` | `video-processor` PATCH | `id: string`, `hlsProcessed?`, `originalVideoKey?`, `processingProgress?` (0–100) |
| `ProfileQuery` / `ProfileUpsertBody` | `profile` GET/POST | query: `userId?`, `sport?`; upsert: `sports: Array<{sportId}>` (1–5) + opcionais escalares |
| `PusherAuthBody` | `pusher/auth` | `socket_id?`/`socketId?`, `channel_name?`/`channel?` (pelo menos um par presente — validado no service, DTO aceita os 4 opcionais) |
| `AuditLogsQuery` / `AdminUsersQuery` | `audit-logs`, `users` GET | `page?`, `limit?` (teto 100), filtros string com teto |

### Auth & Authz

Nada muda: todos os admin já têm `@AdminOnly()`; profile/pusher continuam
autenticados. Throttle adicional só em `tiers` POST (cria Price na Stripe).

## 2. TDD — cenários (RED primeiro)

- `src/common/dtos-admin.spec.ts` — cada DTO: rejeita forma ruim, aceita forma
  boa (par positivo+negativo). Ações fora da lista → 400.
- Specs existentes continuam verdes; nenhum teste apagado.

## 3. Implementação (só após RED)

DTOs em `src/common/dtos-admin.ts` (+ `ProfileUpsertBody`/`PusherAuthBody`
junto, mesmo arquivo); troca `body: any` → DTO nos 13 pontos; `@Throttle`
em `admin/tiers` POST.

## 4. Verificação

`npm run typecheck`, `npx jest src/common`, `nest build`.
