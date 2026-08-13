# Regras do Agente — Player Action SaaS

Stack: **Next.js 14 (App Router) · TypeScript · Prisma · PostgreSQL · Tailwind CSS · NextAuth**

---

## 1. Queries Prisma — Performance

- Sempre usar `select` explícito — nunca retornar o objeto inteiro do Prisma sem filtro
- Todo `findMany` precisa de `take` (UI → 50, interno → 500, máximo absoluto → 2000)
- Agregações no banco (`count`, `groupBy`, `aggregate`), nunca filtrar em memória com `.filter()`
- Queries independentes → `Promise.all`, nunca `await` sequencial desnecessário
- Proibido queries dentro de loops (N+1) — buscar com `include` ou em batch antes do loop
- Escritas compostas e atômicas → `prisma.$transaction([...])`
- Filtros obrigatórios em tabelas de dados de usuário (`TrainingPlan`, `TrainingSession`, `Student`, etc.)
- Filtros devem usar colunas indexadas do schema (`trainerId`, `athleteId`, `userId`, `status`)
- Ownership sempre no `where` da query, não verificado depois do fetch — retornar 404 em ambos os casos
- `prisma.systemSettings.findFirst()` é singleton: usar `cache()` do React, nunca chamar direto por request

## 2. Arquitetura

- Toda query de banco → `lib/data/*.ts` com `import 'server-only'` no topo
- Toda lógica de negócio complexa → `lib/services/*.ts`
- Route handlers (`app/api/**/route.ts`) apenas orquestram: autenticar → validar → chamar serviço → retornar
- Route handlers com mais de ~100 linhas devem extrair lógica para `lib/data/` ou `lib/services/`
- Nunca importar `lib/data/*` ou `lib/prisma.ts` em Client Components (`'use client'`)
- Prefira Server Components para fetch de dados; `'use client'` só quando há interatividade/hooks
- Dados sensíveis (tokens, IDs internos) nunca expostos ao cliente desnecessariamente

## 3. Autenticação e Autorização

- Toda API route protegida verifica sessão **antes** de qualquer operação — usar `getSessionOrToken(request)`
- Rate limit vem logo após auth, antes de qualquer lógica — usar `checkRateLimit()` de `lib/ratelimit.ts`
- Toda rota que chama IA, Stripe, S3/R2 ou envia e-mail **precisa** de rate limit registrado em `LIMITERS`
- Nunca separar 404 de 403 em recursos protegidos por ownership — sempre 404 (evita information leak)

## 4. Lógica de Negócio — Não Duplicar

- Verificações de limite de planos/atletas → `canCreatePlan`, `canAddAthlete`, `getEffectiveLimits` em `lib/subscription-limits.ts`
- Consumo e concessão de créditos → `spendCredits`, `grantCredits` em `lib/credits.ts`
- Rate limiting → `checkRateLimit` em `lib/ratelimit.ts`
- Se o caso não for coberto, **estender a função existente** — não criar verificação paralela inline

## 5. Stripe e Pagamentos

- Webhooks Stripe podem chegar mais de uma vez — verificar idempotência via `event.id` antes de mutar estado
- Rotas financeiras sem Redis → usar implementação DB-based de rate limit (não depende do Upstash)

## 6. TypeScript e Qualidade de Código

- Proibido usar `any` sem comentário explicando o motivo
- Sempre tipar retornos de funções assíncronas
- Campos JSON armazenados como `String @db.Text` devem ter interface explícita antes de `JSON.parse`
- Funções com mais de ~60 linhas são candidatas à extração
- Constantes de `lib/constants.ts` para roles, status e limites — proibido magic strings
- Sem `console.log` de debug — logs estruturados com prefixo: `console.error('[módulo/ação]', error)`

## 7. Segurança

- Todo dado de usuário injetado em prompt de IA deve passar por `sanitizeForPrompt()` (extrair para `lib/utils/sanitize.ts`)
- Campos `@db.Text` nunca injetados em prompts sem truncamento explícito com `maxLen`
- Erros retornados ao cliente devem ser genéricos — stack trace e detalhes de schema ficam só no `console.error`
- Validar todo input do usuário (body, params, query) antes de usar — preferir Zod

## 8. API — Padrões

- Respostas consistentes: `{ data: T }` / `{ success: true }` / `{ error: string }`
- Status HTTP semântico: 400 (input inválido), 401 (sem auth), 403 (sem permissão), 404 (não encontrado), 409 (conflito), 429 (rate limit), 500 (erro interno)
- Todo route handler tem try/catch com log interno e resposta genérica no catch

## 9. Schema / Prisma

- Todo novo model precisa de `@@index` nas colunas usadas em `where`, `orderBy` e foreign keys
- Migrations com nome descritivo: `npx prisma migrate dev --name add_appointment_reminder`
- Não modificar os models do NextAuth: `Account`, `Session`, `VerificationToken`

## 10. Checklist antes de finalizar

- [ ] Todo `findMany` tem `take` e `select`?
- [ ] Queries independentes usam `Promise.all`?
- [ ] Sem N+1 (query dentro de loop)?
- [ ] Lógica de banco em `lib/data/`, serviço em `lib/services/`, não inline na route?
- [ ] Route handler ≤ ~100 linhas?
- [ ] Ownership verificado no `where`, retornando 404?
- [ ] `SystemSettings` acessado via `cache()`, não diretamente?
- [ ] `checkRateLimit()` logo após auth em rotas de custo alto?
- [ ] Webhooks Stripe com verificação de idempotência?
- [ ] Usando `canCreatePlan` / `spendCredits` em vez de lógica inline?
- [ ] JSON do banco com interface tipada antes de `JSON.parse`?
- [ ] Input de usuário em prompts passou por `sanitizeForPrompt()`?
- [ ] Erros não vazam detalhes internos para o cliente?
- [ ] Input validado com Zod?
- [ ] Sem `any` sem justificativa? Sem `console.log` de debug?
- [ ] Testes cobrem os cenários do checklist de `rules/testing.md`?
