# Epic: Backend NestJS — Fatia 6: quem pode conceder papel, e a rota que sobrava

Sexta fatia. Ela começou como "migrar `/api/user/update-role`, 43 linhas, baixo risco" e virou outra coisa depois de uma pergunta: **a fatia 5 acabou de trancar a auto-atribuição de papel no `PATCH /users/profile`. Existe uma segunda porta?**

Existem quatro. E elas discordam.

---

## A16 — `roles` tem nove escritores, com nove regras diferentes

> **Esta seção foi reescrita.** A primeira versão dizia "cinco escritores" e listava cinco. Estava errada, e o erro é instrutivo — está registrado no A21, porque é sobre o método de levantamento, não sobre o código.

Levantamento correto: todo arquivo que chama `prisma.user.update/create/upsert` **e** menciona `roles`, inspecionado um por um.

### `roles` — papel de produto

| Onde | O que faz | Preserva os existentes? | Cria conta financeira? |
|---|---|---|---|
| `lib/auth.ts` — callback `jwt` | seta `[TRAINER, ATHLETE]` no bootstrap de admin | não | sim (`seedPlatformDefaults`) |
| `lib/auth.ts` — evento `createUser` | idem, em transaction | não | sim |
| `POST /api/onboarding` | os 6 de `VALID_ONBOARDING_ROLES` | **não — sobrescreve** (A17) | sim (`PARTNER`, `AFFILIATE`) |
| `GET /api/auth/callback/quick-role` | idem, **só se o usuário for novo** | não | sim |
| `PATCH /api/user/profile` | `PENDING, TRAINER, ATHLETE, STUDENT` | **sim** | não |
| `POST /api/partner/apply` | adiciona/remove `PARTNER_B2B` | sim | sim (`PartnerAccount`) |
| `PATCH /api/partner/settings` | adiciona `TRAINER` + `PARTNER_B2B` | sim | — |
| `POST /api/invite/[token]` | seta `STUDENT` se vazio ou só `PENDING` | condicional | — |
| `PATCH /api/admin/partners/[id]` | admin concede/revoga `PARTNER_B2B` | sim | — |
| ~~`PATCH /api/user/update-role`~~ | ~~`TRAINER, ATHLETE, STUDENT, AFFILIATE`~~ | ~~sim~~ | ~~**não** — daí o estado meio-feito~~ |

### `systemRoles` — privilégio

| Onde | O que faz | Gate |
|---|---|---|
| `lib/auth.ts` — callback `jwt` | `systemRoles: { set: [ADMIN] }` | **só se não existir nenhum admin no banco** (A22) |
| `lib/auth.ts` — evento `createUser` | idem, em transaction | idem |
| `PATCH /api/admin/users/[id]` | `systemRoles: newRoles` | admin autenticado |

O que a tabela revela e nenhuma rota isolada revelava: **a garantia da fatia 5 era local.** Eu escrevi, em `update-profile.ts`, que papel concedido por admin não pode ser auto-concedido. Isso é verdade *daquela rota*. `AFFILIATE` era auto-atribuível por outra, e `roles` é escrito por mais oito lugares.

**Lição de método**: uma garantia de autorização afirmada numa rota não é uma garantia do sistema. A pergunta que a produz é "quem mais escreve este campo?", e ela custa uma busca. Eu só a fiz porque a fatia seguinte por acaso era a rota vizinha — não por processo. Passa a valer como passo fixo: **antes de afirmar que um campo é protegido, enumerar seus escritores.**

## A17 — `/api/onboarding` sobrescreve `roles` em vez de preservar

```ts
if (role === ROLES.AFFILIATE) {
  finalRoles = [ROLES.AFFILIATE]   // ← descarta tudo que havia
  await createAffiliateAccount(session.id, session.name)
}
```

Só o ramo `STUDENT` faz merge com os papéis existentes. `AFFILIATE`, `PARTNER` e `BOTH` atribuem lista literal.

Consequência concreta: um `PARTNER_B2B` que passe pelo onboarding como afiliado **perde `PARTNER_B2B`** — enquanto a linha `PartnerAccount` continua existindo, aprovada, com Stripe conectado. Estado órfão: a conta existe, o papel que dá acesso a ela não.

As duas rotas de auto-atribuição têm o filtro de preservação justamente para evitar isso. O onboarding, que é onde o papel nasce, não tem.

## A18 — `createAffiliateAccount` grava consentimento sem evidência de consentimento

```ts
return await prisma.affiliateAccount.create({
  data: { userId, referralCode, termsAcceptedAt: new Date() },
})
```

`termsAcceptedAt` é, pelo comentário do próprio schema, "Data de aceite dos Termos de Afiliado". Nada no caminho prova que a pessoa viu os termos: a data é estampada pela criação da conta.

O contraste está no mesmo repo. O fluxo de parceiro tem `contractAcceptedAt` e uma tela com checkbox explícito (`app/[locale]/partner/apply/page.js`: `if (!termsAccepted) return`). O fluxo de afiliado registra o aceite sozinho.

**Decisão de Josiel: apenas registrar.** Consertar exige mexer na tela de onboarding, e nenhuma fatia religou tela ainda. Fica anotado que o campo, hoje, atesta "quando a conta foi criada" e não "quando a pessoa aceitou" — a diferença importa se alguém precisar comprovar o aceite.

## A19 — um `GET` que escreve papel e cria conta, e um ramo morto dentro dele

`GET /api/auth/callback/quick-role?role=X` atualiza `roles` e chama `createAffiliateAccount`/`createPartnerWithAffiliate`.

Escrita em `GET` é o formato de CSRF: um link visitado dispara a mudança. Aqui o alcance é pequeno e por um bom motivo — o bloco todo está atrás de `if (isNewUser)`, com `isNewUser` = nenhum papel além de `PENDING`. Usuário estabelecido não é afetado. **Preservado**, porque o guard existe e é o que limita o dano; registrado, porque o formato é enganoso.

Dentro dele, um ramo inalcançável:

```ts
const finalRoles = role === ROLES.PARTNER ? [...]
  : role === ROLES.BOTH ? [ROLES.TRAINER, ROLES.ATHLETE]   // ← nunca executa
  : [role]
```

`DASHBOARD_MAP` não tem chave `BOTH`, e a rota rejeita `role` fora do mapa na primeira linha. O ramo `BOTH` é inatingível.

Mesma família do A10 (a migration que prometia dois passos e executava um): **código que descreve uma intenção sem poder executá-la é indistinguível de código correto até alguém traçar o caminho até ele.**

## A20 — a documentação descreve as duas whitelists, e erra nas três vezes

`SELF_ASSIGNABLE_ROLES` e `VALID_ONBOARDING_ROLES` são descritas em três lugares. Nenhum bate com o código.

| Onde | O que diz | O que o código tem |
|---|---|---|
| `business_rules.md` §49 | `PENDING, TRAINER, ATHLETE, STUDENT` | `TRAINER, ATHLETE, STUDENT, AFFILIATE` |
| `business_rules.md` §61 (whitelists) | `[TRAINER, ATHLETE, STUDENT]` + "PENDING implícito" | idem acima — sem `PENDING`, com `AFFILIATE` |
| `business_rules.md` §61 | `VALID_ONBOARDING_ROLES: [ATHLETE, TRAINER, STUDENT, PARTNER_B2B, BOTH]` | os mesmos **mais `AFFILIATE`** |

E §49 afirma um comportamento que o código não tem:

> "O endpoint **não remove** roles existentes — apenas adiciona o novo role"

O código faz `{ set: mergedRoles }`, e `mergedRoles` só preserva os papéis **não** auto-atribuíveis. Um `TRAINER` que vira `ATHLETE` **perde `TRAINER`**. A doc descreve adição; o código faz substituição com preservação parcial.

O padrão que explica os cinco erros: **`AFFILIATE` foi acrescentado às duas whitelists depois, e nenhuma das três descrições foi atualizada.** O programa de afiliados é invisível na documentação de atribuição de papel enquanto está vivo em produção.

## A21 — meu próprio levantamento subcontou, e pelo motivo que o A16 alerta

A primeira versão do A16 dizia **cinco** escritores. São nove. O erro foi de busca:

```
grep "roles:\s*(\{\s*set|\[|finalRoles|mergedRoles)"
```

Isso procura **uma forma sintática de escrever**, não **o campo**. Perdeu tudo que grava `roles` com outra forma:

```ts
data: { roles: rolesWithoutPartner }                              // variável nomeada
data: { roles: Array.from(new Set([...currentRoles, ...add])) }   // expressão inline
data: updateData                                                  // objeto montado antes
data: { systemRoles: { set: [SYSTEM_ROLES.ADMIN] }, roles: … }     // outro campo primeiro
```

Quatro dos nove escritores caem nesses casos, incluindo o único que escreve `systemRoles` sem ser rota de admin.

O levantamento que funciona não parte da escrita, parte do **alvo**: listar quem chama `prisma.user.update/create/upsert`, filtrar quem menciona `roles`, e ler cada um. Nove arquivos, inspeção manual — barato.

**Lição, e ela é sobre confiança em grep**: `grep` de padrão de escrita responde "onde aparece esta forma", não "onde este campo é escrito". Para pergunta de segurança — *quem pode alterar isto?* — a diferença entre as duas é a resposta errada com cara de completa. Eu escrevi no A16 que enumerar escritores passa a ser passo fixo, e na mesma passada enumerei mal. O passo fixo precisa incluir **como** enumerar.

## A22 — "Safety First Admin": o primeiro a entrar vira admin se não houver nenhum

`lib/auth.ts` promove a `ADMIN` quem autenticar quando **não existe nenhum admin no banco**:

```ts
if (!token.systemRoles?.includes(SYSTEM_ROLES.ADMIN)) {
  const anyAdmin = await prisma.user.findFirst({ where: { systemRoles: { has: SYSTEM_ROLES.ADMIN } } })
  if (!anyAdmin) { /* promove, seta roles [TRAINER, ATHLETE], seed */ }
}
```

Implementado duas vezes: no callback `jwt` e no evento `createUser`, este último em `$transaction` para evitar corrida entre dois primeiros logins simultâneos.

É padrão conhecido de bootstrap e **está preservado** — sem ele, um banco novo não tem como ganhar o primeiro admin. Registrado por dois motivos:

1. **É o quarto escritor de `systemRoles`, e o único não-administrativo.** Qualquer afirmação do tipo "ADMIN só é concedido por admin" é falsa neste sistema. As afirmações da fatia 5 (D32) continuam válidas porque eram escopadas à rota; a afirmação de sistema não seria.
2. **A condição é "nenhum admin", não "banco vazio".** São coisas diferentes. Num banco com mil usuários onde o último admin foi removido ou teve `systemRoles` limpo, o próximo login promove — quem for. Não é alcançável em produção com admin ativo, e é exatamente por isso que passa despercebido: a guarda depende de um estado que ninguém observa.

Fora de escopo consertar; o que faria sentido é logar em nível de alerta quando a promoção acontece, para que ela apareça em vez de ser silenciosa. Anotado para a fatia que migrar autenticação.

## A17 confirmado vivo, e não há guarda de reentrada

`POST /api/onboarding` não tem nenhuma checagem de "já fez onboarding" — só rate limit (3 por janela). Medido contra o servidor, com parceiro aprovado e Stripe conectado:

```
POST /api/onboarding {"role":"ATHLETE"} -> 200
  antes : ["TRAINER","PARTNER_B2B"]
  depois: ["ATHLETE"]
  PartnerAccount: approved / acct_PARCEIRO_REAL
```

A conta paga continua lá; o papel que dá acesso a ela, não.

Também investiguei se a **tela** protege (Josiel levantou que ela redirecionaria quem já fez onboarding). Não protege, e o redirecionamento existente vai na direção oposta:

```ts
// proxy.ts — manda PENDING PARA o onboarding; não existe a regra inversa
if (isPendingOnly && pathname.includes('/dashboard') && !isOnboarding) { … }
```

`dashboard/onboarding/page.js` não tem nenhum `router.push`/`redirect()`; o único `window.location.href = '/dashboard'` roda **depois** do `POST`, no fim do wizard. `dashboard/layout.js` (28 linhas) não tem guarda. `dashboard/page.js` faz `if (!hasRole) redirect(...)` — mesma direção.

**De todo modo, a correção torna a questão da tela irrelevante**: preservando os papéis financeiros, não importa quantas vezes a rota seja chamada nem por onde.

## A24 — cada chamada re-estampa o consentimento e apaga o registro original

```ts
const now = new Date()
const consentData = { termsAcceptedAt: now, termsVersion: '2026-07-06', privacyAcceptedAt: now }
await prisma.user.update({ … data: { …updateData, …phoneData, …consentData } })
```

Incondicional. Medido:

```
antes : aceite=2026-02-10T14:30:00.000Z versao=2026-01-01
depois: aceite=2026-08-09T02:27:33.779Z versao=2026-07-06
```

O comentário no código invoca o **Art. 8 da LGPD**, que é justamente sobre comprovação do consentimento. O efeito é o contrário: a data em que a pessoa realmente aceitou é destruída e substituída pela data de hoje, e `termsVersion` é sobrescrita por uma string **hardcoded** — então aceitar a v1 e reentrar no onboarding faz o registro afirmar que ela aceitou a `2026-07-06`.

Parente do A18 (afiliado estampa aceite sem evidência), mas pior: ali o registro é fraco, aqui o registro **existente é apagado**.

## A25 — dois formatos de telefone na mesma coluna, e o perfil recusa o que o onboarding grava

O onboarding grava `+55` + dígitos:

```ts
phoneData.phone = digits.length === 11 ? `+55${digits}` : `+55${digits}`   // ← ternário morto: ramos idênticos
```

O `PATCH /users/profile` grava `(11) 98888-7777` e valida 10–11 dígitos. `+5511988887777` tem **13**. Medido, ponta a ponta:

```
onboarding gravou          : +5511988887777
salvar o perfil sem editar : 400 {"error":"Telefone inválido. Informe DDD + número (10 ou 11 dígitos)."}
```

**Quem fez onboarding como treinador não consegue salvar o próprio perfil** — a plataforma recusa o valor que ela mesma gravou, num campo que a pessoa não editou. É o mesmo formato de falha do D30 (papel inválido quebrando o formulário inteiro), agora com telefone, e este dá 400 em vez de 200 silencioso.

Isso reabre o **A13**, onde eu decidi *não* tratar `+55` porque "DDD 55 existe (Santa Maria/RS)". A objeção não se sustenta quando se olha o comprimento: número brasileiro é DDD(2) + 8 ou 9 dígitos = **10 ou 11**. Com código do país, **12 ou 13**. Um número de DDD 55 nunca tem 12 ou 13 dígitos. Então remover um `55` inicial **quando o total é 12 ou 13** é inequívoco.

Eu tinha razão em não usar heurística; errei em não olhar o comprimento antes de descartar. E agora existe motivo concreto: **as linhas gravadas pelo próprio onboarding estão nesse formato**, então corrigir só o onboarding deixaria os usuários existentes travados.

---

## Decisões

### D36 — `/api/user/update-role` é apagada, não migrada

Decisão de Josiel, sobre três fatos medidos:

1. **Zero chamadores** no frontend (`app` e `components` limpos na busca).
2. O único comportamento exclusivo dela é auto-atribuir `AFFILIATE` — e ela concede o papel **sem criar a `AffiliateAccount`**. O resultado é meio-feito: `/api/affiliate/earnings` e `/api/affiliate/connect/setup` respondem **404** para quem tem o papel e não tem a conta. A rota entrega um papel que não abre nada.
3. Todo o resto que ela faz, o `PATCH /users/profile` já faz — e faz com a lista que a **documentação** diz ser a correta (`PENDING, TRAINER, ATHLETE, STUDENT`).

Ou seja: das duas implementações, a que sobrevive é a que corresponde à intenção documentada. A que sai é a que derivou.

**Risco assumido e registrado**: `getSessionOrToken` aceita `Authorization: Bearer`, então um cliente mobile fora deste repositório poderia chamar a rota. Não há como verificar daqui. O substituto é `PATCH /users/profile` com `{ role }` — mesma semântica, menos `AFFILIATE`, corpo de resposta diferente.

### A23 — apagar a rota não a torna 404: ela cai no catch-all e vira 500

Medido depois de apagar, com o servidor reiniciado:

```
PATCH /api/user/update-role   -> 500
GET   /api/user/profile       -> 401   (controle: rota viva, exige sessão)
GET   /api/backend/users/profile -> 401 (controle: BFF vivo)
```

A causa está no log do servidor:

```
API Error: TypeError: Cannot read properties of undefined (reading 'startsWith')
    at connectToMongo (app\api\[[...path]]\route.ts:18:13)
        client = new MongoClient(process.env.MONGO_URL!)
```

Existe `app/api/[[...path]]/route.ts` — um catch-all **opcional** de compatibilidade com MongoDB, que casa com todo `/api/*` sem rota mais específica. `MONGO_URL` não está definido, o `!` engole isso na compilação, e a chamada estoura em runtime.

**Consequência para o D36**: para um cliente que ainda chame a rota removida, o sintoma não é "endpoint não existe" (404) e sim "servidor com erro" (500) — que pede retry em vez de indicar remoção. É um sinal pior que o esperado, e ele vale para **qualquer** rota removida deste app, não só esta.

Não corrigido aqui de propósito: já existe tarefa separada em andamento para remover esse catch-all morto. Quando ela terminar, esta rota passa a responder 404 sem nenhuma mudança adicional. Fica registrada a **dependência**: a promessa "removida ⇒ 404" só se cumpre depois daquela remoção.

**Lição**: um catch-all transforma toda ausência em presença. Enquanto ele existe, "a rota não existe mais" não é observável de fora — o que também significa que nenhum teste de rota removida pode se basear em 404 neste app.

### D37 — `SELF_ASSIGNABLE_ROLES` sai junto

A constante é usada **só** pela rota apagada. Sem ela, viraria uma lista de papéis auto-atribuíveis que ninguém consulta, competindo com `PAPEIS_ESCOLHIVEIS` do backend — que é a que passa a valer. Duas listas com o mesmo nome semântico e conteúdo diferente é exatamente como o A16 nasceu.

### D38 — a documentação é corrigida na mesma passada

Apagar a rota e deixar §49 descrevendo-a transformaria doc errada em doc sobre código inexistente. As quatro referências são atualizadas, e §49 vira registro histórico: o que a rota fazia, por que saiu, e qual é o substituto.

O erro sobre `VALID_ONBOARDING_ROLES` (falta `AFFILIATE`) é corrigido também, embora seja de outra rota — é uma linha, e deixar um erro conhecido por escrito depois de medi-lo não se justifica.

### D39 — o comentário que eu escrevi na fatia 5 estava errado e é corrigido

Em `apps/backend/src/users/update-profile.ts` eu escrevi que o filtro preserva "os que foram concedidos por admin (`PARTNER_B2B`, `AFFILIATE`)".

`PARTNER_B2B` é concedido por admin de fato: `PartnerAccount.status` nasce `pending` e existe fluxo de aprovação em `/api/admin/partners/[id]`. **`AFFILIATE` não é**: `AffiliateAccount.status` tem default `approved` e não existe fluxo de aprovação nenhum. É auto-serviço por projeto.

O **comportamento** continua certo — preservar `AFFILIATE` e não permitir concedê-lo por esta rota é o que se quer, agora que ela é a única porta. Errada era a justificativa. Corrigir importa porque uma justificativa errada num comentário é o que autoriza o próximo leitor a mexer no código pelo motivo errado.

### D40 — as outras oito portas ficam para depois, com o escopo declarado

Nenhum dos outros escritores é migrado aqui. Motivo: `onboarding`, `quick-role`, `partner/apply` e o bootstrap em `lib/auth.ts` **criam conta financeira ou concedem privilégio** e escrevem papel como efeito colateral de um fluxo maior. Migrar isso é fatia própria — provavelmente mais de uma —, com o A17 (sobrescrita) como defeito a corrigir e decisão de produto sobre preservação.

Fica escrito para que a próxima fatia não redescubra: **depois de apagar `update-role`, sobram oito escritores de `roles` e três de `systemRoles`. O A17 e o A22 continuam vivos.**

Ordem sugerida, do mais isolado para o mais acoplado: `invite/[token]` → `partner/settings` → `partner/apply` → `onboarding` + `quick-role` (juntos, compartilham `lib/affiliate.ts`) → `lib/auth.ts` (por último: é o emissor do token, e mexer nele afeta todas as fatias anteriores).

### D41 — o onboarding passa a preservar os papéis não auto-atribuíveis

Mesma regra das outras quatro rotas que escrevem `roles`: preserva o que a pessoa já tem e que ela não pode se conceder — `PARTNER_B2B` e `AFFILIATE`.

**Não é decisão de produto, é paridade.** Quatro dos cinco escritores restantes já preservam; o onboarding era o único que não. E preservar é o que impede perda de acesso a conta financeira.

Aplicado a **todos** os ramos, não só ao de `STUDENT` que já fazia merge. Um `AFFILIATE` com saldo que entre como `TRAINER` fica `[TRAINER, AFFILIATE]`, não `[TRAINER]`.

Consequência deliberada: reentrar no onboarding continua **trocando** o papel de produto (quem era `ATHLETE` e escolhe `TRAINER` deixa de ser `ATHLETE`). Isso é o comportamento esperado de um seletor de papel, e é igual ao do `PATCH /users/profile`.

### D42 — guarda de reentrada NÃO é adicionada

Tentador, e recusado por dois motivos. Primeiro, o dano que motivava a guarda é o D41 que resolve — com os papéis financeiros preservados, reentrar é inofensivo. Segundo, a tela de onboarding é, na prática, o único lugar onde o usuário escolhe papel de produto; bloquear reentrada tiraria dele a capacidade de trocar, sem substituto na interface.

Fica registrado como **pergunta aberta de produto**, não como defeito: *o onboarding deveria ser um wizard de primeira vez, com a troca de papel morando em outro lugar?* Responder isso exige mexer em tela, e nenhuma fatia religou tela.

### D43 — consentimento é registrado uma vez, e não sobrescrito

`termsAcceptedAt` e `privacyAcceptedAt` passam a ser gravados **só se ainda não houver registro**. Já existindo, ficam como estão — inclusive `termsVersion`.

O que se perde: nada. O que se ganha: a data no banco volta a significar "quando a pessoa aceitou" em vez de "quando ela chamou a rota pela última vez".

A `termsVersion` hardcoded (`'2026-07-06'`) **continua hardcoded** e fica anotada: se os termos forem versionados de verdade, a string precisa vir de configuração, não de literal em rota. Fora de escopo — é o mesmo problema em `partner/apply` e provavelmente em outros lugares, e merece uma passada própria.

### D44 — telefone tem um formato só, e o `+55` legado é aceito

Duas mudanças que andam juntas:

1. **O onboarding passa a gravar no formato do perfil** — `(XX) XXXXX-XXXX`. O ternário de ramos idênticos sai. Uma coluna, um formato.
2. **`normalizarTelefone` passa a remover o `55` inicial quando o total é 12 ou 13 dígitos** — inequívoco pelo comprimento, como o A25 mostra. É o que destrava as linhas que o onboarding já gravou.

Sem a segunda, os usuários existentes seguiriam sem conseguir salvar o perfil. Sem a primeira, o problema voltaria a ser criado a cada onboarding.

Reversão explícita do A13: lá eu recusei tratar `+55` por ambiguidade com DDD 55. A ambiguidade não existe no comprimento — só apareceu porque eu descartei o caso sem medir. **13 dígitos começando com 55 continua sendo aceito, mas agora normalizado; 13 dígitos começando com outra coisa continua 400.**

---

## Propriedades a provar por teste

**Remoção (D36/D37):**
1. Nenhum arquivo fora de `.next` referencia `update-role`, exceto menções históricas explícitas.
2. Nenhum arquivo de código referencia `SELF_ASSIGNABLE_ROLES`.
3. `next build` sai 0 e a rota não aparece no manifesto de rotas gerado.
4. A suíte inteira segue verde — nada dependia da rota.
5. A rota **não** responde 404, e sim 500, pelo catch-all do A23 — afirmado assim de propósito, para o teste registrar o estado real em vez do desejado. Quando o catch-all sair, esta propriedade deve ser invertida para 404.

**Substituto (D36):**
5. `PATCH /users/profile` com `{ role: 'ATHLETE' }` continua trocando o papel (já coberto pela fatia 5, reafirmado aqui como contrato do substituto).
6. `PATCH /users/profile` com `{ role: 'AFFILIATE' }` responde 200 e **não** concede o papel — a diferença deliberada em relação à rota apagada.

**Regressão do A16/A21 (o que a fatia existe para impedir):**
7. O levantamento de escritores de `roles` feito pelo método do A21 (partir de quem chama `prisma.user.*` e filtrar por menção a `roles`) devolve exatamente os oito restantes da tabela do A16 — nem mais, nem menos.
8. O levantamento de escritores de `systemRoles` devolve exatamente três, e os dois de `lib/auth.ts` estão atrás da guarda `!anyAdmin`.

---

## Verificação

- Busca exaustiva por `update-role` e `SELF_ASSIGNABLE_ROLES` fora de `.next`, antes e depois.
- `tsc` nos dois apps e os dois builds com exit code conferido fora do pipe — a remoção de um `export` só quebra em compilação, e `grep` não substitui compilador.
- Suítes completas: se algum teste dependia da rota, ele quebra e isso é informação, não estorvo.
- `next build` limpo de `.next` antes, para o manifesto não carregar entrada obsoleta e mascarar a remoção.
