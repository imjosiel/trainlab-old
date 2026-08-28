# Fatia 26 — POST /training-plans com IA (porte fiel)

**Estado:** SDD feito, TDD em andamento. Legado `apps/web/app/api/training-plans/route.ts:87` 671 linhas.

## SDD
- **Threat:** prompt injection via `sanitizeForPrompt` (``` + `ignore instruct` + `maxLen 300`), `stripHtml`, `maxDuration 60` DoS, `isManual` bypass IA, `hasHealthIssues/takesMedication` bloqueio ético 403
- **Rate limit:** `planCreate 100/h` (Upstash) + `15s trainer+student` anti-spam via `trainingPlan.count gte 15s` → 429
- **Auth:** `PROFESSIONAL` com `studentId` (valida `trainerId` + `athleteProfiles.length`) ou `CLIENT/INDIVIDUAL` com `athleteId==self`; `profileId` opcional
- **Limites:** `canCreatePlan` (SaaSTier/PartnerTier flex/pool) → 403/402 (créditos se `enableCreditSystem`)
- **Créditos:** `spendCredits PLAN_GEN` com `decrement` atômico (A90) — único debit, 402 se insuficiente
- **RAG:** `trainingSession` 200 últimos 30/90d + `studentNote` 3 últimas + `avgRating` → `ragContext` no skeletonPrompt
- **AI:** `SystemSettings.aiProvider` (`groq`|`gemini`) + `geminiModel`, fallback `LOCAL_AI_URL` em 429 Groq

## TDD cenários
- happy manual: cria plano sem IA, sem exercícios
- happy IA: 2 fases (skeleton + batch) com biblioteca 200 exercícios, rotacao + sobrecarga, transacao plan+createMany
- limite atingido → 403, com créditos → spend e 201, sem créditos → 402
- 15s anti-spam → 429
- saúde → 403 quando hasHealthIssues sem isManual
- biblioteca vazia → 400

## Implementação
- `AiService` porta (Groq/Gemini/Ollama) injetável, mockável
- `TrainingPlansCreateService` com `criar(user, body)` — validação, limites, RAG, AI, persistência transacional
- `TrainingPlansController POST /training-plans` + Swagger

## Verificação
- `npm test -- training-plans-create` + `tsc` + `stripe` não se aplica (IA não é webhook)
