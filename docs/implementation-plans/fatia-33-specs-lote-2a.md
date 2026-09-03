# Fatia 33 — Specs lote 2a (admin leitura/agregação)

**Estado:** SDD (este documento). Nada implementado. Testes ainda não escritos.

## 1. SDD

### Alvos (7 services admin, só leitura/agregação — sem Stripe, sem escrita)

| Service | Risco que o spec trava |
|---|---|
| `admin-users-search` | Email vazio → 400; inexistente → 404; `trim` no email |
| `admin-affiliates` | Paginação (page ≤ 0 vira 1, pages calculado); includes de user + counts |
| `admin-overview` | MRR estimado cruza `userSubscription groupBy plan` com preço do tier (case-insensitive); plano sem tier → ignorado, não quebra |
| `admin-metrics-b2b` | Assinatura sem offer/partner é filtrada (conta deletada); top 10 ordenado; arredondamento 2 casas |
| `admin-users-report` | 404 quando não existe; taxas de conclusão 0 quando vazio; partnerStats null sem conta |
| `admin-r2-storage` / `admin-fix-storage` / `admin-cloudinary` | Agregações por provider; `fix` só toca linha marcada errada |

Fora do lote 2a (precisam de Stripe mock ou escrita complexa): `admin-finance`
(Stripe charges), `admin-partners-payouts` (balance Stripe), `admin-tiers[-id]`
(cria Price), `admin-users-actions`, `admin-partners-actions`,
`admin-reports*`, `admin-platform-finance`, `admin-stripe-connect`,
`admin-video-processor`, `admin-affiliates-reserved`.

### Decisões

- **D114 — mesmo padrão do lote 1.** `prismaMock` + casos positivo/negativo.
  Nenhum arquivo de produção muda (D113 mantido).
- **D115 — MRR com tier ausente.** Se `plan` não casa com tier ativo, a linha
  é ignorada no somatório (comportamento atual). Spec trava isso: tier
  removido não zera nem quebra o MRR.

## 2. TDD — cenários (RED primeiro)

`src/admin/*.service.spec.ts` novos, um por service.

## 3/4. Implementação / Verificação

Só specs. `npx jest src/admin`, `npm run typecheck`.
