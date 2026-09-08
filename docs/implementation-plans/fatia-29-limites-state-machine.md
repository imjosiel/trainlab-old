# Fatia 29 — Limites unificados + state-machine de planos

**Estado:** SDD (este documento). Nada implementado. Testes ainda não escritos.

## 1. SDD

### Threat model (STRIDE)

| Vetor | Foco desta fatia | Controle |
|---|---|---|
| Tampering | `PATCH /training-plans/:id` aceita **qualquer** `status` válido — sem checar transição (PENDING→COMPLETED direto pula aprovação; COMPLETED→PENDING reabre plano fechado) | `plan-state-machine.ts` central (`PLAN_TRANSITIONS` do legado) + checagem em `atualizar()`; transição inválida vira 400 |
| Elevation | Atleta/aluno não pode mudar status (só trainer/admin) — preservado; state-machine não abre caminho novo | Sem mudança de authz; só aperta o que trainer/admin pode fazer |
| DoS (lógica) | `students.criar` só conhece caminho Partner/B2B: treinador SaaS com assinatura ativa é **bloqueado** ("Apenas parceiros") — fail-closed errado que empurra para suporte | `subscription-limits.ts` unificado: admin → partner → SaaS → free; `verificarLimiteDeAlunos` usa `getEffectiveLimits` + `canAddAthlete` |
| Tampering (limites) | `training-plans-limits.canCreatePlan` duplica (diverge de) `subscription-limits.canCreatePlan` do legado; duas fontes de limite divergem em silêncio | Fonte única `src/common/subscription-limits.ts` (porte fiel); `TrainingPlansLimitsService` delega; `students` reutiliza `canAddAthlete` |
| Info Disclosure | Mensagens de limite revelam contagem (`current`) — já é assim no legado, mantido | Sem mudança |

Fora de escopo: `checkUserLimits` (agregador de dashboard, sem chamador no
Nest); mudar mensagens existentes (contrato observado pelas telas).

### Decisões

- **D100 — state-machine central, não inline.** `src/common/plan-state-machine.ts`
  com `PLAN_TRANSITIONS`, `assertValidTransition`, `isValidTransition` (porte
  1:1 do legado). `atualizar()` chama `assertValidTransition(atual, novo)` e
  converte o `Error` em 400 `{ error }`. Sem status no corpo → sem checagem
  (edição de `finalPlan`/`trainerNotes` não é transição).
- **D101 — limites: porte fiel, não reescrita.** `src/common/subscription-limits.ts`
  com `PLAN_LIMITS`, `getEffectiveLimits`, `canAddAthlete`, `canCreatePlan`
  (mesma prioridade admin → partner → SaaS → free, mesmo pool flexível, mesmo
  BUG-30 fix do multiplicador real). Diferença assumida: Prisma via
  `PrismaService` injetado em vez de singleton importado (testabilidade —
  o legado importa `prisma` direto e não dá para mockar sem módulo).
- **D102 — `verificarLimiteDeAlunos` delega, não duplica.** Vira chamada a
  `canAddAthlete(trainerId, plan, isAdmin)`; mensagem de erro sai do resultado
  (mesmo texto do legado por caminho).
- **D103 — `TrainingPlansLimitsService` vira fachada fina.** Delega para
  `canCreatePlan` do módulo comum; mantém a assinatura (chamadores e specs
  existentes não mudam).

### Auth & Authz / Data Exposure / Audit

Nada muda: mesma authz, mesmos selects, sem trilha nova.

## 2. TDD — cenários (RED primeiro)

- `src/common/plan-state-machine.spec.ts` — tabela de transições 1:1 do
  legado (6 estados, pares válido+inválido); `assertValidTransition` lança com
  mensagem que cita `from → to`; terminal `ARCHIVED` não sai para nada.
- `src/common/subscription-limits.spec.ts` — prioridade admin → partner →
  SaaS → free; `null` = ilimitado (sem count); pool flexível multiplica por
  alunos reais; SaaS premium ilimitado; free bloqueia.
- `training-plans.service.spec.ts` (existente, +casos): PENDING→COMPLETED
  direto vira 400; REJECTED→PENDING passa; edição sem `status` não checa.
- `students.service.spec.ts` (existente, +casos): SaaS ativo cria aluno;
  free bloqueia com mensagem SaaS.
- Nenhum teste existente apagado ou alterado (só adição).

## 3. Implementação (só após RED)

`common/plan-state-machine.ts`, `common/subscription-limits.ts`, gancho em
`atualizar()`, delegação nos dois services. Mensagens idênticas ao legado.

## 4. Verificação

`npm run typecheck`, `npx jest src/common src/training-plans src/students`,
`nest build`.
