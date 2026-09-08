# Fatia 38 — JWT do Jitsi self-host (moderador garantido)

**Estado:** backend feito e verde. Infra Jitsi (servidor) ainda não.

Contexto: o embed do `meet.jit.si` é demonstração e cai em 5 min (fatia 37 usou
nova aba como contorno). Esta fatia prepara o backend para o Jitsi próprio
(`JITSI_DOMAIN` = domínio self-host), mantendo `meet.jit.si` e Daily intactos:
sem segredo configurado, nada muda.

## 1. SDD — Security-Driven Development

### Threat model (STRIDE)

| Vetor | Descrição | Controle |
|---|---|---|
| Spoofing | Aluno forja token se passando por treinador/moderador | Token mintado só no backend (HMAC HS256 com `JITSI_JWT_SECRET`); `moderator` derivado do lado do agendamento (dono/admin), nunca do corpo |
| Elevation | Aluno chega primeiro e vira moderador (corrida da fatia 37) | `context.user.moderator: true` só para dono da agenda/admin; atendido recebe `false`. Prosody (`token_affiliation`/`token_owner`) aplica |
| Tampering | Token de uma sala reusado em outra | Claim `room` = nome exato da sala (nunca `*`); Prosody compara com a MUC (`token_verification`) |
| Replay | Token vazado reutilizado depois da aula | `exp` curto = `fim da sessão + 30min` (mesma margem da sala Daily); sem refresh — expirou, pede outro via `GET :id/video` (participante) |
| Info Disclosure | Segredo JWT ou token alheio vazam | `JITSI_JWT_SECRET` só no backend; token sai só em `GET :id/video` para participante (D64); nunca no link mágico público nem em log |
| DoS | Mint em loop | Reuso do throttle existente (`POST :id/video` 10/10min); `GET` não minta — token é gerado no POST e persistido? Não: token é efêmero, gerado por leitura autenticada, mas sem custo externo (HMAC local), então sem throttle novo |

Fora de escopo: a infra Jitsi (Prosody `authentication = "token"`, `app_id`,
`app_secret`, `token_verification`, TURN) — documentada em `docs/` + exemplo de
compose, sem teste. Gravação, transcrição, lobby e salas >2 ficam para fatias futuras.

### Decisões

- `VideoService.mintJitsiToken({ roomName, userId, displayName, email, moderator })`
  → JWT HS256 com payload:
  `{ aud: JITSI_APP_ID, iss: JITSI_APP_ID, sub: <domínio Jitsi>, room: <roomName>, exp, context: { user: { id, name, email, moderator } } }`.
  `exp` = `agora + duração restante da sessão + 30min`, teto de 12h (evita token
  eterno em agendamento mal datado).
- `moderator = true` se `userId === trainerId` ou `isAdmin`; senão `false`.
  Decisão no `AppointmentsService` (tem o agendamento), não no `VideoService`
  (não conhece domínio) — mesma separação D66/D62.
- `GET :id/video` passa a devolver `{ provider, roomName, joinUrl, token? }`:
  `token` só quando `provider === 'jitsi'` E domínio próprio (≠ `meet.jit.si`) E
  `JITSI_JWT_SECRET` presente. `meet.jit.si` nunca recebe token (inútil lá e
  vazaria estrutura). Daily inalterado.
- `POST :id/video` idempotente como hoje (não reminta nada — token é por leitura).
- Frontend (mesma fatia, após GREEN): embed Jitsi com `jwt: token` quando presente;
  `meet.jit.si` continua no cartão de nova guia.
- Envs novas: `JITSI_JWT_SECRET`, `JITSI_APP_ID` (default `trainlab`).
  Sem `JITSI_JWT_SECRET`: `token` ausente, resto idêntico — fail-open seguro
  (Jitsi sem secure domain aceita sem token; com secure domain o Prosody nega,
  e o usuário vê o erro do próprio Jitsi, não 500 nosso).

### Auth & Authz

Ordem inalterada (401 → 403 → throttle). Participação D64 decide quem recebe
token; papel decide o `moderator`.

### Data Exposure / Audit

Token nunca em log (só `roomName`+`moderator`+`appointmentId`). Link mágico
público continua sem campo de vídeo.

## 2. TDD — cenários (RED primeiro, arquivos novos, nada apagado)

- `src/video/video-jwt.service.spec.ts`
  - sem `JITSI_JWT_SECRET` → `mintJitsiToken` lança erro explícito (quem engole
    é o chamador, padrão Meet/vídeo)
  - com segredo → decodifica (HMAC verify) e confere `iss/aud/sub/room/exp/context.user`
  - `moderator` não vem do argumento cru: teste chama via `AppointmentsService`
    (ver abaixo), não direto
  - `exp` respeita teto de 12h mesmo com sessão de 2 dias (dado esquisito)
  - `room: '*'` nunca: mint com `roomName` vazio → exceção (não gera curinga)
- `src/appointments/appointments-video-jwt.service.spec.ts`
  - dono/admin → `moderator: true`; atendido → `false` (os três lados: trainerId,
    athleteId, student.userId)
  - não-participante → 403 antes de qualquer mint (mock do mint nem é chamado —
    asserção de chamada primeiro, lição A63)
  - `meet.jit.si` → resposta sem `token` mesmo com segredo configurado
  - domínio próprio sem segredo → resposta sem `token`, sem erro
  - domínio próprio com segredo → `token` presente e verificável
- e2e `test/appointments-video-jwt.e2e-spec.ts`
  - treinador recebe token com `moderator: true` (decodifica sem verificar,
    confere claims); aluno recebe `moderator: false`; intruso 403
  - sem segredo no env do teste → sem `token`, resto 200 (par positivo do fallback)

## 3. Implementação (executada após RED confirmado)

- `jsonwebtoken`? Não — dependência nova só para HMAC. Usar `crypto` nativo
  (`createHmac('sha256')`) com base64url manual: zero deps, payload pequeno,
  e o teste verifica com o mesmo `crypto`. (Se o time preferir `jose`, trocar
  depois — interface `mintJitsiToken` isola.)
- `VideoService.mintJitsiToken`, fiação no `AppointmentsService.lerSalaDeVideo`
  (retorna `token?`), controller inalterado (forma sai do service), envs no
  `.env.example`, doc de infra Jitsi em `docs/` (compose de referência).
- Frontend: `jwt` no `JitsiMeetExternalAPI` quando `token` presente.

## 4. Verificação

- `npm run typecheck` limpo, `nest build` com exit code 0.
- Unitários da fatia: 2 suítes, 10 testes, tudo verde.
- e2e da fatia (`test/appointments-video-jwt.e2e-spec.ts`): 2 testes verdes contra Postgres real.
- Suíte unitária completa: 96 suítes, 1469 testes, tudo verde — sem regressão.
- e2e vídeo (37+38): 4 testes verdes.
- Frontend com `jwt` no embed: `next build` verde.
- Mutação de controle: `moderator` hardcoded `true` → teste de atendido (`moderator: false`) cai.
- Mutação de controle 2: `room: '*'` permitido → teste de curinga cai.
