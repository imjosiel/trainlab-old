# Fatia 13 — agendamentos no Nest

**Estado:** backend feito e verde. Cutover ainda não.

| suíte | antes | agora |
|---|---|---|
| unitários do backend | 244 | **342** (+98) |
| e2e contra Postgres | 173 | **194** (+21) |

`tsc --noEmit` limpo. No passo vermelho eram 97 de 98 e 21 de 21 falhando; o
único verde era o `[controle]` do filtro, que não toca o serviço.

### Verificação por mutação

Uma mutação por achado, para provar que os testes discriminam:

**1 — `participacao()` de volta à regra legada por papel** (`{ trainerId: userId }`):

```
× traz o que MARCARAM PARA ELE                      (e2e)
× alcança o que marcaram para mim como atleta B2C   (unit)
× alcança o que marcaram para mim como aluno B2B    (unit)
```

Exatamente as três que descrevem o A57, e nenhuma outra — a mutação é cirúrgica e
a cobertura também.

**2 — `inteiroNaFaixa` sem a checagem de tipo** (só faixa, como o legado):

```
23 de 42 unitários caem, e 2 e2e
```

Inclusive o `workStartHour="" → 400 e o banco NÃO muda`, que é o caso medido no
monolito respondendo 200 e gravando `0`.

Ambas revertidas, tudo verde de novo.

### A63 — a sétima vacuidade, num teste que eu mesmo acabara de escrever

Na primeira execução vermelha, **dois** unitários passaram. O segundo era meu:

```ts
await service.update(APT, sessao(), { status: 'CONFIRMED', title: 'invadido' }).catch(() => {})
const dados = prisma.appointment.update.mock.calls[0]?.[0]?.data ?? {}
expect(dados).not.toHaveProperty('title')
```

O `.catch(() => {})` engolia o `não implementado` e o `?? {}` transformava
**"nenhuma chamada aconteceu"** em **"chamada sem `title`"**. Dois caminhos para o
mesmo verde, e o que passou não exercitava nada.

O padrão é sempre o mesmo — um valor de fallback que faz a ausência parecer com o
sucesso. Corrigido pondo a asserção positiva primeiro:
`expect(prisma.appointment.update).toHaveBeenCalledTimes(1)`.

Depois da correção: 97 de 98 falhando, e o único verde é o controle.

## Escopo

Quatro rotas, 612 linhas no monolito:

| legado | verbo | o que faz |
|---|---|---|
| `/api/appointments` | GET | lista — profissional vê os seus, atendido vê os dele |
| `/api/appointments` | POST | cria (só profissional/admin), opcionalmente com Google Meet |
| `/api/appointments/[id]` | PATCH | edita; ações `generate-link` e `revoke-link`; atendido só confirma/cancela |
| `/api/appointments/[id]` | DELETE | apaga (profissional ou admin) |
| `/api/appointments/confirm/[token]` | GET | **pública** — dados do agendamento pelo link mágico |
| `/api/appointments/confirm/[token]` | POST | **pública** — confirma ou cancela pelo link |
| `/api/trainer/schedule-config` | GET/PATCH | expediente do profissional (horário e dias) |

Consumidores: `dashboard/appointments/page.js` (12 chamadas) e `confirm/[token]/page.js`
(2, públicas). Importam no cutover, não nesta fatia.

Três modelos: `Appointment`, `TrainerScheduleConfig`, `BlockedSlot`. Todos núcleo
— agenda é o que qualquer vertical reaproveita. O vocabulário é que é do vertical
(`trainerId`, `athleteId`, `studentId`), e fica (D59).

## Achados

### A57 — a lista escolhe o lado pelo PAPEL. De novo.

```ts
const isTrainer = session.roles?.includes(ROLES.PROFESSIONAL)
if (isTrainer || isAdmin) { /* where: { trainerId: session.id } */ }
// senão: OR: [{ athleteId: session.id }, { student: { userId: session.id } }]
```

É o **A50 literalmente outra vez**, uma fatia depois, noutro módulo. Quem acumula
`PROFESSIONAL` e `CLIENT` vê só o que **marcou**; o que marcaram **para ele**
desaparece da agenda.

**Medido contra o servidor rodando**, não deduzido:

```
status 200, total 1
vê o que ele MARCOU (é o profissional): true
vê o que MARCARAM PARA ELE (é o atleta): false   <-- deveria ser true
```

Aqui é pior que em mensagens. Lá a conversa sumia da lista mas abria pelo link
direto. Aqui o `PATCH` também usa participação (`appointment.trainerId === session.id ||
student.userId === session.id || athleteId === session.id`), então o usuário
**pode confirmar** um agendamento que a própria agenda dele não mostra.

Dois achados na mesma forma, em dois módulos, é padrão e não coincidência: o
legado usa **papel** como atalho para **participação** em toda listagem. Vale
procurar a mesma forma nos módulos que ainda faltam.

### A58 — `workStartHour` aceita string e grava `0` calado

O BUG-102 corrigiu exatamente esta classe em `workDays`, com comentário
explicando o mecanismo:

```ts
// BUG-102 fix: `d < 0 || d > 6` falha para strings não-numéricas porque
// NaN < 0 = false e NaN > 6 = false.
```

**A correção não foi aplicada aos campos irmãos, três linhas acima:**

```ts
if (workStartHour !== undefined && (workStartHour < 0 || workStartHour > 23))
```

`'abc' < 0` é `false`, `'abc' > 23` é `false` ⇒ passa. Medido ao vivo:

```
workStartHour="abc"  -> HTTP 500  banco=7   (Erro interno)
workStartHour=""     -> HTTP 200  banco=0
[controle] workStartHour=99 -> HTTP 400
```

O `''` é o caso grave: **200 OK e o expediente do profissional passa a começar
à meia-noite**, sem erro nenhum. `Number('')` é `0`, e `0` é hora válida. Não é
500 — é corrupção silenciosa de dado.

O controle em `99 → 400` está aí para provar que a validação existe e roda; sem
ele, "aceitou" seria indistinguível de "validação nunca executou".

### A59 — o Google Meet é criado ANTES da validação

Em `POST /api/appointments`, o bloco `if (createMeet)` está na linha 133; as
validações de `title`, `scheduledAt` e `studentId/athleteId` começam na 165.

Requisição sem `title` ⇒ evento criado no Google Calendar do profissional,
convite disparado para o participante, e a resposta é **400**. O agendamento não
existe no banco; o evento existe na agenda do Google. Ninguém limpa.

### A60 — só o aluno B2B é notificado de mudança de status

`POST` avisa os dois: `appointment.student?.user?.id ?? appointment.athleteId`.

`PATCH` avisa um: `if (status && appointment.student?.userId)`.

Atleta B2C (`athleteId`) **nunca** recebe notificação de confirmação,
cancelamento ou conclusão feita pelo profissional. Assimetria entre criar e
atualizar, dentro do mesmo módulo.

### A61 — o link mágico dura 7 dias; o schema diz que dura até o agendamento

```prisma
confirmExpiresAt DateTime?   // = scheduledAt (expira na hora do agendamento)
```

```ts
data: { confirmToken: token, confirmExpiresAt: new Date(Date.now() + 7*24*60*60*1000) }
```

Um agendamento para amanhã gera link válido por uma semana — seis dias depois de
já ter acontecido. Comentário de schema não é executável (mesma lição do A10).

### A62 — dois achados menores, registrados sem correção nesta fatia

- **`PUBLIC_SELECT` devolve o próprio `confirmToken`** na resposta pública. Quem
  chama já tem o token, então não é vazamento — mas é ecoar credencial sem
  motivo, e ela vai parar em log de proxy e histórico de navegador.
- **`POST /confirm/[token]` tem corrida**: `findByToken` → valida → `update`. Dois
  cliques simultâneos passam os dois pela validação; o segundo `update` não acha
  o token (já anulado) e vira **500** em vez de 409.

## Decisões

### D64 — participação, não papel (corrige A57)

Mesma correção do D60, e desta vez ela nasce compartilhada: um único predicado
de participação que a lista, o PATCH e o DELETE usam.

O filtro do atendido continua sendo `OR: [{ athleteId }, { student: { userId } }]`
— duas formas de estar do lado atendido, porque o modelo tem as duas.

Para usuário de papel único o resultado é **idêntico** ao legado. Admin com
`?trainerId=` continua enxergando a agenda de terceiro (é o único caso em que
papel legitimamente decide, e é `systemRoles`, não `roles`).

### D65 — validar tipo, não só faixa (corrige A58)

Helper único para hora e para dia da semana, exigindo inteiro de verdade antes de
comparar faixa. `''`, `'abc'`, `[]` e `{}` viram 400.

O legado já tinha o helper certo — em `workDays`. A correção é **usar o mesmo nos
três campos**, que é o que teria evitado o achado.

### D66 — Google Calendar vira porta, e roda DEPOIS da validação

`CalendarService` no backend, espelhando o `RealtimeService` do D62: efeito
externo isolado atrás de uma interface, para que "falhou lá fora, não derruba
aqui" seja demonstrável em teste.

Duas mudanças de ordem, ambas corrigindo o A59:

1. **Validar tudo antes de qualquer chamada externa.** Requisição inválida não
   toca no Google.
2. **Criar o evento depois de gravar o agendamento**, não antes. Se o Google
   falhar, o agendamento existe sem link — degradação. Na ordem atual, o Google
   pode ter sucesso e o banco falhar, e aí o evento é órfão sem nada apontando
   para ele.

`google-calendar.ts` lê os tokens OAuth da tabela `Account` (PrismaAdapter do
NextAuth), **não da sessão** — por isso pode mudar de casa: o Nest tem o mesmo
banco. Custo: `googleapis` (^173) como dependência do backend, e
`GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` no `.env` dele.

### D67 — as rotas de confirmação são `@Public()`

`/conversations/confirm/:token` no Nest com `@Public()`, e o prefixo entra na
whitelist do BFF. O link mágico chega por e-mail a quem pode não ter conta — é o
mesmo caso do `users/public`.

**O token É a autorização.** Nada de sessão, nada de papel; e a resposta segue
sendo o recorte mínimo (`PUBLIC_SELECT`), menos o próprio token (A62).

### D68 — A61 e a corrida do A62 entram; o eco do token também

- Expiração do link passa a ser `min(scheduledAt, agora + 7 dias)` — honra o que
  o schema promete sem alongar o que já era mais curto.
- A confirmação vira `updateMany` com o token no `where` (posse como filtro da
  escrita, D17): duas confirmações simultâneas, uma altera `count: 1` e a outra
  `count: 0` ⇒ **409**, não 500.
- `confirmToken` sai do select público.

### D70 — criar notificação no Nest exige emitir o push explicitamente

Bloqueio registrado desde a fatia 7 e que **vence agora**: `apps/web/lib/prisma.ts`
tem um `$extends` que intercepta `notification.create`/`createMany` e dispara
Pusher em `private-user-{userId}`. O `PrismaService` do Nest **não tem essa
extensão**.

Agendamento é o primeiro recurso migrado que **cria** notificação. Portado como
está, a linha entra no banco e o sino do usuário não recebe nada — e o silêncio é
total, porque o `trigger` do legado já engole erro com `.catch(() => {})`.

**Não vou replicar o `$extends` no Nest.** Ele é mágica: quem lê
`prisma.notification.create` não tem como saber que aquilo manda um WebSocket.
Foi cômodo no monolito e é justamente o tipo de acoplamento implícito que esta
reescrita existe para desfazer.

Em vez disso, `NotificationsService.criar()` grava **e** emite, explicitamente,
pela mesma porta do D62. Consequência de arrumação: o `RealtimeService` sai de
`src/messages/` para `src/realtime/`, ganha `emitirNovaNotificacao` e o canal
`private-user-{id}`, e passa a ser importado pelos dois módulos. Nomes de canal e
evento continuam os do legado (`new-notification`), senão o sino quebra.

**O teste que fecha isto** afirma que criar agendamento emite no canal do
destinatário — e o par não-vacuoso é que, com o Pusher fora do ar, o agendamento
**continua sendo criado** (mesma propriedade do D62).

### D69 — o que NÃO entra

- **`BlockedSlot` não tem rota própria** no legado (só vem embutido na config) e
  continua assim. Criar CRUD para ele é fatia própria.
- **Notificação continua fire-and-forget**, como no legado — mas passa a avisar
  o atleta B2C também (A60), porque a assimetria não é regra, é esquecimento.

## Contrato

```
GET    /appointments                    ?status=&from=&to=&page=&trainerId=(admin)
POST   /appointments
PATCH  /appointments/:id                { …campos } | { action: 'generate-link' | 'revoke-link' }
DELETE /appointments/:id
GET    /appointments/confirm/:token     @Public
POST   /appointments/confirm/:token     @Public  { action: 'confirm' | 'cancel' }
GET    /trainer/schedule-config
PATCH  /trainer/schedule-config
```

Formas de resposta idênticas ao legado — `{ appointments, total, page, pages }`,
`{ appointment, meetNotAvailable }`, `{ appointment, confirmUrl }`, `{ config }` —
porque as 14 chamadas do frontend já leem esses campos.

## Plano de testes

**Unitários** (Prisma e Calendar mockados):

- participação nos dois lados, com o **controle** provando que a regra por papel
  reprova o caso do atendido (D64)
- `''`, `'abc'`, `[]`, `{}`, `7.5` → 400 em `workStartHour`, `workEndHour` e
  `workDays`; e o controle `99 → 400` junto do positivo `10 → 200` (D65)
- nenhuma chamada ao Calendar quando o corpo é inválido (A59)
- falha do Calendar não derruba a criação (D66)
- `generate-link` nunca expira depois de `scheduledAt` (D68)
- atleta B2C recebe notificação de mudança de status (A60)

**e2e contra Postgres real:**

- agenda do usuário `['PROFESSIONAL','CLIENT']` traz os dois lados
- agendamento de terceiro → 404/403 nas rotas por id, **pareado** com o caso
  legítimo em 200 (A55 — a regra já custou cinco testes vacuosos)
- confirmação concorrente: uma 200, outra 409, nunca 500
- rota pública responde sem sessão **e** não devolve `confirmToken`
