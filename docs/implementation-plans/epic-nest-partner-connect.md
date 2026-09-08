# Fatia 21 — candidatura e Stripe Connect do parceiro

**Estado:** feito, verde e cutover.

## O recorte

Diferente da maioria das fatias de dinheiro até aqui, esta **não tem perna
de webhook**: as 4 rotas são requisição/resposta síncrona — criar
candidatura, criar/reaproveitar conta Connect, criar sessão de onboarding,
sincronizar status. Nenhuma delas escreve nada que um webhook também
escreve como fonte de verdade (`account.updated`/`account.application.deauthorized`
continuam no webhook compartilhado, mantendo `PartnerAccount.stripeAccountId
/payoutsEnabled/chargesEnabled/stripeAccountStatus` sincronizados de forma
independente — os dois caminhos escrevem o mesmo estado computado, não há
corrida de dinheiro aqui). Não precisa coordenar o Painel da Stripe.

### Entra

| legado | verbo | o que faz |
|---|---|---|
| `partner/apply` | POST | candidatura (nova ou reaplicação após rejeição); auto-aprova se `SystemSettings.autoApprovePartners` |
| `partner/connect/setup` | POST | cria (ou reaproveita, buscando por `metadata.userId` na Stripe) a conta Connect `custom` do parceiro |
| `partner/connect/session` | POST | cria Account Session (client_secret) pro onboarding embutido |
| `partner/connect/sync` | POST | rebusca o status real na Stripe e sincroniza `payoutsEnabled/chargesEnabled/stripeAccountStatus` |

~276 linhas legadas, 4 rotas.

### Não entra

- **`checkRateLimit('partnerApply', ...)`** — mesmo gap do A85.
- **Handlers do webhook** (`account.updated`, `account.application.deauthorized`)
  — continuam no legado; servem `PartnerAccount` **e** `AffiliateAccount`
  (afiliados também têm Connect), então mexer neles é escopo de uma fatia
  de afiliados, não desta.

## Decisões

### D95 — `StripeService` ganha o trio de Connect

Três métodos novos, todos pagamento em nome de terceiro (não é o parceiro
pagando a plataforma, é a plataforma delegando *quem recebe*):
`buscarOuCriarContaConectada` (a busca paginada por `metadata.userId` —
BUG-16 do legado, evita duplicar conta se o parceiro clicar duas vezes),
`criarSessaoDeConta` (Account Session), `buscarContaConectada` (retrieve,
usado pelo sync).

### D96 — três desvios deliberados do legado, sem impacto observável

- **401 → 403 para não-profissional.** O legado devolve 401 em
  `partner/apply` quando `roles` não inclui `PROFESSIONAL` — mistura "não
  autenticado" com "não tem o papel certo". No Nest o guard global já é
  dono do 401 (D11); papel errado é 403, mesmo critério do
  `PartnerTiersController` (`partner-tiers.controller.ts`). Sessão ausente
  continua 401, resolvida pelo guard antes de chegar aqui.
- **201 nos dois ramos de `candidatar`.** O legado devolve 201 pra
  candidatura nova e 200 pra reaplicação; o Nest devolve 201 (padrão) nos
  dois. As duas telas que chamam a rota
  (`dashboard/partner/apply/page.js`, `partner/apply/page.js`) só checam
  `res.ok`, nunca o código exato — confirmado antes de decidir não replicar
  o branch de status.
- **Aviso a admins via `NotificationsService`, não `notification.createMany`.**
  Mesmo dado gravado (uma notificação por admin), mas passa pelo port já
  usado no resto do backend Nest — ganha o emit de realtime que o legado
  fazia via `$extends` implícito no Prisma do Next, que o `PrismaService`
  do Nest não tem (mesmo motivo do D70/`NotificationsService`).

### Suítes finais

Backend: **834** unitários (+26 desta fatia, mutação verificada nos dois
ramos não triviais — derivação de status do sync e dedup de role). `tsc`
limpo. Frontend: **171** (a suíte de `partner/apply` legada foi removida
junto com a rota).

## Cutover

Sem webhook, sem segredo, sem Painel da Stripe — nada pendente do lado do
Josiel desta vez. Rotas legadas apagadas
(`app/api/partner/apply`, `app/api/partner/connect/{setup,session,sync}`)
e sete chamadas de frontend repontadas pra `/api/backend/partner/...`:
`dashboard/partner/apply`, `partner/apply` (landing), `hooks/useStripeConnect`,
`dashboard/partner/settings`, `dashboard/partner/revenue` e as duas de
`dashboard/partner/onboarding` (setup e session).
