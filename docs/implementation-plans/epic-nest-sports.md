# Epic: Backend NestJS — Fatia 2: `/sports`, o primeiro domínio

Segunda fatia. A ponte de auth está provada ([epic-backend-nest.md](./epic-backend-nest.md)); agora passa a primeira regra de negócio por ela.

## Por que `/sports` primeiro

Escolhido por ser o menor recurso que exercita tudo que falta na fundação, sem tocar em nada perigoso:

| Precisa provar | `/sports` exercita |
|---|---|
| Prisma no backend | `findMany`, `upsert`, `create`, `update`, `delete`, `count` — a superfície inteira |
| Distinção 401 × 403 (D5b da fatia 1) | 1 rota pública + 4 de admin no mesmo recurso |
| Rota pública atravessando o BFF com dado real | `GET /sports` lê do banco sem sessão |

E o que ele **não** toca: dinheiro, Stripe, PII, e nenhuma das rotas que causaram o incidente que motivou a reescrita. Errar aqui custa uma lista de esportes.

---

## Achados de paridade no legado

Encontrados **lendo antes de desenhar**. Nenhum é corrigido em silêncio.

### A1 — MODERATOR pode excluir esporte, e a mensagem de erro afirma que não

`app/api/admin/sports/[id]/route.ts` (DELETE) checa `session.isAdmin`. Mas `isAdmin` é derivado de `ADMIN_SYSTEM_ROLES`, que **inclui MODERATOR**. Então um moderador passa — e o 403 que ele nunca vê diz literalmente:

> `'Apenas administradores podem excluir esportes permanentemente.'`

A mensagem descreve uma regra que o código não aplica. Pior, isso **contradiz intenção documentada**: `docs/technical_handbook.md` §5 diz *"permitir ao moderador apenas `PATCH` (edição), negando o `DELETE` se ele não for o `ADMIN` principal"*.

**Decisão: portar fielmente (MODERATOR continua podendo excluir) e registrar aqui.** Apertar o privilégio é decisão de produto — pode trancar fora alguém que hoje trabalha assim — e esta fatia é de migração, não de mudança de regra. O que o Nest muda é que a regra passa a ficar **num lugar só** (o guard de roles), então apertá-la depois é editar uma linha em vez de auditar rota por rota.

Fica explícito no código como `@AdminOnly()` incluindo MODERATOR, com comentário, em vez de escondido atrás de um `isAdmin` que não diz quem cabe nele.

### A2 — `DELETE` de esporte inexistente devolve 500, não 404

`PATCH` faz `findUnique` e devolve 404. `DELETE` vai direto ao `prisma.sport.delete`, que lança `P2025` em id inexistente e cai no `catch` genérico → **500 `'Erro interno'`**.

**Decisão: corrigir para 404.** Diferente de A1, aqui não há regra de negócio em disputa — 500 para "não existe" é defeito, não comportamento. Um cliente não consegue distinguir "o esporte não existe" de "o servidor quebrou", e um monitor de erros conta isso como falha do servidor. Corrigir não trava ninguém e não muda o que era possível fazer. Ver D14.

### A3 — Duas telas de admin de esportes coexistem

`app/(admin)/admin/sports/page.jsx` e `app/[locale]/admin/sports/page.js` chamam as mesmas rotas. Fora do escopo desta fatia (nenhuma tela é religada aqui), mas registrado: quando o cutover acontecer, são **dois** lugares a cortar, não um.

### A4 — Limites de `slug` divergem entre criar e editar

`POST` valida `/^[a-z0-9-]{1,50}$/`; `PATCH` valida `/^[a-z0-9-]{1,30}$/`. O mesmo campo aceita 50 caracteres ao nascer e 30 ao ser editado — um slug de 40 criado pelo POST não pode mais ser reenviado pelo PATCH.

**Decisão: portar fielmente, com os dois limites, travado por teste.** É divergência real e visível ao usuário; unificar é escolher qual dos dois está certo, e isso é decisão de produto. Registrado para ser decidido junto de A1.

---

## Decisões

### D10 — Prisma entra agora, com `output` isolado

A fatia 1 deixou Prisma de fora porque nada lia banco. Agora lê.

`apps/backend/prisma/schema.prisma` é **cópia** do de `apps/web`, com um bloco `output` próprio no generator. Sem isso, `prisma generate` no backend sobrescreve o `@prisma/client` hoisted na raiz do monorepo — que é o mesmo que `apps/web` usa.

O histórico de migrations vive **só em `apps/web`**. Fluxo: editar o schema lá → `prisma migrate` lá → espelhar para o backend reinjetando o bloco `output` → regerar. O backend nunca cria migration.

### D11 — Um guard de roles separado, dono exclusivo do 403

O D5b da fatia 1 decidiu isto e adiou a construção até existir rota que exigisse. Existe agora.

`RolesGuard` roda **depois** do `NextAuthJwtGuard` e lê o `SessionPayload` que ele deixou no request. A ordem importa e não é acidental: sem sessão o pedido morre com 401 antes de qualquer pergunta sobre papel. Assim nenhuma rota decide entre 401 e 403 por conta própria — que foi exatamente a divergência medida na fatia 1 (a mesma condição respondia 401 em 5 rotas e 403 em 4).

`@AdminOnly()` é a única forma de exigir papel nesta fatia. Não construo `@Roles(...)` genérico: não há rota que precise de "TRAINER ou ADMIN" ainda, e generalizar antes do segundo caso é inventar o formato errado.

### D12 — O merge de `positions` com `DEFAULT_SPORTS` é preservado

`GET /sports` substitui `positions` vazio no banco pela lista de `DEFAULT_SPORTS` casando por `slug`. Parece gambiarra, mas é o que faz um banco recém-migrado (sem seed de posições) devolver esporte usável ao formulário de anamnese. Portado como está.

`DEFAULT_SPORTS` é duplicado no backend, mesmo critério das constantes de role da fatia 1: o backend não importa de dentro do app Next.

### D13 — `syncDefaults` continua sendo um `action` no corpo do POST

O legado usa `POST /admin/sports` com `{ action: 'syncDefaults' }` para reimportar os padrões, e o mesmo endpoint com `{name, slug}` para criar. Duas operações num verbo.

Portado como está, **porque o frontend legado chama assim** e nenhuma tela é religada nesta fatia — mudar o contrato agora quebraria as duas telas de A3 sem nada em troca. Registrado como candidato a `POST /sports/sync-defaults` no cutover.

### D14 — `DELETE` inexistente devolve 404 (correção de A2)

Única divergência deliberada do legado nesta fatia. Justificativa em A2.

---

## Propriedades a provar por teste

**Público (`GET /sports`):**
1. Não exige sessão.
2. Devolve só esporte com `isActive: true`.
3. Ordena por nome ascendente, no máximo 50.
4. `positions` vazio no banco é substituído pela lista de `DEFAULT_SPORTS` do mesmo slug.
5. `positions` preenchido no banco **não** é sobrescrito.
6. Slug fora de `DEFAULT_SPORTS` com `positions` vazio devolve lista vazia, não erro.

**Guard de roles (D11):**
7. Sem sessão em rota `@AdminOnly()` → **401** (o guard de auth responde primeiro), não 403.
8. Sessão de usuário comum → **403**, corpo `{ error }`.
9. Sessão com `ADMIN` → passa.
10. Sessão com `MODERATOR` → passa (A1, fidelidade registrada).

**Admin:**
11. `GET /admin/sports` inclui `_count.profiles` e não filtra por `isActive`.
12. `POST` sem `name` ou sem `slug` → 400.
13. `POST` com slug inválido → 400; aceita até 50 caracteres (A4).
14. `POST` com slug já existente → 409.
15. `POST` cria com `isActive: true` e devolve 201.
16. `POST` com `action: 'syncDefaults'` faz upsert de todos os padrões e é idempotente.
17. `PATCH` de esporte inexistente → 404.
18. `PATCH` com `isActive: false` e atleta vinculado → 400, com a contagem na mensagem.
19. `PATCH` com slug de outro esporte → 409; com o próprio slug → passa.
20. `PATCH` valida slug em até 30 caracteres (A4 — mais restrito que o POST).
21. `PATCH` aplica só os campos presentes no corpo.
22. `DELETE` com atleta vinculado → 400, sem apagar.
23. `DELETE` sem vínculo apaga e devolve `success: true`.
24. `DELETE` de inexistente → 404 (D14).

---

## Verificação

- Suítes unitárias com Prisma mockado + **e2e contra o Postgres real** (portátil local, banco `trainlab`, 31 migrations aplicadas). A regra da fatia 1 vale: suíte verde não prova que o serviço funciona.
- `nest build` e `next build` com **exit code conferido separado do pipe**.
- Execução real dos dois processos: público sem sessão, 401 sem token, 403 de não-admin, e o CRUD de admin com token cunhado.

### A5 — O achado que só a execução ao vivo pegou, e é maior que esta fatia

Com tudo verde, `/api/backend/admin/sports` **não devolvia 401 nem 403 — devolvia 307 redirect.**

Causa em `apps/web/proxy.ts` (o middleware do Next 16), linha da proteção de rotas:

```ts
const isProtectedRoute = pathname.includes('/dashboard') || pathname.includes('/admin')
```

`includes()`, não `startsWith()`. Então **todo caminho de API que contenha `/admin` ou `/dashboard`** era tratado como página protegida e redirecionado antes de alcançar o handler.

**O efeito é pior que um status errado.** `fetch()` segue o 307 por padrão, então o cliente recebia o HTML da home com **status 200** e `res.json()` estourava — em vez de ler `{ error }` com 401/403. Ou seja: o contrato de erro que as rotas de admin cuidadosamente montam nunca chegava ao cliente.

**Alcance: não é do BFF, é pré-existente.** Atinge também as **39 rotas de `app/api/admin/*`** e `/api/dashboard/stats`. Verificado que **todas as 39 fazem checagem própria de sessão** (`getSessionOrToken`), então o redirect era redundante para proteção — só destruía o contrato.

**Corrigido**, porque bloqueava a fatia e a correção não afrouxa nada: a proteção passa a valer só para página (`!pathname.startsWith('/api')`). Travado por 13 testes em `__tests__/middleware.test.js`, sendo 7 que afirmam que a proteção de **página** continua intacta (home para deslogado, dashboard para não-admin, onboarding para PENDING, sem loop de redirect).

**Achado de infra no caminho**: sob `next/jest`, o `NextResponse` que chega ao teste só expõe `json` — `redirect` e `next` vêm `undefined`, e o arquivo precisa de `@jest-environment node` além disso. Por isso o teste mocka `next/server` e afirma qual **ramo** o middleware escolhe, não o comportamento HTTP — esse fica para a execução ao vivo.

### Também corrigido: dois defeitos nos meus próprios testes

O e2e passou na primeira execução e falhou na segunda. Dois motivos, os dois reais:

1. A asserção de ordenação comparava a lista do Postgres com `localeCompare` do JS — **collations diferentes**. O banco põe `'BBB Beta'` antes de `'Basquete'` (byte order); o JS decide o contrário.
2. A asserção cobria a lista inteira, incluindo linhas que a suíte não criou — os 14 padrões que o `syncDefaults` grava e o cleanup preserva de propósito (são dado de plataforma). Então o teste dependia de banco limpo.

Reescrito para afirmar só a ordem **relativa** das próprias fixtures. **Idempotência provada rodando a suíte duas vezes seguidas**, 47/47 nas duas.

### Provado ao vivo (dois processos, Postgres real, token cunhado)

| Cenário | Resultado |
|---|---|
| `GET /sports` via BFF sem sessão | 200, 14 esportes com posições vindas do banco |
| `/admin/sports` sem sessão | 401 `{error: 'Não autorizado'}` |
| `/admin/sports` com usuário comum | 403 `{error: 'Acesso negado'}` |
| `/admin/sports` com ADMIN | 200 com `_count.profiles` |
| `/admin/sports` com MODERATOR | 200 (A1 valendo no sistema rodando) |
| POST duplicado / sem slug | 409 / 400 |
| PATCH renomear | 200, slug e posições preservados |
| PATCH e DELETE inexistente | 404 |
| **DELETE inexistente na rota LEGADA** | **500** — o D14 medido contra os dois lados, não só lido |

A última linha é a única divergência deliberada desta fatia, confirmada empiricamente: mesma requisição, legado 500, Nest 404.

**Fora de escopo, declarado:** nenhuma tela é religada (A3 continua chamando as rotas legadas), nenhuma rota legada é apagada, e A1/A4 não são "consertados".
