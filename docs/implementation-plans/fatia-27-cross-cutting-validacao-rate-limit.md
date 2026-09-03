# Fatia 27 — Cross-cutting: ValidationPipe global + rate-limit por rota

**Estado:** SDD (este documento). Nada implementado. Testes ainda não escritos.

## 1. SDD — Security-Driven Development

### Threat model (STRIDE)

| Vetor | Descrição | Controle |
|---|---|---|
| Tampering | Corpo `any` aceita qualquer forma; `NaN`/`undefined` chega ao Prisma e vira comportamento errado (precedente A58/A68/A12) | `ValidationPipe` global + DTOs `class-validator`; `whitelist: true` descarta campo desconhecido; `transform: true` tipa antes da regra |
| DoS | Rotas caras/abuse-prone sem limite: IA (`POST /training-plans`), checkout Stripe, convites, onboarding | `@nestjs/throttler` v6 global + `@Throttle()` por rota; 429 no contrato `{ error }` |
| Info Disclosure | Erro de validação/throttle em inglês ou com stack vaza detalhe interno | `ErrorContractFilter` cobre 400-lista do pipe (já cobre) + 429 do throttler (falta — RED) |
| Spoofing/Elevation | Rate-limit por IP permite contornar com login compartilhado e vice-versa | Tracker: autenticado → `user.id`; anônimo → IP; rotas guest usam IP |
| Repudiation | Abuso sem rastro (quem estourou o limite, quando) | Log no guard customizado com `userId`/rota (sem corpo) |

Fora de escopo desta fatia: Upstash/Redis (in-memory primeiro, mesma decisão do
`lib/rate-limit.ts` do legado); converter **todos** os `body: any` em DTOs
(conversão é por recurso, esta fatia liga o cano + converte o núcleo quente).

### Validação — decisão

- `app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: false }))`.
- `forbidNonWhitelisted: false` (não `true`): o legado ignora campo extra em
  silêncio em vários PATCHs (ex. perfil próprio, D30); `true` transformaria
  campo extra em 400 e quebraria clientes que mandam campos a mais. Whitelist
  descarta sem quebrar.
- DTOs novos nesta fatia (núcleo quente, todos hoje `body: any`):
  `OnboardingBody`, `UploadPresignBody`, `AdminSettingsBody`,
  `PartnerSettingsBody`, `TierRequestBody`, `SaasCheckoutBody`,
  `ProfileUpsertBody` (forma mínima: `sports: string[]` + opcionais).
- `ErrorContractFilter` já junta `message[]` do pipe em uma linha — sem mudança.

### Rate-limit — decisão (espelha `lib/ratelimit.ts` do legado)

| Nome | Rotas | Limite |
|---|---|---|
| `curto` (default global) | tudo | 100 req / 60s por tracker |
| `ia` | `POST /training-plans`, `POST /exercises` | 100 / 1h, 50 / 1h |
| `financeiro` | `stripe/*`, `partner/offers/:id/checkout` | 5 / 5min |
| `convite` | `students/invite*`, `partner/apply`, `onboarding` | 10–30 / 10min–1h |
| `upload` | `upload/r2-presign`, `upload/image` | 20–30 / 5min–1h |

- Guard customizado `TrainLabThrottlerGuard extends ThrottlerGuard`:
  tracker = `request.user?.id ?? ip`; mensagem PT-BR no contrato.
- `ThrottlerException` (429) passa pelo `ErrorContractFilter` → `{ error }`.
  O filtro hoje não conhece 429 — RED cobre isso.
- Webhooks Stripe (`stripe/webhook-*`) com `@SkipThrottle()`: a Stripe reenvia
  em rajada por desenho; estrangular webhook gera reentrega em loop.

### Auth & Authz

Nada muda: `NextAuthJwtGuard` (401) antes de `RolesGuard` (403) antes do
`ThrottlerGuard`. Throttle roda **depois** de saber quem é (precisa do
`user.id` como tracker), mas antes do handler.

### Data Exposure / Audit

DTOs nunca adicionam campo à resposta; `select` explícito continua nos
services. Sem trilha nova: 429 não é movimentação financeira.

## 2. TDD — cenários (RED primeiro, arquivos novos, nada apagado)

- `src/common/error-contract-429.spec.ts` — 429 vira `{ error }` PT-BR (hoje
  cai em "Erro interno").
- `src/common/trainlab-throttler.guard.spec.ts` — tracker usa `user.id`
  quando há sessão, IP quando não há; mensagem PT-BR.
- `src/common/dtos.spec.ts` — cada DTO novo: rejeita forma ruim, aceita forma
  boa (controles positivo+negativo, padrão `numeros.spec.ts`).

## 3. Implementação (só após RED confirmado)

- `POST` (sem mexer em teste): `ThrottlerModule.forRoot`, guard global,
  `ValidationPipe` em `main.ts`, DTOs, filtro 429.
- Swagger sai dos decoradores (`@ApiProperty` nos DTOs) — sem YAML à mão.

## 4. Verificação

- `npm run typecheck`, `npx jest src/common` verde total, `nest build` com
  exit code real.
