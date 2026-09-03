# Fatia 32 — Specs faltantes, lote 1 (leitura + onboarding + status)

**Estado:** SDD (este documento). Nada implementado. Testes ainda não escritos.

## 1. SDD

### Alvos (8 services sem spec, só leitura ou fluxo bem definido)

| Service | Risco que o spec trava |
|---|---|
| `dashboard` | Agregação com 4 queries paralelas; `where` por papel (trainer vs atleta); streak/completion; `plansByDay` 30 dias |
| `onboarding.post` | Troca de papel preservando financeiro (PARTNER_B2B/AFFILIATE); cria PartnerAccount/AffiliateAccount; BOTH rejeitado |
| `onboarding.get` | Convite pendente com perfil/esporte; sem email → null |
| `invites` (get/aceitar) | Token expirado/aceito → Gone; email trocado → 403; aceitar vincula TrainerAthlete + papel CLIENT (idempotente via `updateMany`) |
| `plan-status` | BOTH mostra duas abas; admin sem conta → ADMIN; sem acesso → upgradeUrl |
| `profile-stats` | NULLS FIRST (A12/D28): duas contagens sem `take`; streak só de concluídas |
| `profile` (get/upsert) | Leitura cruzada trainer→aluno; upsert 1–5 esportes, deleta removidos |
| `partner-tier-verify` | Fallback de webhook: metadata incompleta → `updated: false`; conta alheia → error; já-atual → `alreadyCurrent` |

### Decisões

- **D111 — specs de leitura mockam Prisma, sem banco.** Como os specs de
  service existentes (`prismaMock` + `bodyOfRejection`). E2E já cobre banco.
- **D112 — Stripe mockado por injeção.** `PartnerTierVerifyService` instancia
  `new Stripe()` dentro do método — immockável. Para testar sem refatorar
  produção, mock de `stripe.checkout.sessions.retrieve` via `jest.mock('stripe')`.
  Se o mock de módulo provar-se frágil, refatora para `StripeService`
  injetado (padrão D66) em vez de forçar o teste.
- **D113 — sem mudar produção no lote 1.** Se um spec revelar bug, registra
  como achado no doc e corrige em fatia própria. Lote 1 é só rede de proteção.

### Auth & Authz / Data Exposure / Audit / Rate-limit

Nada muda: só adiciona specs.

## 2. TDD — cenários (RED primeiro, um spec por service)

Ver arquivos `src/<modulo>/*.service.spec.ts` novos. Padrão `numeros.spec.ts`:
par positivo+negativo; `[controle]` onde helper que retorna sempre-X passaria.

## 3. Implementação

Só specs. Nenhum arquivo de produção muda.

## 4. Verificação

`npx jest src/dashboard src/onboarding src/invites src/users/plan-status...`,
`npm run typecheck`.
