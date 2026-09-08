# Fatia 31 — E2E da borda (pipe + throttle + DTOs contra Postgres real)

**Estado:** SDD (este documento). Nada implementado. Testes ainda não escritos.

## 1. SDD

### Por que e2e, e não só unit

Os units provam service com mock e DTO com `validateSync` isolado. Ninguém
prova que, no stack HTTP real:
- o `ValidationPipe` global está **ligado** (se alguém remover a linha do
  `main.ts`, 1079 units continuam verdes — o pipe não aparece em nenhum);
- o `ThrottlerGuard` global está **registrado** (mesmo argumento);
- o 429 sai no contrato `{ error }` PT-BR pelo filtro;
- DTO rejeita **antes** do handler tocar no banco (ordem pipe → guard → handler).

E2E aqui é teste de **fiação**, não de regra: poucas rotas, cada uma exercendo
um ponto da fiação.

### Threat model

| Vetor | Cenário e2e |
|---|---|
| Tampering | `POST /partner/tiers` com `commissionRate: 2` → 400 sem gravar; `POST /sports` (admin) com slug maiúsculo → 400; `POST /onboarding` com role inválida → 400 |
| DoS | 6 checkouts em rajada → 429 a partir do 6º, corpo `{ error }` PT-BR |
| Info Disclosure | 429 não vaza stack nem inglês; 400 do pipe não ecoa corpo |
| Regressão de fiação | suite falha se pipe/guard/filter saírem do `main.ts`/`app.module.ts` |

### Decisões

- **D107 — AppModule real, banco real.** Como `sports.e2e-spec.ts`: sobe
  `AppModule` inteiro com `ValidationPipe` aplicado no `app` de teste
  (espelhando `main.ts`). Sem banco não há fiação para provar.
- **D108 — throttle baixo só no spec.** O limite de produção (5/5min) é lento
  demais para e2e. Usa `@Throttle` da própria rota com corpo válido repetido:
  6× `POST /stripe/checkout-credits` com `packageId` inexistente → os 5
  primeiros 404 (chegou no handler = não throttled), o 6º 429. Ordem importa:
  404 prova que passou pelo pipe+guard; 429 prova o throttle.
- **D109 — cleanup por TAG.** Mesmo padrão dos specs existentes: cria com
  prefixo, deleta no `afterAll`. Sem seed compartilhado.
- **D110 — sem login OAuth.** Token cunhado com `encode()` (padrão dos e2e).

### Auth

Admin via `systemRoles: ['ADMIN']` cunhado; guest sem token onde couber.

## 2. TDD — cenários (RED primeiro)

`test/borda.e2e-spec.ts`:
- pipe ligado: `POST /admin/partner-tiers` (admin) com corpo inválido → 400
  `{ error }` (sem pipe seria 500 no Prisma ou 201 sujo).
- DTO antes do banco: mesmo POST inválido não cria linha (`count` igual).
- throttle: rajada em `POST /stripe/checkout-credits` → 429 com corpo PT-BR.
- 429 no contrato: `res.body` sem `statusCode/message`, só `error`.
- state-machine e2e: `PATCH /training-plans/:id` PENDING→COMPLETED → 400
  (prova o gancho no stack real, não só no unit do service).

## 3. Implementação (só após RED)

Arquivo novo `test/borda.e2e-spec.ts`. Nenhum código de produção muda —
é exatamente o ponto: se algo falhar, a fiação está errada.

## 4. Verificação

`npm run test:e2e -- test/borda.e2e-spec.ts` verde; depois suite e2e completa.
Banco: `DATABASE_URL` do `.env` (Neon) — `DIRECT_URL` local diverge, então
e2e roda contra Neon nesta máquina.
