# Regras de Testes — Player Action SaaS

Framework: **Jest + next/jest · `__tests__/` · Mocks em `lib/__mocks__/` e inline**

---

## Estrutura de arquivos

- Testes de API route → `__tests__/api/<nome-da-rota>.test.js`
- Testes de lógica de lib → `__tests__/<nome-do-arquivo>.test.js`
- Utilitários compartilhados → `__tests__/test-utils.js`
- Mocks globais e mocks de dependências externas → `jest.setup.js` (não adicionar mocks pontuais lá)

## O que testar em cada API route

Toda route handler precisa de testes cobrindo:

- **401** — request sem sessão autenticada
- **403** — usuário autenticado sem permissão (role errada, plano inativo, etc.)
- **404** — recurso não encontrado ou ownership incorreto
- **400** — input inválido ou faltando
- **200/201** — caminho feliz com dados corretos retornados
- **Efeitos colaterais** — verificar que `prisma.X.create/update` foi chamado com os dados esperados (`toHaveBeenCalledWith`)
- **Rate limit** — verificar que `checkRateLimit` é chamado antes da lógica principal

## Mock do Prisma

- Usar factory inline por arquivo de teste — padrão já estabelecido:
  ```js
  jest.mock('@/lib/prisma', () => ({
    prisma: {
      trainingPlan: { findMany: jest.fn(), create: jest.fn(), count: jest.fn() },
      // ... apenas os models usados pela rota
    }
  }))
  ```
- Não usar o mock global de `lib/__mocks__/prisma.js` — a factory inline é mais legível e específica
- Resetar mocks no `beforeEach` com `jest.clearAllMocks()` + `.mockResolvedValue()` para defaults
- Usar `.mockResolvedValueOnce()` para simular sequências de chamadas diferentes

## Mock de sessão / auth

- Usar `getServerSession.mockResolvedValue({ user: { id, roles, systemRoles, subscriptionStatus } })`
- Para testar 401, usar `getServerSession.mockResolvedValue(null)`
- Sempre incluir todos os campos que a rota usa (`roles`, `systemRoles`, `subscriptionStatus`, etc.)

## Mock de dependências externas

Já configurados globalmente em `jest.setup.js` (não duplicar):
- `next/server` → `NextResponse.json`
- `next-auth` / `next-auth/next` → `getServerSession`
- `@upstash/redis` e `@upstash/ratelimit`
- `@/lib/ratelimit` → `checkRateLimit` retorna `null` por padrão (não bloqueado)
- `groq-sdk` → retorna JSON mínimo válido
- `stripe` → `constructEvent`, `subscriptions.*`
- Variáveis de ambiente: `NEXTAUTH_URL`, `NEXTAUTH_SECRET`, `STRIPE_SECRET_KEY`

## Helper `createMockRequest`

- Usar `createMockRequest(body, searchParams)` de `__tests__/test-utils.js` para criar requests fake
- Para testar com headers customizados, estender o objeto retornado

## Convenções de escrita

- Descrever o comportamento esperado em português no nome do teste: `'deve bloquear atletas com problemas de saúde'`
- Agrupar com `describe('POST', ...)` e `describe('GET', ...)` dentro do `describe` principal da rota
- Um `it` por cenário — sem múltiplos assertions não relacionados no mesmo teste
- Verificar sempre o `res.status` E o conteúdo de `data.error` / `data.plan` / etc.

## Mocks de lib de negócio

- Para testar a route isolada da lógica de limites: `jest.mock('@/lib/subscription-limits')` e configurar `canCreatePlan.mockResolvedValue({ allowed: true })`
- Para testar o caminho de créditos: `jest.mock('@/lib/credits')` e configurar `spendCredits.mockResolvedValue({ success: true })`
- Para testar o caminho de e-mail: `jest.mock('@/lib/email')`

## O que NÃO testar com Jest

- Fluxos E2E completos (login → dashboard → ação) → usar Playwright em `/e2e`
- Integração real com banco → não usar `prisma` real nos testes unitários
- Comportamento do Stripe em ambiente real → usar webhooks de teste do Stripe CLI separadamente
