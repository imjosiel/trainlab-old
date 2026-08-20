# Fatia 22 — Stripe Connect e ganhos do afiliado

**Estado:** backend feito e verde. Cutover ainda não.

## O recorte

5 rotas. A conta de afiliado em si (`AffiliateAccount`) já é criada em
`onboarding`/`auth/callback/quick-role` — fora desta fatia, sem candidatura
como o parceiro tem. `AffiliateCommissionService` (fatia já migrada) já cobre
o lado que GERA `AffiliateEarning`. Esta fatia é o lado que o afiliado
GERENCIA: conta Stripe, sincronização de status e o que ele vê do próprio
histórico.

### Entra

| legado | verbo | o que faz |
|---|---|---|
| `affiliate/connect/setup` | POST | cria (ou reaproveita, buscando por `metadata.userId`+`metadata.type==='affiliate'`) a conta Connect `custom` do afiliado |
| `affiliate/connect/session` | POST | cria Account Session pro onboarding/gestão embutidos |
| `affiliate/connect/sync` | POST | rebusca status na Stripe **e faz flush** de `AffiliateEarning` pendentes pra `available` quando `payoutsEnabled` vira `true` |
| `affiliate/earnings` | GET | lista paginada do histórico de ganhos, com filtro de data |
| `affiliate/report` | GET | relatório agregado por parceiro indicado + projeção de MRR |

~430 linhas legadas.

### Não entra

- **Rate limiting** (`affiliate_setup_*`, `affiliate_session_*`,
  `affiliate_sync_*`) — aqui o legado realmente tem o limiter *wired*
  (diferente do gap A85 de outras fatias, que só tinha o `checkRateLimit`
  chamado mas nunca implementado). Mesmo assim seguimos a política já
  estabelecida: infra de rate limit é fatia própria, ainda não construída,
  e todo lugar que dependia dela acumula o mesmo débito.
- **Criação da `AffiliateAccount`** — acontece em `onboarding` e
  `auth/callback/quick-role`, que são fatias de auth/perfil, não esta.
- **Handlers do webhook** (`account.updated`,
  `account.application.deauthorized`) — mesmo motivo da fatia 21: servem
  `PartnerAccount` **e** `AffiliateAccount`, migrar é escopo de uma fatia
  de webhook compartilhado.

## Decisões

### D97 — reaproveita `criarSessaoDeConta`/`buscarContaConectada`, um método novo só pra busca/criação

`StripeService.criarSessaoDeConta` e `.buscarContaConectada` (D95, fatia 21)
já são genéricos — recebem `stripeAccountId` e não sabem se é parceiro ou
afiliado. Reaproveitados como estão.

`buscarOuCriarContaConectada` (D95) não dá: `capabilities` do afiliado é só
`transfers` (parceiro tem `card_payments` + `transfers`, porque cobra aluno
diretamente — afiliado só recebe repasse), a busca filtra também por
`metadata.type === 'affiliate'` (sem isso um clique duplo de setup
reaproveitaria a conta Connect de um PARCEIRO com o mesmo `userId`, se a
mesma pessoa for as duas coisas), e a chave de metadata é
`affiliateAccountId`, não `partnerAccountId`. Três diferenças reais, não
só nome — método novo: `buscarOuCriarContaConectadaDeAfiliado`.

### D98 — flush de earnings pendentes é o `transferir` de sempre, reaproveitado

O flush em `connect/sync` transfere cada `AffiliateEarning` pendente via
Stripe quando a conta acaba de ficar apta a receber (`payoutsEnabled`
false→true). É o MESMO `StripeService.transferir` que
`AffiliateCommissionService` já usa pra comissão nova — nenhum método novo
na porta, só mais um chamador.

O lock atômico (`updateMany` pending→flushing antes de transferir, pra
duas chamadas de sync não dobrarem a transferência) é a MESMA classe de
propriedade do D89 (fatia 17, créditos): mock de `updateMany` não prova
nada sobre concorrência real, porque o mock devolve o que mandarem
independente do `where`. Precisa de e2e contra Postgres de verdade —
`test/affiliate-flush-corridas.e2e-spec.ts`, dois `sincronizar()` chamados
em paralelo pela mesma instância de `PrismaService`, mesmo padrão do
`credits-corridas.e2e-spec.ts`.

Limpeza de earnings presos em `flushing` (crash no meio do flush, timeout
de 5 min) entra igual ao legado — é o motivo de existir o `updatedAt` no
filtro do lock.

### D99 — `report`/`earnings` usam `user.isAdmin`, não `systemRoles.includes('ADMIN')` puro

O legado dessas duas rotas checa só `'ADMIN'` literal; o resto do backend
Nest usa `isAdmin` (deriva de `ADMIN_SYSTEM_ROLES`, que inclui
`MODERATOR` — D11/`session-payload.ts`). Sem isso um moderador veria 403
numa tela que um admin vê, inconsistente com toda outra rota do backend.
Sem risco: é meramente que MODERATOR ganha acesso de leitura a um
relatório, não a uma ação de escrita.

### A87 — `GET /api/affiliate/earnings` está quebrado em produção

`earnings/route.ts` filtra por `affiliateAccountId` — campo que **não existe**
em `AffiliateEarning` (o real é `affiliateId`; `affiliateAccountId` é campo de
`PartnerAccount`, usado corretamente em `report/route.ts`). Todo `GET
/api/affiliate/earnings` sempre 500a na prática. Os testes do legado
(`__tests__/api/affiliate/earnings.test.ts`) passam porque mockam o Prisma
inteiro e nunca validam contra o schema real — mascaram exatamente o tipo de
erro que só apareceria contra Postgres de verdade.

Corrigido no port: `affiliateId: conta.id`. Travado por teste que afirma o
campo certo no `where` (não só "não quebra").

### D98a — o e2e do flush só discriminou depois de alargar a janela de corrida

Rodar o e2e contra o código correto passou de primeira — e contra uma versão
DELIBERADAMENTE quebrada (lock removido, achando `pending` direto em vez do
`updateMany` atômico) **também** passou de primeira, o que não prova nada: as
duas chamadas concorrentes não estavam de fato se sobrepondo, porque o
`transferir` fake resolve instantaneamente e a primeira chamada processava a
sozinha antes da segunda alcançar a mesma consulta. Um `setTimeout` de 30ms
dentro do `transferir` fake (só no teste, não no código de produção) alargou
a janela o bastante pra reproduzir a corrida: a versão quebrada passou a
transferir 3 vezes onde deveriam ser 2, e só então a versão com lock atômico
voltou a passar com a janela alargada. **Lição, generaliza o D89**: e2e de
concorrência que passa contra código propositalmente quebrado não prova nada
— precisa ser visto falhando antes de confiar que ele vale alguma coisa.

### Sem gate de `status === 'suspended'` em setup/session/sync

Confirmado no legado: as 3 rotas de Connect não checam
`AffiliateAccount.status`. Só `AffiliateCommissionService` bloqueia
(`suspenso` não transfere comissão nova). Um afiliado suspenso ainda
gerencia a própria conta Stripe — faz sentido, ele pode ter saldo
`pending` represado de antes da suspensão esperando ser sacado depois
que ela for revertida. Preservado como está, não é bug.

## Suítes finais

Backend: **868** unitários (+34 desta fatia, mutação verificada em 4 pontos:
derivação de status `active` só por `payoutsEnabled`, gate `justActivated`,
acumulação flushedTotal só dos earnings que realmente transferiram, e o
bugfix A87 do campo `affiliateId`). `tsc` limpo. E2e: **233** (+1,
`affiliate-flush-corridas.e2e-spec.ts` — D98a acima).

### Nota de ambiente

O Postgres portátil local (`postgresql-portable`, porta 5433 no `.env`)
estava configurado pra escutar em **5432** (`postgresql.conf` sem `port`
setado — default). Corrigido pra `port = 5433`, permanente, pra bater com o
`.env` dos dois apps.
