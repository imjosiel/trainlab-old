# Fatia 37 — Vídeo 1:1 (Daily free-tier + fallback Jitsi)

**Estado:** backend feito e verde. Cutover/frontend ainda não.

Meet/Google Calendar continuam intactos e opcionais (`createMeet` → `meetNotAvailable`).
Esta fatia é **aditiva**: provedor de vídeo próprio para 1:1 professor-aluno,
sem verificação Google, sem por-minuto no início.

## 1. SDD — Security-Driven Development

### Threat model (STRIDE)

| Vetor | Descrição | Controle |
|---|---|---|
| Spoofing | Link de sala adivinhável (`/sala-123`) permite entrar em aula alheia | `roomName = trainlab-<6 do id>-<16 hex aleatórios>`, gravado uma vez; nunca reutiliza título/id puro |
| Elevation / IDOR | Não-participante cria ou lê `joinUrl` de agendamento alheio | Reuso de `participacao()` (D64): dono da agenda, atleta B2C ou aluno B2B; admin passa; resto 403. `joinUrl` nunca em resposta pública de `confirm/:token` |
| Tampering | Cliente escolhe `provider: 'x'` arbitrário ou injeta `joinUrl` próprio | `provider` é seleção do servidor (`VIDEO_PROVIDER` + disponibilidade de chave); DTO aceita só `'daily' \| 'jitsi' \| 'auto'`; `joinUrl`/`roomName` nunca vêm do corpo — são saída |
| Info Disclosure | Chave Daily ou domínio interno vazam no frontend/erro | `DAILY_API_KEY` só no backend; erro externo vira `{ error }` genérico PT-BR + `videoNotAvailable: true`, sem corpo do provider; frontend recebe só `joinUrl` |
| DoS / custo | Criação de sala em loop estoura free-tier Daily (10k min/mês) ou cota | `@Throttle()` na rota de criação (10 / 10min por usuário); `exp` da sala = `scheduledAt + duration + 30min`; reuso: se `videoRoomName` existe, não cria de novo |
| Repudiation | Sala criada sem rastro (quem, quando, qual provider) | Log com `appointmentId`+`provider` (sem URL/token); `Appointment.videoProvider/videoRoomName/videoJoinUrl` persistem a decisão |

Fora de escopo: Jitsi self-host (`meet.meudominio.com.br`) — esta fatia lê
`JITSI_DOMAIN` via env, com default `meet.jit.si` só para MVP; JWT/lobby do
Jitsi, gravação, transcrição e salas >2 participantes ficam para fatias futuras.
Remover o Meet fica para cutover futuro — nada aqui desliga o Calendar.

### Decisões

- Módulo novo `src/video/` (`VideoService`), registrado no `AppointmentsModule`
  (mesmo padrão do `CalendarService` — porta separada D66/D62, testável sem HTTP).
- Seleção de provider (servidor decide):
  `VIDEO_PROVIDER=daily|jitsi|auto` (default `auto`).
  `auto` = Daily se `DAILY_API_KEY` presente, senão Jitsi.
  Pedido explícito `daily` sem chave → fallback Jitsi + `videoNotAvailable: false`
  mas `provider: 'jitsi'` (documentado na resposta — nunca 500).
- Daily via REST `POST https://api.daily.co/v1/rooms` com `fetch` nativo
  (sem SDK — evita dependência server-side nova):
  `{ name, privacy: 'private', properties: { max_participants: 2, exp, enable_screenshare: true } }`.
  `exp` = `(scheduledAt + durationMinutes*60 + 1800)s`.
  `joinUrl` = `url` retornada pela API.
- Jitsi sem chamada externa: `https://<JITSI_DOMAIN>/<roomName>`.
- Persistência em `Appointment`: `videoProvider String?`, `videoRoomName String?`,
  `videoJoinUrl String?` (migration nova; nada existente muda).
- Fluxo grava-antes (D66): agendamento existe primeiro; vídeo é opcional e
  não-crítico — falha externa → `videoNotAvailable: true`, nunca 500 em escrita
  que funcionou. `POST appointments/:id/video` é idempotente por agendamento:
  segunda chamada devolve a mesma sala.
- `GET appointments/:id/video` devolve `{ provider, roomName, joinUrl }` só para
  participante; 404 se nunca gerada (não gera por GET — evita SSRF/custo em leitura).
- Throttle: `POST appointments/:id/video` 10 req / 10min por usuário.
- Frontend (fatia seguinte, não nesta): rota `/dashboard/appointments/[id]/video`
  que busca o GET via BFF e embute Daily Prebuilt (iframe) ou Jitsi
  (`external_api.js`); botão "Iniciar vídeo" quando `videoJoinUrl` existe.

### Auth & Authz

Nada muda na ordem: `NextAuthJwtGuard` (401) → `RolesGuard` (403) →
`ThrottlerGuard`. Participação decide visibilidade (D64), papel só decide
criação de agendamento (já existente).

### Data Exposure / Audit

`CAMPOS_PUBLICOS` do link mágico **não** ganham campo de vídeo. Selects de vídeo
só nas rotas autenticadas de participante. Log sem URL.

## 2. TDD — cenários (RED primeiro, arquivos novos, nada apagado)

- `src/video/video.service.spec.ts`
  - sem chave Daily + `auto` → Jitsi com `roomName` no formato `trainlab-…`
  - `daily` pedido sem chave → fallback Jitsi, sem exceção
  - Daily com chave (fetch mockado) → `POST /v1/rooms` com `privacy: private`,
    `max_participants: 2`, `exp` coerente; resposta vira `{ provider: 'daily', joinUrl }`
  - falha do fetch Daily → exceção mapeada (serviço não engole; quem engole é o
    `AppointmentsService`, como no Meet)
  - `roomName` duas chamadas distintas → diferentes (aleatoriedade real)
- `src/appointments/appointments-video.service.spec.ts` (ou extensão do spec atual)
  - `POST :id/video` em agendamento sem sala → cria, persiste os 3 campos,
    responde `{ video }`
  - segunda chamada → **não** chama o `VideoService`, devolve a mesma sala
  - não-participante → 403; inexistente → 404
  - falha do `VideoService` → 200 com `{ video: null, videoNotAvailable: true }`
    (espelha `meetNotAvailable`, nunca 500)
  - `GET :id/video` sem sala → 404; com sala → `{ provider, roomName, joinUrl }`
- `src/appointments/video-dto.spec.ts`
  - `CreateVideoBody`: aceita `daily|jitsi|auto|undefined`; rejeita outra string
- e2e `test/appointments-video.e2e-spec.ts`
  - participante cria e lê de volta; não-participante 403; idempotência real no Postgres

## 3. Implementação (executada após RED confirmado)

- migration Prisma (`videoProvider/videoRoomName/videoJoinUrl`), `VideoService`,
  `CreateVideoBody`, `POST/GET appointments/:id/video` + throttle, envs no
  `.env.example` (`DAILY_API_KEY`, `JITSI_DOMAIN`, `VIDEO_PROVIDER`),
  Swagger via decoradores.
- Controles positivo+negativo, sem `.catch(() => {})` que mascare ausência
  (lição A63); asserção de chamada antes de asserção de conteúdo.

## 4. Verificação

- `npm run typecheck` limpo, `nest build` com exit code 0.
- Unitários da fatia: 3 suítes, 16 testes, tudo verde.
- e2e da fatia (`test/appointments-video.e2e-spec.ts`): 2 testes verdes contra Postgres real.
- Suíte unitária completa: 94 suítes, 1459 testes, tudo verde — sem regressão.
- Migration aplicada: `20260904000000_add_video_fields_to_appointment`.
- Correção no GREEN: `@Optional()` sem união `| null` no construtor, pois a união
  virava `Object` no metadata e o Nest não resolvia o `VideoService` (e2e via `video: null`).
- Mutação de controle: `participacao()` restrita a `trainerId` → testes de
  403 do atendido caem (prova que o guard é o D64, não o papel).
