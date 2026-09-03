# Fatia 30 — DTOs das interfaces (billing → resto)

**Estado:** SDD (este documento). Nada implementado. Testes ainda não escritos.

## 1. SDD

### Problema

O `ValidationPipe` global só valida o que tem decorador. As 48 interfaces
`Body/Query` nos services são tipos TS puros — somem em runtime. Na prática:
`@Body() body: CheckoutB2BBody` com `offerId?: unknown` aceita qualquer forma
e a checagem real acontece espalhada no service (`typeof x === 'string'` em
cada método). Funciona, mas a borda não protege: cada service reimplementa
sua própria validação de forma, e divergência é silenciosa.

### Escopo (por módulo, dinheiro primeiro)

| Lote | Módulo | DTOs |
|---|---|---|
| 30a | billing | `CheckoutB2B`, `CheckoutTier`, `Portal`, `Checkout`, `Cancel`, `Reactivate`, `CreateOffer`, `UpdateOffer`, `GrantOrRevoke`, pacotes de crédito (`Create/UpdatePackage` já têm validadores no service — viram decoradores) |
| 30b | appointments + students + training-plans/sessions | `Create/UpdateAppointment`, `BlockedSlot`, `ScheduleConfig`, `CreateStudent`, `UpdateStudentProfile`, `Create/Edit/UpdateSession`, `UpdatePlan`, `CreatePlan` |
| 30c | exercises + messages + sports + resto | `Criar/AtualizarExercicio`, `CreateConversation`, `SendMessage`, `Create/UpdateSport`, `Candidatar`, `TierBody`, queries de listagem |

### Decisões

- **D104 — DTO valida forma, service valida regra.** Tetos, tipos, presença
  e formatos vão para decoradores. Regra que precisa de banco (tier existe?
  oferta ativa? aluno é meu?) fica no service. Services mantêm as checagens
  (dupla barreira); DTO nunca remove validação, só adiciona na borda.
- **D105 — mensagens do service vencem.** Quando DTO e service discordarem
  na mensagem, o service já tem texto observado pelas telas — o DTO usa texto
  genérico e o service mantém o específico. Sem mudar contrato observado.
- **D106 — queries de listagem: tipar sem apertar.** `page/limit/cursor/q`
  viram `IsOptional + IsString`; tetos continuam nos helpers (`parsePage`,
  `parseLimit`). Query errada nunca quebra — só pagina diferente.

### Auth & Authz / Data Exposure / Audit / Rate-limit

Nada muda: mesma authz, mesmos selects, sem trilha nova, sem throttle novo.

## 2. TDD — cenários (RED primeiro, por lote)

- `src/<modulo>/dtos.spec.ts` — por DTO: forma boa passa, forma ruim falha
  (par positivo+negativo, helper `achatar` recursivo das fatias 27/28).
- Specs existentes continuam verdes; nenhum teste apagado ou alterado
  (só adição).

## 3. Implementação (só após RED, por lote)

DTOs em `src/<modulo>/dtos.ts`; interfaces antigas viram `type` alias do DTO
ou são removidas com import atualizado; controllers trocam o tipo do `@Body`.

## 4. Verificação (por lote)

`npm run typecheck`, `npx jest src/<modulo> src/common`, `nest build`.
