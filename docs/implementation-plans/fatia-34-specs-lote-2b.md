# Fatia 34 — Specs lote 2b (upload, metrics, tiers-request, realtime, pdfs)

**Estado:** SDD (este documento). Nada implementado. Testes ainda não escritos.

## 1. SDD

### Alvos (puros ou com mock simples — sem Stripe real, sem R2 real)

| Service | Risco que o spec trava |
|---|---|
| `upload-image` | Gate trainer/parceiro/assinatura; R2 ausente → 503; tipo fora da lista → 403; >5MB → 403; chave com `user.id` + uuid (sem traversal) |
| `upload-cloudinary` | Mesmo gate; assinatura usa `CLOUDINARY_API_SECRET` (não vaza no retorno); `cloudName` sai, `secret` não |
| `partner-metrics` | Conta não aprovada → 403; admin sem conta → zeros; `customCommissionRate` vence tier; `hourlyRate` soma no bruto |
| `partner-tier-request.post` (tier pago) | Stripe mockado: reaproveita Price existente quando casa; cria quando não casa; sem `NEXTAUTH_URL` → 400 antes de tocar no Stripe |
| `tier-requests.decidir/forcarTier` | Aprovar move 3 campos juntos; pedido já processado → 400; tier destino desativado → 400; `forcarTier` grava audit trail |
| `realtime` | Sem credencial → `null` sem derrubar (só warn uma vez); `emitirNovaMensagem` com cliente ausente é no-op |
| `training-plan-pdf` / `exercise-pdf` | PDF gera bytes (não vazio); dono/atleta com acesso vê, estranho → 403/404 |
| `partner-settings.update` | Só `allowTestMode` é escrito (allowlist); não-parceiro → 404 |

Fora do lote 2b (Stripe real ou escrita financeira complexa, ficam para depois):
`admin-finance`, `admin-partners-payouts`, `admin-tiers[-id]`, `admin-users-actions`,
`admin-partners-actions`, `admin-reports*`, `admin-platform-finance`,
`admin-stripe-connect`, `admin-video-processor`, `admin-affiliates-reserved`,
`calendar` (Google real), `stripe.service`, `ai.service`, `email.service`.

### Decisões

- **D116 — R2/S3 mockado por construção.** `UploadImageService` instancia
  `S3Client` dentro do método — immockável sem DI. Para testar o gate sem
  tocar em rede: `R2_*` ausente → 503 antes de qualquer `S3Client`; tipo e
  tamanho checados antes do client. Specs cobrem até a fronteira do client
  (gate + 503 + validação); o `PutObject` em si fica para e2e com R2 real.
  Se quiser cobrir o upload, refatora para cliente injetado (padrão D66).
- **D117 — Stripe mockado por `jest.mock`.** Mesmo padrão do tier-verify
  (D112). Cloudinary `api_sign_request` é puro (HMAC local) — testa de verdade.
- **D118 — D113 mantido.** Nenhum arquivo de produção muda.

## 2. TDD — cenários (RED primeiro, um spec por service)

## 3/4. Implementação / Verificação

Só specs. `npx jest` nos alvos, `npm run typecheck`.
