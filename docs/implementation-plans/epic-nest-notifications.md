# Epic: Backend NestJS — Fatia 3: `/notifications`, a posse

Terceira fatia. As duas anteriores cobriram os eixos de **autenticação** (fatia 1: tem sessão?) e **papel** (fatia 2: é admin?). Falta o terceiro, e é o que mais produz vulnerabilidade real: **posse** — o recurso é seu?

## Por que `/notifications` agora

| Eixo de autorização | Onde foi provado |
|---|---|
| Tem sessão? | Fatia 1 — `NextAuthJwtGuard`, dono do 401 |
| Tem papel? | Fatia 2 — `RolesGuard`, dono do 403 |
| **É seu?** | **Esta fatia** |

Posse não é guard: não existe decorator capaz de saber que uma notificação pertence a alguém. É consulta, e por isso mora no service. É também a classe de falha mais comum em API (IDOR — trocar o id na URL e ler o dado de outro), e a que motivou o redesenho do módulo de ficha no projeto irmão.

`/notifications` é o menor recurso onde ela aparece limpa: 2 rotas, sem papel envolvido, sem dinheiro.

---

## Achados de paridade no legado

### A6 — O 401 aqui é em inglês, e isso expôs um erro de medição da fatia 1

As duas rotas devolvem `{ error: 'Unauthorized' }`. Ao investigar, a contagem que a fatia 1 registrou se revelou **incompleta**: o grep de lá procurou por "autoriz" e por isso não viu nenhuma mensagem em inglês.

Medição completa sobre as 120 rotas:

| Variante | Ocorrências |
|---|---|
| `'Unauthorized'` | **84** |
| `'Não autorizado'` | 24 |
| `'Não autorizado.'` | 13 |
| `'Acesso negado.'` | 9 |
| `'Acesso negado'` | 7 |
| `'Sem permissão'` | 6 |
| `'Não autorizado. Apenas administradores.'` | 4 |
| `'Acesso restrito a administradores.'` | 3 |
| `'Sem permissão para acessar este exercício.'` | 2 |
| `'Nao autorizado'` | 2 |
| `'Acesso Negado'` | 2 |

**Onze variantes, não quatro — e a dominante está em inglês num produto em português.** A tabela da fatia 1 foi corrigida.

Consequência para esta fatia: unificar em `'Não autorizado'` muda a string para a **maioria** das rotas, não para uma exceção. Verificado que o consumidor destas duas (`components/dashboard/notification-bell.jsx`) só faz `console.error` na falha de listar e de marcar como lida — não exibe a mensagem. (O mesmo componente **exibe** `data.error` em toast, mas para o endpoint de aceitar convite, que não é desta fatia.)

**Lição de método**: um grep estreito produz um número que parece medição e é amostra. Ao afirmar contagem sobre uma base de código, conferir se o padrão de busca cobre as formas que o próprio código usa — aqui, dois idiomas.

### A7 — A posse é verificada com duas queries, e o padrão certo já é usado em outro lugar do repo

`PATCH :id/read` faz `findUnique` e depois compara `notification.userId !== session.id`. Funciona, mas:

- São duas idas ao banco onde uma bastaria.
- Entre a leitura e o `update` existe uma janela (irrelevante aqui, porque `isRead: true` é idempotente e ninguém muda `userId` de notificação — mas o padrão é o que se copia para o próximo recurso, onde pode não ser irrelevante).

**Decisão: usar `updateMany` com a posse no `where`, e derivar o 404 da contagem afetada.** Ver D17. Não é mudança de comportamento observável — os dois casos continuam 404 — é a mesma propriedade expressa como filtro em vez de `if`.

### A8 — Histórico de três bugs de paginação, todos a preservar

Os comentários da rota registram três correções que **são a especificação real** deste endpoint:

- **BUG-26**: paginação por cursor foi adicionada depois.
- **BUG-65**: o cursor era `id: { lt }`, inconsistente com `orderBy: createdAt`. CUIDs são quase ordenados por tempo, mas "quase" não é ordenação. Passou a ser `createdAt: { lt }`.
- **BUG-108**: `new Date('foo')` é `Invalid Date`, que o Prisma rejeita com P2005 e virava **500**. Passou a devolver 400.

Os três entram como propriedades testadas. O BUG-65 em particular é do tipo que só reaparece se ninguém souber por que a linha está daquele jeito.

---

## Decisões

### D15 — Posse mora no service, não em guard

Um guard sabe *quem* é o requisitante; não sabe de quem é a linha. Fazer um `OwnershipGuard` genérico exigiria o guard consultar o banco por um modelo que ele não conhece — reinventando o service com menos contexto.

Consequência aceita: cada recurso precisa provar posse por conta. O que impede isso de virar a "convenção em vez de garantia" que motivou a reescrita é a forma escolhida no D17 — posse como **filtro da consulta**, não `if` depois da leitura. Filtro esquecido não retorna dado errado: não retorna nada.

### D16 — 404 para "não é seu", nunca 403

Preservado do legado, e é o comportamento certo: 403 confirmaria que o recurso existe. Com 404 nos dois casos, quem tem só o id não consegue distinguir "não existe" de "existe e é de outro" — o endpoint deixa de ser oráculo de existência.

Vale registrar por que **não** é inconsistente com o D5b da fatia 2 (onde a falha de papel é 403): lá o requisitante sabe que o recurso existe (`/admin/sports` é uma rota, não uma linha) e a informação negada é o privilégio dele. Aqui a existência da linha é justamente o que não se pode revelar.

### D17 — Posse é filtro da consulta, não checagem depois da leitura

```
// não:  const n = await findUnique({ where: { id } }); if (n.userId !== me) …
// sim:  updateMany({ where: { id, userId: me }, data: { isRead: true } })
```

Se alguém esquecer o `if`, o dado alheio vaza. Se esquecer o `userId` do `where`, o teste de IDOR quebra — e o e2e desta fatia faz exatamente isso com dois usuários reais no banco.

Custo: `updateMany` não devolve a linha. Como o legado devolve a notificação atualizada, é preciso lê-la depois — mas aí já com posse provada. Duas queries de novo, então; a diferença é que **nenhuma delas depende de um `if` para estar correta**.

### D18 — O cursor continua sendo `createdAt`, não `id`

Preserva o BUG-65. O cursor tem que ser o mesmo campo do `orderBy`, senão a página seguinte pode pular ou repetir linha.

### D19 — Cursor inválido é 400, não 500

Preserva o BUG-108. Validado antes de chegar ao Prisma.

---

## Propriedades a provar por teste

**Autenticação:**
1. `GET /notifications` sem sessão → 401 `{error}`.
2. `PATCH /notifications/:id/read` sem sessão → 401.

**Posse (D16/D17) — o núcleo da fatia:**
3. A lista devolve só notificação do requisitante.
4. `unreadCount` conta só a do requisitante.
5. `PATCH` em notificação de outro usuário → **404**, e a linha **não** é alterada.
6. `PATCH` em id inexistente → 404, com a **mesma** mensagem do caso anterior (não distinguir os dois é a propriedade).
7. `PATCH` na própria notificação → 200 e `isRead: true`.
8. `PATCH` em notificação já lida é idempotente.

**Paginação (D18/D19, A8):**
9. `limit` padrão 20, teto 50, piso 1.
10. `limit` não-numérico cai no padrão.
11. Ordena por `createdAt desc`.
12. O cursor filtra por `createdAt: { lt }` — não por `id`.
13. `nextCursor` é o `createdAt` da última linha quando a página encheu.
14. `nextCursor` é `null` quando a página veio incompleta.
15. Cursor não-ISO → 400, não 500.
16. Cursor válido não pula nem repete linha entre páginas consecutivas.

---

## Verificação

Além das suítes e dos builds com exit code conferido, a execução real tem uma obrigação específica nesta fatia: **duas sessões distintas, criadas no Postgres, provando pela cadeia completa que A não alcança a notificação de B.** Posse afirmada só com Prisma mockado prova o mock, não a consulta.

### Mutação: a posse removida do `where`

Apagar `userId` de `updateMany({ where: { id, userId } })` derruba **exatamente os dois testes de IDOR** (unit e e2e), com o e2e acusando `200` onde esperava `404` — isto é, A escrevendo na linha de B contra o banco real. O resto da suíte segue verde, o que mostra que a cobertura da propriedade está nos testes certos e não é efeito colateral de outra asserção.

### Provado ao vivo (dois usuários reais no Postgres, cadeia completa)

| Cenário | Resultado |
|---|---|
| `GET /notifications` sem sessão | 401 `{error: 'Não autorizado'}` |
| `GET` como A | 200, só `'LIVE da A'`, `unreadCount: 1` |
| `GET` como B | 200, só `'LIVE da B'`, `unreadCount: 1` |
| **`PATCH` da notificação de B, como A** | **404 `'Notificação não encontrada'`** |
| `PATCH` de id inexistente, como A | 404 — **corpo idêntico ao anterior** |
| `PATCH` da própria, como A | 200, `isRead: true` |
| `?cursor=ontem` | 400, não 500 |

**A prova que importa não é o status, é o banco.** Consultado direto depois da tentativa: `'LIVE da A'` com `isRead = true` (a dona marcou), `'LIVE da B'` com `isRead = false` — intacta apesar do `PATCH` de A.

### Paridade com o legado, medida lado a lado

Mesma requisição de IDOR nas duas rotas: **as duas devolvem 404 `'Notificação não encontrada'`**. A única diferença observável entre legado e Nest neste recurso é a mensagem de 401 (`'Unauthorized'` → `'Não autorizado'`), que é a unificação pretendida.

Suíte e2e rodada **duas vezes seguidas**, 61/61 nas duas — idempotente. Banco conferido no fim: 0 usuários, 0 notificações, 14 esportes (os padrões legítimos).

**Fora de escopo:** nenhuma tela é religada (`notification-bell.jsx` continua na rota legada), nenhuma rota legada é apagada.
