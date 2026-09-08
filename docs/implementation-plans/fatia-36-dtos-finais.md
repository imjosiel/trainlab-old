# Fatia 36 — DTOs finais (profile, invites, notes, confirm)

**Estado:** SDD (este documento). Nada implementado. Testes ainda não escritos.

## 1. SDD

### Alvos (últimos pontos sem DTO)

| Ponto | Forma atual | DTO |
|---|---|---|
| `PATCH /users/profile` | `Record<string, unknown>` | `UpdateOwnProfileBody`: 6 campos opcionais da allowlist (username, bio, isPublic, name, role, phone). **Atenção D30**: papel fora da lista responde 200 sem alterar — o DTO NÃO pode `IsIn` no `role`, senão vira 400 e quebra o contrato. `role` fica `IsOptional + IsString`. |
| `POST /students/invite` etc. | `@Body('email') email: unknown` (×2), `@Body('token') token: unknown` | `InviteEmailBody { email }`, `InviteTokenBody { token }`, com `IsEmail`/`IsNotEmpty`. Services mantêm as checagens (dupla barreira). |
| `POST /students/:id/notes` | `{ content: string }` inline | `CreateNoteBody { content }` (`IsString + IsNotEmpty + MaxLength(2000)` — service corta em 2000). |
| `POST /appointments/confirm/:token` | `{ action?: unknown }` inline | `ConfirmAppointmentBody { action?: confirm\|cancel }`. Ação fora vira 400 no pipe em vez de cair no `else` do service. |

### Decisões

- **D121 — `role` do profile sem `IsIn`.** Peculiaridade D30 preservada de
  propósito: papel fora da lista = 200 sem alterar nada. DTO valida que é
  string quando presente; a lista fechada continua no `resolverPapeis`.
- **D122 — invites mantêm validação no service.** `EMAIL_REGEX` + teto 254 +
  cooldown continuam lá; DTO só garante forma (string presente).
- **D123 — D113 mantido.** Nenhuma regra muda.

## 2. TDD — cenários (RED primeiro)

`src/users/dtos.spec.ts`, `src/students/invites-dtos.spec.ts`,
`src/appointments/confirm-dto.spec.ts` (ou junto ao dtos existente).

## 3/4. Implementação / Verificação

DTOs + troca nos 4 controllers. `npm run typecheck`, specs, `nest build`.
