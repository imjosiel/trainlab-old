# Fatia 35 — Specs lote 2c (admin escrita/leitura restantes)

**Estado:** SDD (este documento). Nada implementado. Testes ainda não escritos.

## 1. SDD

### Alvos (puros ou com mock simples — sem Stripe real, sem R2 real)

| Service | Risco que o spec trava |
|---|---|
| `admin-reports` (listar/gerar) | Período fora de YYYY-MM → 400; publicado não regera; matemática (gross − taxas − comissões = net); audit trail gravado |
| `admin-reports-publish` | Inexistente → 404; já publicado → 400; publica com timestamp + audit |
| `admin-reports-export` | Inexistente → 404; CSV com header + filename por período |
| `admin-partners-revenue` | Soma por parceiro (ofertas × assinantes ativos); ordenado por platformRevenue; SaaS contado separado |
| `admin-audit-logs` | Filtros cortados (60/100 chars); page/limit com tetos; `includeFilters=false` pula agregações |
| `admin-users` | Busca ILIKE nome/email; role ADMIN filtra systemRoles, role TRAINER filtra roles; limit teto 100 |
| `admin-tiers` (listar) | Ordenado por preço; sem filtro |
| `admin-tiers-id` (remover) | Com assinantes vinculados → 400; sem → apaga |
| `admin-users-actions` (remover) | Não-admin → 403; self-delete → 400; apaga + audit |
| `admin-video-processor` (atualizar) | Sem id → erro; progresso clamp 0–100; `hlsProcessed: true` zera pendência |
| `upload` (presign) | Não-treinador → 403; sem R2 → 503; >20 arquivos → 403; tipo fora da lista → 403; chave com trainerId/uploadId |
| `partner-tier-request.post` (grátis) | Sem conta → 404; conta não aprovada → 403; tier igual → 400; auto-approve transaciona; manual cria pendente; duplicado → 400 |

Fora do lote 2c (Stripe/R2/Google real ou já cobertos): `admin-finance`,
`admin-partners-payouts`, `admin-tiers.criar`, `admin-tiers-id.atualizar`,
`admin-users-actions.atualizar`, `admin-partners-actions`, `admin-platform-finance`,
`admin-stripe-connect`, `admin-affiliates-reserved`, `calendar`, `stripe`,
`ai`, `email`, `teams` (prisma inline no controller), `saas-checkout`
(lógica de URL + Stripe), `training-plans-limits` (fachada já coberta
indiretamente), `videos` (R2 real).

### Decisões

- **D119 — D113 mantido.** Nenhum arquivo de produção muda.
- **D120 — transação mockada como função.** Services que usam
  `prisma.$transaction(async (tx) => ...)` recebem mock que executa o
  callback com `tx` espelhando os métodos (padrão do invites spec).

## 2. TDD — cenários (RED primeiro, um spec por service)

## 3/4. Implementação / Verificação

Só specs. `npx jest src/admin src/upload src/partner-tier-request`, `npm run typecheck`.
