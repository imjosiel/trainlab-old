# Epic: Backend NestJS — Fatia 7: o primeiro cutover de verdade

Seis fatias construíram backend, ponte de auth, BFF e cinco recursos migrados. **Nenhuma tela usou nada disso.** Esta fatia aponta uma tela para o BFF e apaga a rota legada correspondente.

Ela existe porque, ao fazer o balanço, apareceram duas dívidas que as fatias anteriores acumularam em silêncio.

---

## A26 — o elo central da arquitetura nunca havia sido executado

O BFF existe para uma coisa: pegar o **cookie** de sessão do NextAuth e repassá-lo como `Authorization: Bearer` ao Nest (D6). Em seis fatias, **todas** as verificações mandaram Bearer direto — inclusive as que passaram pelo BFF, porque `getToken` também aceita header. E os testes unitários do BFF mockam `getToken`, então também não exercitam o cookie.

Ou seja: o caminho real do navegador — cookie → BFF → Bearer → guard → Prisma — tinha zero execuções, e nenhum teste que o cobrisse.

**Isso foi verificado antes de tocar em qualquer tela**, porque se o elo não funcionasse, todo cutover estaria bloqueado e eu precisaria saber disso primeiro, não no meio da troca.

### Medido — só cookie, nenhum header Authorization

```
BFF   -> /api/backend/notifications    200  {"notifications":[…]}
BFF   -> /api/backend/users/profile    200  {"id":"…","name":"Usuário de Navegador",…}
legada-> /api/notifications            200  {"notifications":[…]}
BFF   -> com cookie forjado            401  {"error":"Não autorizado"}
BFF   -> sem credencial                401  {"error":"Não autorizado"}
```

Funciona, e os dois controles negativos negam. Cookie forjado com segredo errado dá 401, não 500 nem 200.

**Lição de método**: "verificado ao vivo" descreveu seis fatias e ainda assim deixou de fora o elo que a arquitetura inteira pressupõe. O que faltava não era rigor — era perguntar **quem chama isto em produção** e reproduzir *esse* chamador, não um equivalente conveniente. `curl` com Bearer era mais fácil de escrever que um cookie, e essa facilidade escolheu o que foi testado.

## A27 — cinco recursos com duas implementações, e a sincronização já custou duas vezes

Naquele momento, `sports`, `admin/sports`, `notifications`, `users/public` e `user/profile` existiam em Nest **e** em rota legada. Os cinco cutovers foram concluídos depois; os respectivos legados foram removidos.

O custo não é hipotético: **já corrigi o mesmo defeito em dois lugares duas vezes** — o vazamento de dado de saúde (D22) e o cálculo de gamificação (D29). Na segunda, a própria paridade obrigou: consertar só um lado quebraria o teste de paridade *apontando para a versão correta como se fosse a errada*.

Enquanto a duplicação existe, cada defeito encontrado custa dois consertos, e a garantia de que as duas concordam vale exatamente o que os testes de paridade valerem.

## A28 — o dashboard inteiro morria sem a chave do Pusher (CORRIGIDO)

Ao abrir `/dashboard` no navegador para verificar o sino, a página não renderizou. O servidor respondia **200**; o cliente estourava:

```
Uncaught: You must pass your app key when you instantiate Pusher.
```

`lib/pusher-client.ts` fazia `new PusherClient(process.env.NEXT_PUBLIC_PUSHER_KEY!, …)`. O `.env` deste repo tem `PUSHER_CLUSTER` e `NEXT_PUBLIC_PUSHER_CLUSTER` mas **não a chave**. O `!` calou o compilador, e o Pusher lançou dentro de um client component — exceção não tratada que derruba a árvore inteira.

Não era degradação, era **tela morta**: sino, mini-chat e a página de mensagens dependem do mesmo módulo. Alcançável em qualquer deploy com a config pela metade.

**Corrigido** (fora do escopo original, mas bloqueava a verificação que a fatia exige): `getPusherClient()` devolve `null` quando falta a chave, com um aviso único no console, e as **5** chamadas ganharam `if (!pusher) return`. Tempo real é melhoria, não requisito — notificações e conversas continuam carregando por HTTP.

Mesma família do A23 (`process.env.MONGO_URL!` no catch-all): **asserção de não-nulo em variável de ambiente troca erro de configuração por explosão em runtime**, e o `!` é exatamente o que impede o compilador de avisar.

## A29 — o sino é montado duas vezes

`dashboard-layout.jsx` renderiza `<NotificationBell />` em dois lugares (cabeçalho e rodapé da sidebar), provavelmente para responsividade via CSS. Os dois **montam** e os dois buscam.

Consequência: cada carga de notificações é duplicada, e existem dois estados independentes que podem divergir (marcar como lida em um não atualiza o outro). Com o cutover, essa duplicação passa a atravessar processo: web → BFF → Nest → Postgres.

**Não corrigido**: a correção é de layout (uma instância + visibilidade por CSS, ou busca içada para um contexto compartilhado), não de migração. Registrado.

## A33 — 10 buscas numa carga do dashboard, e a causa não era polling

Josiel perguntou se o sino fica consultando o banco. Medido: **10 requisições a `/api/backend/notifications` numa única carga** de `/dashboard` — 20 queries (`findMany` + `count`) para desenhar um sino. Sem nenhum `setInterval`.

Três causas somadas:

**1. Três sinos, não dois.** Corrigindo o A29: `SidebarContent` é renderizado **duas vezes** (sidebar desktop e sidebar mobile) e contém um sino cada; mais o sino da barra superior mobile. Total **três**, cada um com estado e busca próprios.

**2. `SidebarContent` era declarado dentro do componente:**

```jsx
const SidebarContent = () => ( … )   // nova identidade de função a cada render
```

React compara tipo de componente por identidade. Função nova ⇒ tipo novo ⇒ **desmonta e remonta a sidebar inteira**, sino incluído, que busca de novo. `DashboardLayout` tem 6 `useState`, vários preenchidos por requisições assíncronas — então cada resposta que chega remonta tudo.

**3. `createMany` mandava payload vazio**, e o cliente respondia com uma busca completa. Avisar N pessoas custava N mensagens no Pusher **+ 2N queries**, inclusive para quem nunca abriu o sino.

### Medido, antes e depois

| | antes | depois |
|---|---|---|
| buscas por carga do dashboard | **10** | **1** |
| queries no banco por carga | 20 | 2 |
| sinos no DOM | 3 | 3 (inalterado) |
| estados independentes | 3 | 1 |
| abrir o sino com lista limpa | — | **0** buscas |

E a prova do estado compartilhado: cliquei "marcar todas como lidas" **em um** sino e os **três** perderam o indicador na mesma hora. Antes, só o clicado mudava.

## A34 — a "otimização" que eu quase fiz quebraria o cliente

Meu primeiro impulso no `createMany` foi mandar o objeto montado à mão, como o `create` faz. Escrevi o código e parei antes de testar, porque `createMany` **devolve só a contagem** — não há `id`.

Um objeto sem id no cliente quebra duas coisas: a deduplicação (`prev.some(n => n.id === novo.id)` — todos os `null` colidem) e o "marcar como lida", que precisa do id na URL. Teria trocado 2N queries por uma lista com itens fantasma que ninguém consegue marcar.

A solução ficou do lado certo: o **cliente** deixou de buscar no evento sem payload. Ele incrementa o badge e marca a lista como suja; a busca acontece quando alguém **abre** o sino. Quem nunca abre nunca paga a query — e o badge, que é o que a pessoa vê, está correto de imediato.

**Lição**: "mandar mais dados para evitar uma query" só vale se os dados forem suficientes. O que faltava não era volume, era a **chave**.

## A30 — três documentos descreviam três APIs de notificações, nenhuma existente

Ao atualizar as referências, todas as três divergiam do código — e entre si:

| Documento | O que afirmava | Realidade |
|---|---|---|
| `03-api/08-notifications.md` | campo `read`; `PATCH /api/notifications` com `{ id, markAll }`; "não lidas primeiro" | campo `isRead`; `PATCH /{id}/read` sem corpo; ordem por `createdAt desc` |
| `public/openapi.yaml` | `?unreadOnly`; resposta array cru; `PUT` com `{ ids }` | `?cursor`/`?limit`; `{ notifications, unreadCount, nextCursor }`; `PATCH /{id}/read` |
| `01-architecture/02-components.md` | "Poll a cada **30 segundos**" | não existe `setInterval` — **medido: 0 requisições em 21s parado** |

Três descrições mantidas à mão, três erros diferentes. É o A20 outra vez, agora sem envolver papéis.

O argumento estrutural que isso dá para a migração: **o Nest gera Swagger a partir do próprio código** (`/docs`, JSON em `/docs-json`). Spec derivada do código não tem como divergir dele. Por isso o bloco do `openapi.yaml` foi substituído por um ponteiro, em vez de reescrito à mão.

## A31 — quase reportei um loop de polling que não existe

Lendo a aba de rede, vi dezenas de `GET /api/backend/notifications` com prefixos `[37712.1165]`, `[37712.1166]`… e li aquilo como **timestamps**, concluindo "4 requisições a cada 2 segundos". Cheguei a começar a diagnosticar a causa.

São **IDs sequenciais**, não relógio. A medição correta:

```
segundos: 21, notificacoes: 0, conversas: 0, sessao: 0
```

Zero requisições em 21 segundos parado. As 121 acumuladas eram de todas as navegações da sessão de trabalho.

**Lição**: identificador de log com cara de número não é medida de tempo. E o erro tinha sintoma plausível — o sino é montado duas vezes (A29), então as requisições *realmente* vêm em pares, o que fez a hipótese errada parecer confirmada. Uma medição com relógio explícito custou uma chamada e derrubou a teoria.

## A32 — `next build` e `rm -rf .next` com o dev server no ar derrubam o dev server

Aconteceu **duas vezes** nesta sessão. Depois de rebuildar para conferir o manifesto, tanto a rota nova quanto a legada passaram a responder 500 — e por um momento pareceu regressão do cutover.

Não era: o processo `next dev` perdeu os artefatos debaixo dele. `preview_stop` + `preview_start` restaurou, e a verificação passou.

**Lição**: parar o dev server antes de mexer em `.next`. E o sintoma é enganoso porque atinge *tudo*, inclusive o que estava funcionando — o que, pelo A14, já deveria ter me feito suspeitar de causa compartilhada em vez de regressão pontual.

---

## Decisões

### D45 — o cutover é uma troca pura: nada mais muda junto

Ao investigar, notei que a consulta de notificações **não tem `select`** — devolve a linha inteira, incluindo `userId`. É o padrão recorrente do A9/A11 (pedir dado sem enumerar campo).

**Deliberadamente fora desta fatia.** Nenhum dos 9 campos de `Notification` é sensível hoje (`id, userId, type, title, message, link, isRead, metadata, createdAt`), e `userId` é o do próprio dono — então um `select` aqui é defesa em profundidade, não correção.

Mais importante: mudar a forma da resposta no mesmo passo que troca o produtor dela destrói a capacidade de diagnóstico. Se o sino quebrar, quero saber que foi a troca. **Uma variável por vez.**

Anotado como pendência, com uma observação: `metadata` é `Json?` livre, e o sino lê `metadata.token` (token de convite). Qualquer coisa que um escritor futuro colocar nesse blob sai para o cliente sem passar por decisão.

### D46 — a tela escolhida é o sino de notificações

`components/dashboard/notification-bell.jsx`, três chamadas (`GET` e dois `PATCH .../read`). Razões:

- **Exige sessão**, então exercita o caminho do cookie — que é o ponto do A26. Uma rota pública não provaria nada.
- Superfície mínima: um componente, três `fetch`.
- Leitura e um `PATCH` idempotente. Nenhuma escrita destrutiva se algo der errado.

### D47 — os specs Playwright passam a apontar para o BFF

`e2e/api-security.spec.ts` lista `/api/notifications` entre as rotas que devem dar 401 sem auth; `e2e/api-contracts.spec.ts` afirma o contrato com auth. Depois da remoção, as duas baterão no catch-all de MongoDB e receberão **500** (A23) — quebrariam por motivo enganoso.

Repontados para `/api/backend/notifications`. Ganho colateral: a suíte de segurança passa a cobrir o BFF, que hoje não cobre — e o 401 sem credencial passa a ser afirmado no proxy, não só no Nest.

### D48 — o teste Jest da rota legada é apagado, não adaptado

`__tests__/api/notifications.test.js` importa o módulo da rota (`@/app/api/notifications/route`). Com a rota apagada, não há o que adaptar. O comportamento que ele cobria está nos 61 e2e do Nest, contra Postgres real — que é cobertura melhor, porque mock ignora `where` e era o mock que "garantia" a posse ali.

---

### D49 — estado de notificações vive num provider, e a busca é preguiçosa

Três mudanças, todas medidas:

1. **`NotificationsProvider`** (novo) faz **uma** busca e **uma** subscrição no Pusher. Os três sinos viram consumidores. Resolve o custo e a divergência de estado.
2. **`sidebarContent` passa a ser elemento**, não componente declarado no corpo — para o React parar de remontar a sidebar a cada render. Mudança de três linhas com efeito de 10 buscas para 1.
3. **Evento sem payload não busca**: incrementa o badge e marca a lista como suja; `ensureFresh()` na abertura do sino é o único ponto que consulta.

`markAsRead` e `markAllAsRead` passaram a ser **otimistas** com reconciliação: a UI muda na hora e, se o `PATCH` falhar, refaz a busca para voltar ao estado do servidor. Antes, uma falha de rede deixava a UI mentindo sem nenhuma correção.

O `createMany` **continua** mandando `{}`, e agora isso está afirmado por teste com a justificativa no nome — para que a próxima pessoa que pense em "otimizar" ali encontre o motivo antes do código.

### Fora de escopo, registrado

- `/default-avatar.png` responde **404** (único 404 real na página). Asset estático faltando, anterior a esta fatia.
- O `select` explícito na consulta de notificações (D45) segue pendente.

---

## Propriedades a provar

**O elo (A26):**
1. Cookie de sessão válido, sem header Authorization → 200 pelo BFF.
2. Cookie forjado → 401.
3. Sem credencial → 401.

**Cutover (D46):**
4. O sino renderiza notificações servidas pelo Nest, **no navegador**, com sessão real.
5. `unreadCount` aparece no badge.
6. Marcar como lida funciona e persiste (confere no banco).
7. Nenhum erro no console e nenhuma requisição para `/api/notifications` na aba de rede.

**Remoção (D47/D48):**
8. Nenhuma referência a `/api/notifications` fora de menções históricas.
9. Suítes e builds verdes.

---

## Verificação — feita

Navegador de verdade, cookie de sessão fabricado. Como o cookie é emitido (Google OAuth ou fabricado) não muda o que o BFF faz com ele.

**O sino, na tela:** badge **"2 novas"**, as duas não lidas com ponto verde e a lida sem — exatamente a fixture (3 notificações, 2 não lidas). Dado servido pelo Nest.

**Marcar como lida:** clique → `PATCH /api/backend/notifications/{id}/read` → **200**. Conferido no banco:

```
 title             | isRead
-------------------+--------
 Servida pelo Nest | t      ← a clicada
 Plano aprovado    | f
 Esta já foi lida  | t
```

**Rede:** zero requisições para `/api/notifications`. Todas para `/api/backend/notifications`.

**Depois de apagar a rota legada:**

```
BFF (viva)         200 {"notifications":[…]}
legada (apagada)   500 {"error":"Internal server error"}
```

O **500** na legada é o A23: ela cai no catch-all morto de MongoDB. Quando aquele catch-all for removido (tarefa já em andamento), vira 404 sem mudança aqui.

**Detalhe que confundiu a verificação e vale registrar:** depois do primeiro acesso, `document.cookie` deixou de ver o cookie, e minhas tentativas de reescrevê-lo por JS falhavam. Motivo: o NextAuth **reemitiu o cookie como HttpOnly**, que é o comportamento correto — JS não lê nem sobrescreve. O cookie estava lá e sendo enviado; provado por `fetch` da própria página devolvendo 200 com os dados. **Cookie invisível ao JS é o sinal de que a segurança está certa, não de que a verificação falhou.**

**Suítes e builds:** `tsc` limpo nos dois apps, `nest build` e `next build` exit 0, 208 unit + 148 e2e (backend), 300 Jest + 65 Vitest (web).

### O caminho do Pusher, com chaves de verdade

Josiel forneceu `PUSHER_APP_ID`, `NEXT_PUBLIC_PUSHER_KEY` e `PUSHER_SECRET`, então a ponta que faltava foi fechada. O WebSocket subiu e o canal privado autenticou:

```
State changed: connecting -> connected with new socket ID 3742.1544872
pusher:subscribe → private-user-cmslwtzw…  (auth via /api/pusher/auth)
pusher_internal:subscription_succeeded
```

**Caminho `create` (com payload):**

```
Event recd: new-notification { notif: { id, title: "Chegou pelo WebSocket", isRead: false, … } }
```

| | antes do evento | depois |
|---|---|---|
| badge | "2 novas" | **"3 novas"** |
| itens na lista | 3 | **4** ("Chegou pelo WebSocket" no topo) |
| buscas a `/api/backend/notifications` | 1 | **1 — nenhuma nova** |

**Zero queries no banco para atualizar a tela.** É o payload sendo usado, exatamente como projetado.

**Caminho `createMany` (sem payload):**

| momento | buscas novas | estado |
|---|---|---|
| evento chega, sino **fechado** | **0** | badge sobe, lista marcada como suja |
| sino **abre** | **1** | badge "4 novas", "Em massa (sem payload)" no topo, 5 itens |
| sino **reabre** | **0** | lista já limpa |

Antes do D49, o evento sem payload custava uma busca imediata **por destinatário**, mesmo para quem nunca abrisse o sino. Agora custa zero até alguém olhar.

Os 7 testes Jest da rota legada saíram junto com ela (D48); os 61 e2e do Nest cobrem o mesmo comportamento contra Postgres real.
