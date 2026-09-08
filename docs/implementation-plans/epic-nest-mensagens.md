# Fatia 12 — mensagens no Nest

**Estado:** backend feito e verde. Cutover ainda não.

| suíte | antes | agora |
|---|---|---|
| unitários do backend | 208 | **244** (+36) |
| e2e contra Postgres | 151 | **173** (+22) |

`tsc --noEmit` limpo. No passo vermelho eram 35 de 36 e 22 de 22 falhando — o
único unitário que passava era o `[controle]`, e passar era o trabalho dele:
demonstrar que o avaliador de filtro reprova a regra legada.

## Verificação por mutação

Verde de primeira, num código que eu mesmo escrevi junto com os testes, é motivo
de desconfiança, não de comemoração. Então quebrei de propósito: troquei o filtro
de participação de volta pela regra legada por papel

```ts
private participacao(userId: string) {
  return { trainerId: userId };   // regra do legado
}
```

e rodei as duas suítes. Resultado: **10 e2e e 2 unitários falharam**, com
`a lista traz a conversa em que ele é CLIENTE` entre eles. Mutação revertida e
tudo verde de novo.

É a mesma técnica que usei no A47 corrompendo o `dist` do pacote compartilhado.
Um teste que nunca foi visto falhando não é evidência de nada.

## Escopo

Três rotas do monolito, todas em `apps/web/app/api/conversations/`:

| legado | verbo | o que faz |
|---|---|---|
| `/api/conversations` | GET | lista as conversas do requisitante, com prévia da última mensagem e contagem de não lidas |
| `/api/conversations` | POST | cria **ou recupera** a conversa entre um profissional e um cliente |
| `/api/conversations/[id]/messages` | GET | página de mensagens, mais antigas primeiro |
| `/api/conversations/[id]/messages` | POST | envia mensagem e dispara evento Pusher |
| `/api/conversations/[id]/read` | PATCH | marca como lidas as mensagens que a outra pessoa enviou |

Consumidores reais no frontend — 4 arquivos, que só importam no **cutover**, não
nesta fatia: `dashboard/messages/page.js`, `dashboard/students/page.js`,
`components/dashboard/dashboard-layout.jsx`, `components/dashboard/mini-chat.jsx`.

O modelo já é genérico o bastante para os forks: `Conversation` liga dois
usuários e `Message` pendura conteúdo. O que é do vertical são os **nomes** —
`trainerId`/`studentId` — e eles ficam (D59).

## Achados

### A50 — a lista de conversas decide o lado pelo PAPEL, não pela participação

```ts
const isTrainer = session.roles?.includes(ROLES.PROFESSIONAL)
where: isTrainer ? { trainerId: userId } : { studentId: userId }
```

Quem tem `PROFESSIONAL` vê **só** as conversas em que é o profissional. As
conversas em que a mesma pessoa é cliente somem da lista — não dão erro, não
aparecem vazias: não existem.

**Provei que o estado é alcançável**, não deduzi:

```
concederPapel(['PROFESSIONAL'], 'CLIENT')  ->  [ 'PROFESSIONAL', 'CLIENT' ]
```

E é exatamente o que `/api/invite/[token]:78` faz, sem condição nenhuma. Um
profissional que aceita o convite de outro profissional cai nesse estado. Foi a
fatia 10 que tornou a concessão aditiva — corrigindo o A42, em que ela **apagava**
papéis. A correção está certa; esta rota é que nunca soube lidar com acúmulo.

Não medi incidência: o banco de desenvolvimento está zerado (0 usuários, 0
conversas). A alcançabilidade é prova de código, que aqui vale mais que ausência
de dado.

As outras duas rotas do mesmo módulo **já filtram por participação**:

```ts
OR: [{ trainerId: session.id }, { studentId: session.id }]
```

Ou seja: o usuário de papel duplo consegue abrir e responder uma conversa pelo
link direto, mas ela não aparece na lista dele. As duas regras convivem no mesmo
módulo e discordam.

### A51 — cursor por `id`, ordenação por `lastMessageAt`

```ts
orderBy: { lastMessageAt: 'desc' },
...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
```

Campo do cursor ≠ campo da ordenação. É a mesma classe do BUG-65 tratada em
notificações (D18), agravada por duas coisas: `lastMessageAt` é **nullable**, e
não tem restrição de unicidade. Empate ou `NULL` e a página seguinte pula ou
repete linha.

Conversa recém-criada tem `lastMessageAt: null` — e em Postgres, `DESC` põe
`NULL` **primeiro**. Conversas vazias encabeçam a lista.

### A52 — o POST aceita os dois lados vindos do corpo

```ts
const { trainerId, studentId } = await req.json()
if (session.id !== trainerId && session.id !== studentId) → 403
```

A única checagem é que o requisitante seja **um** dos dois. O outro lado é
arbitrário: qualquer id de usuário serve. Não há verificação de vínculo
(`TrainerAthlete`), de papel, nem sequer de que o outro usuário exista — o
`upsert` cria a conversa e uma FK inválida vira 500.

Consequência: qualquer usuário autenticado abre conversa com qualquer outro e
manda mensagem. Canal de spam ou assédio sem porteiro.

### A53 — o Pusher dispara depois do commit, e o erro dele vira 500

```ts
const [message] = await prisma.$transaction([...])   // já commitado
await pusherServer.trigger(...)                      // pode falhar
```

Se o Pusher falhar, a mensagem **já está gravada**, mas o cliente recebe 500 e
reenvia. Duas mensagens iguais no banco, e o remetente vendo erro.

Não dá para pôr o `trigger` dentro da transação — ele é rede, não banco. O que dá
é decidir de que lado errar.

### A54 — o limite de 5.000 mede antes do `trim`, o banco guarda depois

`String(content).length > 5000` roda no valor cru; `content.trim()` é o que grava.
Mensagem de 5.000 caracteres com espaço no fim é rejeitada mesmo cabendo. Detalhe
pequeno, registrado porque é barato acertar junto.

### A55 — o 404 de posse é indistinguível do 404 de rota inexistente

Achado do **meu próprio teste**, na primeira execução vermelha. De 22 e2e, cinco
passaram — e eram exatamente os cinco que afirmavam `404`:

```
√ GET mensagens de conversa alheia → 404
√ POST mensagem em conversa alheia → 404 e nada gravado
√ PATCH read em conversa alheia → 404
√ conversa inexistente → 404, mesma resposta da alheia
√ outro participante inexistente → 404, não 500
```

Nenhuma rota existia. O Nest responde 404 a caminho desconhecido, então
"conversa alheia rejeitada" e "endpoint não implementado" produzem a mesma
resposta. O teste não estava provando posse — estava provando ausência.

Corrigido pareando: cada 404 vai junto com um caso legítimo que exige `200`/`201`
na **mesma rota**. O par positivo é o que prova que o endpoint existe; sem ele a
asserção passa no vazio. Depois do pareamento, 22 de 22 falham.

Quinta ocorrência desta família na sessão (A39, A40, A45, A46). O padrão já é
nítido o bastante para virar regra: **toda asserção de negação precisa de uma
afirmação ao lado que falhe se o alvo não existir.**

## Decisões

### D60 — participação como filtro, em toda rota do módulo

`where: { OR: [{ trainerId: userId }, { studentId: userId }] }` também na lista.
O papel deixa de participar da decisão.

Corrige o A50 e faz as três rotas usarem a mesma regra. Para usuário de papel
único o resultado é **idêntico** ao legado — a paridade não quebra; o que muda é
o caso que hoje está errado.

O teste desse achado precisa ser não-vacuoso: além de "a conversa como cliente
aparece", tem que afirmar que ela **não aparecia** com a regra por papel. Sem
isso, um filtro furado passaria igual.

### D61 — ordenação total, cursor preservado

```ts
orderBy: [{ lastMessageAt: 'desc' }, { id: 'desc' }]
```

O `id` como desempate torna a ordem determinística, que é o que o cursor do
Prisma exige para não pular nem repetir. O parâmetro continua sendo um
`conversationId`, então **o frontend não muda** — importa no cutover.

Escolhi isto em vez de trocar o cursor para `lastMessageAt` porque o campo é
nullable: cursor sobre `NULL` não tem semântica de "anterior a".

### D62 — Pusher no backend, e falha de entrega não derruba a escrita

O Nest passa a ser dono do evento: quem grava a mensagem dispara o
`private-conversation-{id}`. Nomes de canal e evento são contrato com o cliente e
ficam **iguais** (`new-message`), senão o cutover quebra o tempo real.

Sobre o A53: o `trigger` sai do caminho da resposta. Mensagem gravada é sucesso;
falha de entrega vira log, não 500. O tempo real é otimização de latência — o
cliente já reconcilia por fetch, como fizemos no sino de notificações. Perder o
evento atrasa; devolver 500 numa escrita que funcionou **duplica**.

### D63 — o A52 não é corrigido nesta fatia

Fechar o POST exige decidir *quem pode iniciar conversa com quem*, e isso é regra
de produto, não port: só profissional inicia? Só com vínculo ativo? Cliente pode
procurar profissional antes de contratar? Cada resposta muda o fluxo comercial.

Fica registrado e proposto como fatia própria. O que **entra** aqui é o barato e
sem ambiguidade: rejeitar `trainerId === studentId` e devolver 404 quando o outro
usuário não existe, em vez de 500 por violação de FK.

## Contrato

Base do backend, montada em `/conversations`. Erros seguem o filtro global
(`{ error: string }`), autenticação pelo guard global.

```
GET    /conversations                    ?cursor=<conversationId>
POST   /conversations                    { trainerId, studentId }
GET    /conversations/:id/messages       ?before=<messageId>
POST   /conversations/:id/messages       { content }
PATCH  /conversations/:id/read
```

Formas de resposta idênticas ao legado — `{ conversations, nextCursor }`,
`{ messages }`, `{ message }`, `{ conversation }`, `{ ok: true }` — porque os
quatro consumidores já leem exatamente esses campos.

**404 para conversa alheia**, não 403: existir e não ser sua é indistinguível de
não existir (D16), e o legado já faz isso.

## Plano de testes

**Unitários** (Prisma mockado) — regra, não banco:

- lista filtra por participação nos dois lados; o de papel duplo vê as duas (D60)
- cursor pede ordenação total (D61)
- `nextCursor` só quando a página encheu
- conteúdo vazio, só espaço e >5.000 → 400; 5.000 com espaço no fim → aceito (A54)
- mensagem gravada com `trim`
- falha do Pusher **não** derruba o POST (D62)
- `trainerId === studentId` → 400

**e2e contra Postgres real** — posse e paginação só se provam com banco:

- três usuários, um deles com `['PROFESSIONAL','CLIENT']`, e a asserção do A50
- conversa de terceiro por id direto → 404 nas três rotas
- `read` marca só as da outra pessoa, e não mexe nas próprias
- páginas de mensagens sem pulo nem repetição com `createdAt` empatado

## Cutover — feito

12 chamadas em 4 arquivos apontam para `/api/backend/conversations`. As três
rotas legadas e o teste que as cobria foram apagados.

O frontend **não mudou de forma**: os consumidores já liam `res.ok` (nenhum
comparava com `200`, o que importava porque o Nest devolve `201` no POST) e já
liam `conversations`, `messages`, `message`, `conversation`, `unreadCount`. O
cursor continua sendo um `conversationId` por causa do D61.

`/api/pusher/auth` **fica no monolito**: autoriza canal privado a partir da
sessão NextAuth do navegador. Agora os dois lados falam com o Pusher — a web
autoriza, o Nest publica — e precisam das MESMAS credenciais, senão o cliente
assina um canal de uma conta e o evento sai por outra.

### Verificação ao vivo

15 checagens pelo caminho real — cookie de sessão NextAuth → BFF → Nest →
Postgres, com um usuário `['PROFESSIONAL','CLIENT']` de verdade. Todas passam,
incluindo a que define a fatia: a lista traz a conversa em que ele é **cliente**.

Os e2e já cobriam o Nest sozinho. O que só aqui se prova é que o BFF repassa o
token e que a rota legada morreu.

### A56 — o catch-all transformava 404 em 500

A checagem "a rota legada não existe mais" falhou com **500**.

`app/api/[[...path]]/route.ts` é um catch-all opcional que recebe todo `/api/*`
não atendido, e chamava `connectToMongo()` como primeira linha do `try`. Sem
`MONGO_URL` — que não existe neste ambiente — a conexão lança, cai no `catch` e
devolve 500. O ramo 404 do próprio arquivo era inalcançável.

Vale para **toda** rota que qualquer cutover apagar, e o sintoma engana: parece
defeito de servidor, é rota que não existe.

Corrigido movendo o casamento da rota para antes da conexão. As três rotas do
catch-all (`/root`, `/`, `/status`) seguem iguais; o resto volta a ser 404.
Medido depois: `/api/root` → 200, `/api/qualquer-coisa` → 404.

## Fica de fora

- **A52.** D63 — regra de produto, fatia própria.
- **`PUSHER_*` no `apps/backend/.env`.** Ausentes hoje. Sem elas o serviço não
  quebra (o cliente é construído preguiçosamente e a falta é tolerada), mas não
  há entrega em tempo real: o outro lado só vê a mensagem no próximo fetch.
  Documentadas em `apps/backend/.env.example`.
