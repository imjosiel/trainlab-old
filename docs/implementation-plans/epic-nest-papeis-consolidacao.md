# Fatia 10 — Consolidação dos escritores de `roles`

**Estado:** spec escrita, nada implementado.

A fatia 6 enumerou os escritores de `roles` e corrigiu **um** deles (`/api/onboarding`, A17/D41). Esta fatia trata os que sobraram. O achado que justifica a urgência está na próxima seção.

## A42 — o `invite` pode destruir papéis financeiros, e o gatilho é o token defasado

**Correção de uma afirmação errada minha.** A primeira versão desta spec acusava
`quick-role/route.ts:56` de apagar papéis. **Está errado.** Aquela escrita é
guardada:

```js
const user = await prisma.user.findUnique({ where: { id: session.id }, select: { roles: true } })
const existingRoles = (user?.roles ?? []).filter(r => r !== 'PENDING')
const isNewUser = existingRoles.length === 0
if (isNewUser) { /* …a escrita… */ }   // senão: só redireciona, sem escrever
```

Eu li a linha que o grep apontou e concluí a consequência sem ler o fluxo em
volta. O `quick-role` está **correto** — e a razão é específica: ele lê os papéis
**do banco**, valor fresco.

### O defeito real está no `invite`, e são dois

`app/api/invite/[token]/route.ts:48-51`:

```js
const currentRoles = session.roles ?? []          // ← do TOKEN, não do banco
const rolesToSet   = (currentRoles.length === 0 ||
                     (currentRoles.length === 1 && currentRoles.includes(ROLES.PENDING)))
  ? [ROLES.STUDENT]                               // ← SUBSTITUIÇÃO total
  : null
```

**Defeito 1 — nega o papel que o convite concede.** Um usuário `[ATHLETE]` que
aceita convite de aluno cai no `null`: ganha o vínculo `trainerAthlete` e o
`student.userId`, mas **não recebe `STUDENT`**. A guarda pergunta "o usuário é
novo?" quando a pergunta correta é "quais papéis preservar?".

**Defeito 2 — token defasado torna a escrita destrutiva.** A guarda lê
`session.roles`, e `lib/auth.ts:138` só refresca do banco a cada
**15 minutos** (ou em `trigger === 'update'`). Dentro dessa janela, token e banco
divergem — e a escrita é substituição total.

Sequência que alcança o estrago, e ela é realista:

1. Usuário `[PENDING]` passa pelo `quick-role` com `role=PARTNER`. O banco vira
   `[TRAINER, PARTNER]` e uma `PartnerAccount` é criada. **O token não é
   refrescado** — `quick-role` termina em `redirect`, que não dispara `update`.
2. Dentro dos 15 minutos, o mesmo usuário aceita um convite de aluno.
3. A guarda lê `session.roles` = `[PENDING]` (defasado), entra no ramo, e grava
   `roles: [STUDENT]`.
4. Resultado: `roles = [STUDENT]`, `PartnerAccount` **aprovada e órfã**. Sem
   acesso a receita nem ofertas, com conta de parceiro ativa no banco.

É o mesmo estado inconsistente que motivou apagar a rota `update-role` na fatia 6
(A17), por um caminho diferente.

**A assimetria é o achado central**: `quick-role` lê do **banco** e por isso é
seguro; `invite` lê do **token** e por isso não é. Duas guardas de forma quase
idêntica, com garantias opostas — e a diferença não está na guarda, está na
**fonte do dado**.

### Por que eu não vi isso na fatia 6

Naquela fatia eu *enumerei* os escritores e tabelei "sobrescreve: sim/não" lendo
a linha da escrita. Uma tabela feita da linha do `grep` não distingue escrita
guardada de escrita solta, nem registra **de onde vem** o valor da guarda — que
aqui é exatamente o que decide se há bug. Enumerar não é auditar.

---

## Os escritores, um por um

Levantados com padrão ancorado em escrita Prisma (`data: { … roles`), não por substring — a lição do A43 abaixo.

| # | escritor | como grava | preserva? | veredito |
|---|---|---|---|---|
| 1 | `lib/auth.ts:183` | `systemRoles: { set: [ADMIN] }` + `roles: { set: [TRAINER, ATHLETE] }` | **não** | A22 — ver abaixo |
| 2 | `lib/auth.ts:285` | `roles: { push: PARTNER }` | sim (`push`) | ok |
| 3 | `quick-role/route.ts:56` | `roles: finalRoles` | sim — guarda lê do **banco** | ok (minha acusação inicial estava errada) |
| 4 | `invite/[token]/route.ts:64` | `roles: rolesToSet` | **NÃO** — guarda lê do **token** | **A42 — corrigir** |
| 5 | `partner/apply/route.ts:85` | `roles: [...currentRoles, PARTNER]` | sim | ok |
| 6 | `partner/settings/route.ts:55` | `Set([...currentRoles, ...rolesToAdd])` | sim | ok |
| 7 | `admin/partners/[id]/route.ts:64,70,74` | `set` com união/filtro sobre `userRoles` | sim | ok (é admin, deliberado) |
| 8 | `onboarding/route.ts` | preserva financeiros | sim | corrigido na fatia 6b (D41) |
| 9 | Nest `users.service.ts` `updateOwnProfile` | `resolverPapeis` | sim | ok (A38 verificado) |

**Um defeituoso de nove**, mais o A22 a endurecer. Os outros sete preservam — e é a maioria estar certa que torna o errado difícil de ver.

Repare que as linhas 3 e 4 têm a **mesma forma**: guarda de "usuário é novo?" antes de uma escrita por substituição. A diferença inteira está em **de onde a guarda lê** — banco (fresco) contra token (até 15 min defasado). Uma tabela que só registrasse `preserva: sim/não` pela linha da escrita colocaria as duas no mesmo lugar, e foi isso que me fez errar na fatia 6 e de novo hoje.

### O A22 continua vivo, e agora eu entendo o alcance

`lib/auth.ts:176-190` — "Safety First Admin": no callback do JWT, se o usuário **não** é admin e **não existe nenhum admin no banco**, ele é promovido a `systemRoles: [ADMIN]` e tem `roles` **substituído** por `[TRAINER, ATHLETE]`.

É intencional (banco novo precisa de um primeiro admin) e a condição é estreita. Mas duas coisas merecem estar escritas:

1. **É o único lugar do sistema que escreve `systemRoles`** fora do painel admin. Roda no caminho de login, para qualquer usuário.
2. Ele **substitui** `roles`. Se o único usuário de um banco recém-restaurado for um `PARTNER`, ele ganha admin e **perde** `PARTNER`.

O cenário exige "nenhum admin no banco", que em produção é improvável — mas é exatamente o estado de um banco restaurado de backup parcial, ou de um ambiente novo com dados importados. Não vou mudar o comportamento nesta fatia (é decisão de produto), mas vou fazê-lo **preservar** `roles` em vez de substituir, e registrar a decisão.

## A43 — como eu erraria este levantamento (e errei hoje, duas vezes)

Antes de tabelar, precisei escolher o padrão de busca. As duas armadilhas que já me pegaram nesta sessão:

- **Substring**: procurar `api/users/public` casa `api/backend/users/public`. Contei um consumidor **já migrado** como legado e construí uma recomendação inteira sobre isso. Padrão ancorado (`'/api/users/public`) resolve.
- **Olhar onde eu espero**: verifiquei se `/api/my-trainers` tinha teste com `ls __tests__/api/my-trainers*` — mas o `testMatch` do Jest é `**/?(*.)+(spec|test).[jt]s?(x)`, que varre **qualquer** diretório. A suíte podia estar colocada em `app/api/`, e minha checagem me deu confiança falsa.

Para esta fatia, o padrão é `data: {` seguido de `roles`, e a conferência é `grep -c` do total de `prisma.user.update` que mencionam `roles` — se a soma não fechar com a tabela, a tabela está incompleta.

---

## Decisões

### D54 — o critério passa a ser "que papéis preservar", não "o usuário é novo"

Os dois escritores defeituosos serão reescritos sobre a mesma função pura, com a semântica que já vige no Nest (`resolverPapeis`): **papéis de produto** (`PENDING`, `TRAINER`, `ATHLETE`, `STUDENT`) são substituíveis; **papéis financeiros e administrativos** (`PARTNER`, `AFFILIATE`, `PARTNER_B2B`) são preservados sempre.

Aplicado ao `invite`, isso corrige os dois defeitos dele de uma vez: passa a conceder `STUDENT` a quem já tem papéis, e para de destruir os financeiros quando o token está defasado.

**E a regra sozinha não basta aqui.** Enquanto a guarda ler `session.roles`, ela decide sobre dado que pode ter 15 minutos. A correção precisa ler os papéis **do banco**, dentro da transação — que é o que o `quick-role` já faz e o que o torna seguro.

### D55 — a função vive em `lib/`, não duplicada no Nest

O Nest já tem `resolverPapeis` em `apps/backend/src/users/update-profile.ts`. Duplicar a regra no web é criar a mesma divergência que esta fatia existe para acabar.

Mas o web **não pode importar** de `apps/backend` (client Prisma isolado, dependências próprias). Então: a função canônica passa a viver em um módulo compartilhado sem dependência de Prisma, e as duas pontas importam dele. Se isso exigir mudar o `tsconfig` dos dois apps, é custo aceitável — o alternativo é manter duas cópias de uma regra de autorização.

### D56 — o Safety First Admin preserva `roles`

Muda de `roles: { set: [TRAINER, ATHLETE] }` para união com os atuais. A promoção a admin continua; o que para é a destruição de papéis financeiros junto.

Não vou mexer na existência do mecanismo: decisão de produto, e a condição ("nenhum admin no banco") é a intenção declarada.

### D57 — nenhum destes escritores migra para o Nest nesta fatia

A tentação é migrar `quick-role` e `invite` de uma vez. Não: são fluxos com efeitos colaterais além de `roles` (cria `PartnerAccount`, `AffiliateAccount`, `TrainerAthlete`, consome convite em transação). Misturar "corrigir a regra de papéis" com "trocar de runtime" torna impossível dizer qual mudança causou o quê.

Corrigir aqui, migrar depois. **Uma variável por vez** — o mesmo princípio do D45.

---

## Propriedades a provar

1. `quick-role` com `role=ATHLETE` num usuário `[TRAINER, PARTNER]` deixa `roles` contendo `PARTNER`.
2. `quick-role` com `role=ATHLETE` num usuário `[PENDING]` resulta em `[ATHLETE]` (sem `PENDING` sobrando).
3. `invite` aceito por usuário `[ATHLETE]` resulta em `roles` contendo **`STUDENT` e `ATHLETE`**.
4. `invite` aceito por usuário `[PENDING]` resulta em `[STUDENT]`.
5. `invite` aceito por usuário `[TRAINER, PARTNER]` preserva `PARTNER` **e** concede `STUDENT`.
6. Safety First Admin num banco sem admin, com usuário `[PARTNER]`: ganha `ADMIN` em `systemRoles` **e mantém** `PARTNER` em `roles`.
7. Nenhum escritor aceita `systemRoles` vindo de corpo de requisição (já provado para o Nest no A38; provar para `quick-role` e `invite`).
8. A regra de preservação é **a mesma função** nos dois apps — provado por teste que importa do módulo compartilhado nas duas pontas.
9. Cada teste que afirma "preservou" também afirma **algo que mudou**, para não passar por vacuidade (lição do A40).

---

## A44 — o A22 dispara em QUALQUER rota autenticada, não só no login

Descoberto por acidente, verificando esta fatia. O primeiro cenário terminou com:

```
banco antes:  ['PENDING']
banco depois: ['TRAINER', 'ATHLETE', 'STUDENT']
```

`concederPapel(['PENDING'], 'STUDENT')` devolve `['STUDENT']`. Os outros dois
papéis não vieram desta fatia.

**Vieram do Safety First Admin.** A cadeia:

```
rota  →  getSessionOrToken(req)
      →  getServerSession(authOptions)      ← lib/auth-helpers.ts
      →  callback jwt de lib/auth.ts        ← aqui vive o A22
      →  se não existe nenhum admin: systemRoles: [ADMIN]
                                     roles: { set: [TRAINER, ATHLETE] }
```

A spec anterior descrevia o A22 como algo do "caminho de login". **Está errado**:
`getSessionOrToken` é o helper de autenticação de *toda* rota da aplicação, e ele
roda os callbacks. Então a promoção — e a **substituição de `roles`** — pode
acontecer em qualquer requisição autenticada de qualquer rota, sempre que o banco
não tiver admin.

Confirmado pelo padrão dos quatro cenários: só o **primeiro** foi afetado. Ele
criou o primeiro admin, e os três seguintes encontraram `anyAdmin` e escaparam.
Semeando um admin antes de tudo, o cenário 1 passa a dar exatamente `['STUDENT']`.

Isso eleva a severidade do A22: não é "cenário improvável de banco novo", é
"qualquer requisição num banco sem admin". O D56 (fazer o Safety First Admin
preservar `roles` em vez de substituir) deixa de ser endurecimento e passa a ser
correção.

## A45 — minha asserção frouxa escondeu exatamente isso

O cenário 1 passou como `ok: true` na primeira rodada, com
`['TRAINER', 'ATHLETE', 'STUDENT']` no banco. O motivo:

```js
esperados: ['STUDENT'], naoEsperados: ['PENDING']   // ← frouxo
```

`STUDENT` presente, `PENDING` ausente: os dois critérios satisfeitos. Os dois
papéis que eu não esperava não eram checados por ninguém.

Trocado por **igualdade exata** de conjunto. Os quatro cenários continuam
passando, e agora passam dizendo a verdade.

**A regra, e ela é a mesma das vacuidades desta sessão em outra roupa:**
verificação que só compara com o que eu espero não vê o que eu não esperava.
Onde o estado final é pequeno e conhecido, afirmar igualdade exata em vez de
"contém" é a diferença entre um teste que confirma a hipótese e um que descreve
a realidade.

## Verificação

Testes primeiro, contra os defeitos: cada um dos dois escritores ganha um caso que **falha hoje** (`quick-role` apagando `PARTNER`; `invite` negando `STUDENT` a quem tem papel). Sem ver o vermelho, não há prova de que o teste exercita o caminho.

Depois, banco real: os fluxos tocam transação e criam registros relacionados, então a asserção final é sobre o estado no Postgres, não sobre o corpo da resposta.

## D56 — feito e verificado

`lib/auth.ts` passou a **conceder** em vez de substituir:

```ts
const papeisComAcesso =
  concederPapeis(freshUser.roles ?? [], [ROLES.TRAINER, ROLES.ATHLETE])
  ?? (freshUser.roles as string[])
```

A promoção a `systemRoles: [ADMIN]` continua idêntica — o que mudou é só a
destruição colateral. `freshUser.roles` já estava em escopo: nenhuma consulta a
mais.

**Por que o defeito sobreviveu tanto tempo:** para um usuário `[PENDING]`,
substituir por `[TRAINER, ATHLETE]` e conceder `[TRAINER, ATHLETE]` dão **o mesmo
resultado**. O caso comum coincidia, então nada parecia errado. O teste
`usuário PENDING promovido termina exatamente com [TRAINER, ATHLETE]` **já passava
antes da correção** — está no arquivo justamente para registrar isso.

### Verificado

**Unitário** (`__tests__/auth-safety-first-admin.test.js`): 10 casos, chamando
`authOptions.callbacks.jwt` direto. 5 falhavam antes, todos passam agora.

**Postgres real**, banco sem nenhum admin, requisição a
`/api/user/subscriptions` — rota que **nada tem a ver com papéis**, que é o ponto
do A44:

| banco antes | banco depois | promovido |
|---|---|---|
| `[PARTNER_B2B]` | `[PARTNER_B2B, TRAINER, ATHLETE]` | sim |
| `[AFFILIATE]` | `[AFFILIATE, TRAINER, ATHLETE]` | sim |
| `[PENDING]` | `[TRAINER, ATHLETE]` | sim |

Igualdade exata de conjunto nos três.

### A46 — o verde falso que o anti-vacuidade pegou

A primeira rodada da verificação ao vivo usou `/api/backend/users/profile` e deu
**502** nos três cenários: o Nest não estava no ar. A rota nunca executou.

E o resultado era `banco_depois === banco_antes` — ou seja, os papéis estavam
**perfeitamente preservados**. Se a asserção fosse só "preservou", os três teriam
passado. O que reprovou foi `promovido_a_admin: false`.

Corrigido de duas formas: a asserção exige a promoção, e a rota passou a ser
**nativa do web** (`/api/user/subscriptions`) — verificar comportamento de
autenticação do web não deve depender do backend estar de pé.

**A regra**: quando o efeito esperado é "X não muda", o teste precisa afirmar
também "Y mudou". Sem isso, ambiente quebrado é indistinguível de código correto.


## Riscos

**`lib/auth.ts` é o emissor do token.** Mexer nele afeta toda sessão de todo usuário, e um erro ali não aparece como 500 numa rota — aparece como papéis errados no token, silenciosamente, até alguém perder acesso a uma tela. É o escritor que eu deixaria por último dentro da fatia.

**O convite é transacional.** A correção entra dentro do `$transaction` que o BUG-122 estabeleceu; mudar o que roda ali dentro exige reconferir que a falha continua revertendo `accepted → false`.
