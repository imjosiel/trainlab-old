# Epic: Backend NestJS — Fatia 5: perfil próprio (GET + PATCH), a allowlist na entrada

Quinta fatia. A quarta cobriu **o que sai** (modelagem de exposição numa rota pública). Esta cobre o par simétrico: **o que entra**. É a primeira fatia com caminho de escrita, e a pergunta que ela responde é a inversa da anterior — não "quem pode ler este campo" mas "quais campos o cliente tem permissão de mandar".

Rota legada: `app/api/user/profile/route.ts`, 196 linhas, `GET` + `PATCH`.
Rota nova: `GET /users/profile` e `PATCH /users/profile`.

Duas coisas apareceram ao ler o recurso antes de desenhar. Uma é o mesmo defeito da fatia 4 reaparecendo numa rota nova. A outra é um cálculo que devolve zero para quem treinou todo dia.

---

## A11 — `partnerAccount: true` repete o A9 uma rota depois

O `select` do `GET` termina assim:

```ts
systemRoles:    true,
partnerAccount: true,      // ← aqui
_count: { select: { followers: true, following: true } },
```

`partnerAccount: true` numa relação é **allowlist de relação, não de campo** — exatamente o mecanismo do A9. A diferença é o alcance: ali era rota pública sem autenticação, aqui é o próprio dono autenticado. Não é vazamento para estranho; é superexposição para o titular, e ela carrega estado interno da plataforma.

### Medido

Fixture com valores sentinela nos campos financeiros, query **idêntica** à do legado:

```
partnerAccount: true devolve 25 campos.
A UI consome 4: status, payoutsEnabled, chargesEnabled, rejectionReason
```

Dos 21 que saem sem ninguém pedir, os que importam:

| Campo | Valor na prova | Por que incomoda |
|---|---|---|
| `customCommissionRate` | `0.71` | override negociado, sobre um `commissionRate` público de `0.50` — revela a régua comercial |
| `payoutsFrozen` | `true` | estado de moderação que a UI não conta a ninguém |
| `allowTestMode` | `true` | alavanca interna de operação |
| `bonusThreshold` / `bonusRateDrop` | `900000` / `0.05` | postura de negociação da plataforma |
| `approvedById` | id do admin | **id interno de terceiro**, não do titular |
| `stripeAccountId` | `acct_…` | é dele, mas nada na tela pede |
| `motivation` | texto da candidatura | escrito por ele, mas idem |

`approvedById` é o único que não é dado do próprio usuário — é identificador de outra pessoa saindo numa rota de perfil.

**Lição, e é por isso que ela vira propriedade de teste e não só nota**: a fatia 4 tratou `include` como o culpado. Não era. O culpado é **qualquer forma de pedir uma relação sem enumerar campos** — `include: {}`, `true`, e amanhã alguma outra açúcar sintático. `select` explícito é a única que falha fechado.

## A12 — `orderBy: completedAt desc` + `take: 500` zera a gamificação de quem treina

O `GET` calcula streak e taxa de conclusão a partir de:

```ts
const sessions = await prisma.trainingSession.findMany({
  where: { OR: [...], createdAt: { gte: oneYearAgo } },
  orderBy: { completedAt: 'desc' },
  take:    500,
})
```

A query **não filtra por `completed`**, então traz sessão concluída e não concluída juntas. Sessão não concluída tem `completedAt = null`. E em Postgres, `ORDER BY … DESC` implica **`NULLS FIRST`**:

```
 posicao |     rotulo      |  completed_at
       1 | incompleta-A    | NULL
       2 | incompleta-B    | NULL
       3 | completa-hoje   | 2026-08-08 …
       4 | completa-antiga | 2026-07-29 …
```

Ou seja: o `take: 500` é preenchido pelas **incompletas primeiro**. Passando de 500 sessões não concluídas na janela de um ano, nenhuma concluída entra na amostra.

### Medido — mesma pessoa, mesmos treinos, só mudando o volume de ruído

7 dias consecutivos de treino concluído, terminando hoje. Depois, 500 sessões nunca concluídas no mesmo plano. Algoritmo do legado copiado verbatim:

```
0 sessoes incompletas      amostra=  7  completas_na_amostra=  7  completionRate=100%  streak=7
500 sessoes incompletas    amostra=500  completas_na_amostra=  0  completionRate=  0%  streak=0

No banco: 507 sessoes, das quais 7 concluidas.
Topo do ORDER BY "completedAt" DESC (o que take:500 pega primeiro):
  prova-gamificacao-incompleta-1     completedAt=null
  prova-gamificacao-incompleta-0     completedAt=null
  prova-gamificacao-incompleta-2     completedAt=null
```

**Os mesmos 7 dias de treino viraram streak 0.** E antes do limite de 500 o erro já age: qualquer volume de incompletas empurra concluídas para fora da amostra, e a taxa desce sem que ninguém tenha deixado de treinar.

Agrava que `where` filtra por `createdAt` e `orderBy` ordena por `completedAt` — eixos diferentes, então nem a janela nem a ordem falam da mesma coisa.

**Lição**: `ORDER BY` sobre coluna anulável tem uma decisão embutida que a linguagem não te faz tomar. `nulls: 'last'` no Prisma existe justamente porque o default do banco não é o que quem escreve quer. E o `take` transformou uma ordenação discutível em número errado — sem o limite, a ordem não teria consequência.

## A13 — número com código do país é recusado

`+55 (31) 98765-4321` dá 13 dígitos e cai no `< 10 || > 11` → 400.

Portado fiel, e a recusa é coerente com o texto que o usuário lê ("Informe DDD + número"). Desambiguar seria arriscado: **DDD 55 existe** (Santa Maria/RS), então `5531987654321` não tem leitura única sem uma regra de comprimento que hoje não existe. Fica como recusa explícita em vez de heurística silenciosa.

Descoberto porque eu escrevi o teste esperando `(55) 31987-65432` e ele falhou. O teste estava errado, não o código — e a expectativa errada é que revelou o caso.

## A14 — três camadas "quebradas", nenhuma com defeito: o shell reescreveu o segredo

Na primeira verificação ao vivo, Nest direto, Nest via BFF e rota legada responderam **401** ao mesmo token. Três implementações independentes, um sintoma só.

A causa não estava em nenhuma delas. O `NEXTAUTH_SECRET` deste projeto é um
base64 de 44 caracteres que, por acaso, **começa com `/`** — saída perfeitamente
comum de `openssl rand -base64 32`. O valor real fica no `.env`; aqui ele aparece
como `/AAAA…AAA=`, mesma forma, 44 caracteres.

O Git Bash aplica **conversão de caminho MSYS** a valores de variável de ambiente
que parecem caminho Unix. Medido:

```
do .env   : "/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="                      (44 chars)
do shell  : "C:/Program Files/Git/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="   (64 chars)
iguais    : false
```

O shell trocou a barra inicial pelo prefixo de instalação do Git e o script
assinou o token com essa chave adulterada. Os três servidores rejeitaram um token
forjado com chave errada — **comportamento correto**, relatado como falha.

### O que isso custou, e a parte que é sobre método

Eu diagnostiquei errado primeiro: culpei o `ConfigModule`, teorizei que `envFilePath` resolvia pelo cwd e que subir da raiz do monorepo não achava o `.env`, e **implementei essa correção**. Ela pareceu funcionar — porque o servidor reiniciou no meio e eu reexecutei com o segredo lido do arquivo. Correlação, não causa.

O que derrubou a teoria foi uma pergunta que eu deveria ter feito no começo: *a rota legada é código completamente diferente, com outro carregador de env e outra biblioteca de sessão. Por que ela falharia pelo mesmo motivo?* Não falharia. Quando N implementações independentes quebram junto, o suspeito é o que elas compartilham — aqui, o token. A correção do `ConfigModule` foi revertida.

**Lições:**

1. Segredo base64 tem ~1 em 64 de chance de começar com `/`. Em Git Bash isso o corrompe silenciosamente ao passar por variável de ambiente. Ler do `.env` direto, nunca herdar do shell — foi o que a versão final do script de verificação faz.
2. "Todas as camadas quebradas" é evidência de causa **compartilhada**, não de N defeitos. É o teste mais barato de sanidade e eu pulei.
3. Uma correção validada por reexecução após reinício não está validada. Só a mutação — desfazer e ver quebrar — separa causa de coincidência, e é o que eu já faço no código mas não fiz no diagnóstico.

Ficou de saldo o `exigirSegredoDeSessao()` no boot: sem `NEXTAUTH_SECRET`, o servidor morre com mensagem em vez de responder 401 a tudo. Não cobre este caso (segredo presente mas divergente), mas elimina um dos três suspeitos antes de alguém depurar.

## A15 — o script de verificação declarou sucesso contra 401

Na mesma execução, o script imprimiu **"nada sensivel"** para as três rotas e **"OK: so a bio mudou"** — conclusões tiradas de respostas 401 sem corpo. Ausência de dado lida como ausência de vazamento.

É a **terceira** aparição da mesma vacuidade nesta fatia:

| Onde | Como passou por vacuidade |
|---|---|
| e2e, antes de existir a rota | `NENHUM valor sentinela aparece no corpo` passou contra 404 — 2 dos 67 testes verdes com zero implementação |
| asserções negativas herdadas da fatia 4 | "o select não menciona X" é verdade quando `include`/`true` traz X sem nomear |
| script de verificação ao vivo | "nada sensível" e "só a bio mudou" contra 401 |

**Lição**: toda afirmação da forma "X não aparece" precisa de uma precondição que garanta que X *poderia* aparecer. No e2e isso é conferir o status e as chaves presentes; no script, abortar antes de avaliar conteúdo se qualquer rota não devolveu 200. Foi o que passou a acontecer — e é por isso que os dois testes que passavam no red inicial eram informação, não ruído.

---

## Decisões

### D26 — Relação pedida por `select` explícito, sempre, mesmo para o titular

`partnerAccount` passa a enumerar campos. O recorte é **o estado da candidatura**, que é para o que os dois consumidores usam:

```
status, stripeAccountStatus, payoutsEnabled, chargesEnabled, rejectionReason, approvedAt, createdAt
```

Fora: os cinco campos financeiros de negociação, `allowTestMode`, `payoutsFrozen`, `approvedById`, `motivation`, `minimumPayoutAmount`, `payoutSchedule`, `partnerTier`, `tierId`, `affiliateAccountId`, `id`, `userId`.

`commissionRate` fica fora **de propósito**, e isso merece justificativa: o parceiro tem direito de saber a comissão dele. Só que o lugar disso é o painel financeiro do parceiro, que é outra rota e pode mostrar a taxa efetiva (considerando o override) com o contexto certo. Aqui é `/users/profile` — a única pergunta que a tela faz é "minha candidatura andou?".

### D27 — `_count` sai do corpo

O legado faz `{ ...user, stats: {…} }`, e `user` contém `_count: { followers, following }`. Os mesmos dois números aparecem duas vezes na resposta, em formatos diferentes. Nenhum consumidor lê `_count` (conferido por grep nos três arquivos que chamam a rota). Fica só `stats`.

### D28 — Gamificação é corrigida, e a correção não é "ordenar direito"

Trocar para `nulls: 'last'` conserta o streak e **troca o viés da taxa**: a amostra passaria a ser as 500 concluídas mais recentes, e a taxa tenderia a 100% pelo motivo espelhado. O limite é o problema, não só a ordem.

Então o cálculo vira duas perguntas separadas, cada uma com a query que ela pede:

- **Taxa de conclusão**: dois `count()` sobre a janela inteira, sem `take`. Número exato, sem amostragem.
- **Streak**: `findMany` só das concluídas, `orderBy: { completedAt: 'desc' }`, `take: 500`. Sem `null` na coluna ordenada, o `NULLS FIRST` deixa de existir como questão.

Mais barato também: `count` resolve no índice, e a leitura de linhas passa a trazer só o que o streak usa.

O `take: 500` na query do streak fica, e o limite dele é honesto: com 3 sessões/dia são ~166 dias de sequência. Truncar aí só **subestima** um streak já implausível, nunca inventa um.

### D29 — A correção do A12 vale para as duas implementações, e a paridade é quem obriga

O critério de correção desta migração é paridade de comportamento com o legado. Isso tem uma consequência que vale dizer em voz alta: **achar um defeito obriga a consertar nos dois lados, ou a declarar a divergência explicitamente.** Se só o Nest calculasse certo, o teste de paridade quebraria — e quebraria *apontando para a versão correta como se fosse a errada*.

Consertar só de um lado transforma o teste de paridade em ruído. Então a rota legada recebe o mesmo cálculo, como no D22 da fatia anterior — mas ali o motivo foi urgência de segurança, e aqui é a integridade do próprio critério de verificação.

### D30 — Papel inválido continua sendo ignorado em silêncio

`role` fora de `[PENDING, TRAINER, ATHLETE, STUDENT]` não atualiza nada e devolve **200**. Nenhum erro.

Parece defeito, e é preservado. O motivo é concreto: `dashboard/profile/page.js` monta o formulário com `role: dataUser.roles?.[0]`. Para quem tem `PARTNER_B2B` ou `AFFILIATE`, esse `roles[0]` **é** um papel inválido para esta rota — então todo salvamento de perfil de parceiro manda um `role` inválido hoje, e depende do 200 silencioso para o resto do formulário (nome, bio, telefone) ser salvo. Trocar por 400 quebraria o formulário inteiro de todo parceiro por causa de um campo que ele não editou.

Mesma categoria do A1 (MODERATOR) e A4 (limites de slug): peculiaridade cuja "correção" tranca alguém fora. Registrada, portada fiel.

### D31 — Corpo fora da allowlist é ignorado, e isso passa a ser afirmado por teste

O legado desestrutura seis campos nomeados e monta `updateData` um a um. Não existe spread do corpo em `data`. Ou seja: já está certo, e é o oposto do A11 — allowlist na entrada, feita à mão.

Não há defeito a corrigir. Há uma propriedade que ninguém estava provando: mandar `systemRoles`, `email`, `hasCoachAccess`, `isAdmin` ou `credits` no corpo do PATCH não deve mudar nada. Vira teste, porque é a garantia que um refactor futuro pode apagar sem perceber — e porque `systemRoles` no corpo é literalmente uma tentativa de escalar privilégio.

### D32 — `role` nunca alcança `systemRoles`

Consequência do D31, dita separada por ser o eixo de privilégio: os papéis aceitos por esta rota vivem em `roles` (papel de produto). `ADMIN`/`MODERATOR` vivem em `systemRoles`, que esta rota não escreve em nenhum caminho. Afirmado por teste com `systemRoles` e `role: 'ADMIN'` no corpo.

### D33 — `substring(0, 20)` no username sai

O regex `^[a-zA-Z0-9_]{3,20}$` já roda antes e rejeita qualquer coisa com mais de 20. O `substring(0, 20)` seguinte não tem entrada possível em que corte algo. Sai, e um teste com username de exatamente 20 e outro de 21 prova que a fronteira não mudou.

O `substring(0, 1000)` da bio **fica**: não existe validação de tamanho antes dele, então ele é o único limite.

### D34 — Nome vazio continua reconstruindo do `id_token` do Google

`name: ''` dispara: lê `Account.id_token`, decodifica o payload do JWT, usa `payload.name`; se falhar, usa o prefixo do email; se não houver, `'Usuário'`.

Portado fiel. Registrado porque é um acoplamento que surpreende — atualização de perfil lendo tabela do NextAuth — e porque o payload é decodificado **sem verificar assinatura**. Aqui não é falha: o token foi guardado pela própria aplicação no fluxo OAuth, a confiança é herdada dali e não do parse. Mas é o tipo de código que, copiado para um contexto onde o token vem de fora, viraria falha.

### D35 — 401 pelo guard, 404 do "usuário não existe" praticamente morto

O `NextAuthJwtGuard` já responde 401 sem sessão. O 404 `'User not found'` do legado só acontece se o token for válido e a linha tiver sido apagada no meio — janela real mas estreita. Mantido, com a mensagem traduzida pelo contrato (`{ error }` em português, como as outras fatias).

---

## Propriedades a provar por teste

**Exposição na saída (D26/D27) — o núcleo herdado da fatia 4:**
1. `partnerAccount` traz exatamente os 7 campos do recorte, conferido por igualdade de chaves — não por lista negra.
2. Nenhum dos 5 campos financeiros de negociação aparece, nem `allowTestMode`, `payoutsFrozen`, `approvedById`, `motivation`.
3. `_count` não está no corpo; `stats.followers` e `stats.following` estão.
4. Usuário sem `PartnerAccount` → `partnerAccount: null`, não erro.

**Allowlist na entrada (D31/D32) — o eixo novo:**
5. `systemRoles` no corpo do PATCH não altera `systemRoles` no banco.
6. `role: 'ADMIN'` não entra em `roles` nem em `systemRoles`.
7. `email`, `hasCoachAccess`, `isPublic` de terceiro, `id` no corpo não alteram nada além do permitido.
8. Campo desconhecido no corpo não causa 500.

**Posse (mesma lógica do D16):**
9. O PATCH escreve `where: { id: session.id }`; token de outro usuário não altera o primeiro.
10. Dois usuários simultâneos: A altera A, B segue intacto no banco.

**Username (D33):**
11. Menos de 3, mais de 20, com caractere fora de `[a-zA-Z0-9_]` → 400.
12. Exatamente 3 e exatamente 20 → aceitos.
13. Username de outra pessoa, diferindo só na capitalização → 409.
14. O próprio username, mesma capitalização ou outra → aceito, não 409.
15. `P2002` do banco → 409, não 500.

**Telefone:**
16. 10 e 11 dígitos → normalizado para `(XX) XXXX-XXXX` e `(XX) XXXXX-XXXX`.
17. 9 ou 12 dígitos → 400.
18. `null` e `''` → grava `null`.
19. Entrada já formatada é aceita e normalizada igual.

**Papel (D30):**
20. Papel válido entra em `roles`.
21. Papel válido **preserva** `PARTNER_B2B`/`AFFILIATE` já concedidos.
22. Papel inválido → 200 e `roles` intacto (peculiaridade preservada, afirmada de propósito).

**Nome (D34):**
23. Nome com espaços é trimado e cortado em 50.
24. Nome vazio com `id_token` do Google presente → restaura o nome do payload.
25. Nome vazio sem `id_token` → prefixo do email.
26. Nome vazio sem `id_token` e sem email → `'Usuário'`.
27. `id_token` corrompido não causa 500 — cai no fallback.

**Gamificação (D28) — a que precisa de dado, não de mock:**
28. 7 dias consecutivos concluídos → `streak: 7`.
29. Os mesmos 7 dias **com 500 incompletas no mesmo plano** → `streak: 7` e taxa correta. É o teste de regressão do A12, e é o que reprova o código legado.
30. Sequência interrompida ontem-e-anteontem → streak conta do dia mais recente e para na lacuna.
31. Último treino há 3 dias → `streak: 0`.
32. Várias sessões no mesmo dia contam como um dia.
33. Sessões de plano via `student.userId` entram na conta, não só via `athleteId`.
34. Nenhuma sessão → `streak: 0`, `completionRate: 0`, sem divisão por zero.

**Paridade (D29):**
35. Para o mesmo usuário, `GET` do Nest e da rota legada corrigida têm as mesmas chaves e os mesmos valores de `stats`.
36. Para o mesmo corpo, o `PATCH` das duas deixa o banco no mesmo estado.

---

## Verificação

- Suítes duas vezes seguidas (idempotência), `tsc` e build com exit code conferido fora do pipe.
- Gamificação verificada **com dado real no Postgres**, não com Prisma mockado: o defeito do A12 é da ordenação do banco, e mock que devolve array na ordem que o teste quiser não tem como reprovar nada.

### Mutações a rodar

| Mutação | Esperado |
|---|---|
| `partnerAccount: true` de volta | quebram as propriedades 1 e 2 |
| `orderBy` sem `completed: true` no `where` do streak | quebra a 29 |
| `nulls: 'last'` em vez de duas contagens | 29 passa, e a taxa da 29 quebra — mostra que ordenar não bastava |
| spread do corpo em `data` | quebram 5, 6 e 7 |
| `where: { id: body.id ?? session.id }` | quebram 9 e 10 |

### Resultado das mutações

Rodadas de fato, no backend e na rota legada:

| Mutação | Testes derrubados |
|---|---|
| `partnerAccount: true` (Nest) | 8 de 67 e2e |
| `partnerAccount: true` (legada) | 18 de 82 Jest |
| query única do legado, `orderBy desc` sem filtrar `completed` (Nest) | 1 — exatamente a regressão do A12 |
| idem, na rota legada | 8 de 82 |
| só `nulls: 'last'` | 1: streak volta a 7, mas a taxa dá **60%** em vez de 38% |
| corpo espalhado em `data` | 14 de 67 |
| `where` aceitando `id` do corpo | 2 — as duas de posse |

A linha do `nulls: 'last'` é a que justifica o D28 ter virado duas queries: a mutação *conserta* o streak e continua errando a taxa, então a fixture distingue as três implementações em vez de só duas.

### E a mutação deixou lixo no banco — o que também é achado

A mutação de mass assignment fez o teste `{ id: 'outro-id' }` **reescrever a chave primária** do usuário. O `afterAll` limpa por id, não achou mais a linha, e a execução seguinte falhou toda no `beforeAll` com violação de unicidade em `username`. Eu li isso como "a mutação seguinte quebrou tudo", e estava errado — era entulho da anterior:

```
 outro-id | e2epropriobeta | invasor@example.com
```

Essa linha é a prova visual do que mass assignment faz: id e email reescritos por um PATCH de perfil.

**Lição**: mutação em caminho de escrita pode corromper o espaço de fixtures, e uma suíte que limpa por chave primária é vulnerável exatamente quando a mutação permite escrever a chave primária. Limpar por `email like TAG%` além do id resolveria; conferir o banco entre mutações é o mínimo.
