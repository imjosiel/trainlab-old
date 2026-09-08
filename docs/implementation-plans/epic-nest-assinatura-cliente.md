# Fatia 15 — assinatura do cliente (B2B) e o webhook

**Estado:** backend completo e verde — núcleo de dinheiro e as nove rotas +
webhook B2B. Cutover ainda não.

| peça | testes | situação |
|---|---|---|
| `WebhookClaimService` (D75) | 11 | **verde** |
| `AffiliateCommissionService` (D76/D77) | 19 | **verde** |
| `OffersService` (D79) | 27 | **verde** |
| `SubscriptionsService` (D78/D80/D81) | 40 | **verde** |
| `AdminSubscriptionsService` | 11 | **verde** |
| `B2BWebhookService` | 25 | **verde** |
| e2e de corrida contra Postgres real | 2 | **verde** |

Backend: 358 → **597** unitários, 200 → **231** e2e. `tsc --noEmit` limpo. Nove
controllers, treze rotas, todas verificadas de pé no servidor real (seção
abaixo).

Comecei pelo núcleo de dinheiro porque é o que move dinheiro e o que o legado
erra: o resto da fatia é CRUD com posse, que esta migração já fez cinco vezes.
Foi a decisão certa — nenhuma peça do CRUD precisou reabrir o desenho do
núcleo.

### Verificação por mutação

A mutação aqui é literalmente "voltar à ordem do legado": deixar a reserva
perdida (P2002) seguir para a transferência em vez de parar.

```
× P2002 na reserva ⇒ NENHUMA transferência
× transfere UMA vez só, mesmo com os dois chamando junto
```

Exatamente as duas asserções que descrevem o A75, e nenhuma outra.

### Migration

`ProcessedWebhookEvent` ganha `status` e `claimedAt`
(`20260815120000_webhook_event_claim`). As linhas anteriores nascem `concluido`:
elas são recibos de eventos que já terminaram, e deixá-las `processando` faria a
expiração reprocessar pagamento antigo.

**Ainda não aplicada** — ver abaixo.

### O banco mudou de porta

A **5432** está ocupada pelo container `cutclip-postgres`, de outro projeto do
Josiel, e o Postgres do trainlab estava fora. Não derrubei container que não é
desta sessão: subi o Postgres portátil do trainlab na **5433** e apontei os dois
`.env` para lá.

A porta veio por argumento (`pg_ctl -o "-p 5433"`), não por edição do
`postgresql.conf` — a instalação fica como estava.

### As corridas, contra Postgres real

`test/billing-corridas.e2e-spec.ts`, 12 casos, **todos verdes**. Este arquivo
existe porque os unitários dessas duas peças são **encenação**: o P2002 vem de um
mock, ou seja, sou eu quem decide quem perde a corrida. O que o A74 e o A75
afirmam é que **o banco** arbitra.

```
√ duas reivindicações SIMULTÂNEAS: só uma passa — quem arbitra é o banco
√ dez simultâneas: exatamente uma passa
√ claim expirado é retomado, e por apenas UM entre vários
√ mesma fatura por dois caminhos simultâneos ⇒ UMA transferência
√ cinco chamadas simultâneas ⇒ ainda UMA transferência e UMA linha
√ o saldo do afiliado é creditado uma vez só
```

Backend: **494 unitários + 230 e2e**.

### A77 — dois enganos meus que só o banco pegou

**`status === 'active'` num campo que nunca tem esse valor.** O schema documenta
`approved | suspended` e o legado checa `=== 'suspended'`. Com o default real
`approved`, meu `podeTransferir` seria sempre falso: **toda comissão viraria
`reserved` e nada seria transferido.** O teste unitário repetia a mesma suposição
na fixture, então passava — o código e o teste compartilhavam a minha crença
errada. Quem quebrou o empate foi o e2e, ao exigir os nomes reais do schema.

**`transferId` num campo que não existe**, e o `tsc` deixou passar:

```ts
data: { status, ...(transferId ? { transferId } : {}) }
```

Spread condicional dentro de um input do Prisma **desliga a checagem de tipo** —
o objeto espalhado alarga o tipo e campo inexistente entra calado. É o mesmo
`...(x !== undefined ? { x } : {})` que usei em todo lugar nesta migração, e
significa que essa forma não protege contra nome errado. O legado também não
persiste o id da transferência: usa só em memória para escolher o saldo.

**Lacuna registrada, não corrigida:** sem o id do Stripe na linha, não dá para
amarrar uma transferência à comissão que a originou. É lacuna de auditoria de
dinheiro, e fechá-la é migration própria.

### Ainda falta nesta fatia

Ofertas, checkout, assinaturas do cliente e o webhook — a segunda metade, que vai
usar estas duas peças.

## Escopo, e por que ele inclui o webhook

Na fatia 14 deu para recortar "o que não toca Stripe" e sobrou trabalho útil.
Aqui não: das 9 rotas, **7 tocam Stripe**, e as duas que não tocam
(`partner/subscribers`, `offers/public/[id]`) somam 77 linhas de consulta.

E os handlers B2B ocupam **339 das 766 linhas** do webhook. É onde o dinheiro se
move de verdade: `stripe.transfers.create` para o afiliado, criação do vínculo
`Student`, cancelamento de assinatura duplicada no Stripe.

**Josiel escolheu migrar os handlers B2B junto.** Os handlers B2C, de créditos e
de tier do parceiro ficam no webhook antigo — o Stripe aceita dois endpoints
simultâneos, cada um assinando os eventos que trata.

| legado | o que faz |
|---|---|
| `partner/offers` GET/POST | catálogo do parceiro |
| `partner/offers/[id]` PUT/DELETE | idem |
| `partner/offers/public/[id]` GET | **pública** — página de venda |
| `partner/offers/[id]/checkout` POST | assina: trial, grátis ou Stripe |
| `partner/offers/[id]/checkout/verify` GET | confirma o retorno do checkout |
| `partner/subscribers` GET | quem assina o parceiro |
| `user/subscriptions` GET | assinaturas do cliente |
| `user/subscriptions/[id]` PATCH/DELETE | cancelar / retomar |
| `admin/users/[id]/subscription` | override do admin |
| `stripe/webhook` (handlers B2B) | o que confirma tudo acima |

## Achados

### A74 — a idempotência do webhook é check-then-act

```ts
if (await isEventProcessed(event.id)) return cached   // 1. SELECT
... o handler roda ...                                 // 2. trabalho
await markEventProcessed(event.id)                     // 3. INSERT
```

`ProcessedWebhookEvent.eventId` é chave primária, então o INSERT duplicado
falha — mas **só depois de o handler já ter rodado duas vezes**:

```
t1   A: SELECT -> não existe
t2                              B: SELECT -> não existe
t3   A: handler RODA
t4                              B: handler RODA   <-- segunda vez
t5   A: INSERT ok
t6                              B: INSERT viola PK -> 500
```

A unicidade existe e está no lugar certo do schema; o que está errado é o
**momento** em que ela é consultada. Ela é usada como detector tardio, não como
trava.

### A75 — a comissão do afiliado transfere ANTES de registrar

Esta é a mais séria, e a ordem no arquivo é a prova:

```
540   findFirst(invoiceId, affiliateId)     ← checagem
559   stripe.transfers.create(...)          ← DINHEIRO SAI
588   $transaction([affiliateEarning.create ...])   ← razão, protegida por @@unique
627   catch (e) { console.error(...) }      ← engole
```

Existe `@@unique([invoiceId, affiliateId])` no schema — **eu quase reportei que
não existia**, por grepar uma janela curta demais e ler a ausência na minha
amostra como ausência no arquivo. Ela existe e funciona.

Mas ela protege a **razão**, e a transferência acontece 29 linhas antes dela.

O caminho é real e não depende de retentativa: `checkout.session.completed` e
`invoice.payment_succeeded` são **eventos diferentes**, com ids diferentes, então
a idempotência do A74 não os deduplica — e o `handleB2BCheckoutComplete` chama
`processAffiliateCommission` de propósito, como "safety net", contando com a
unicidade. Processados em paralelo:

- os dois passam pelo `findFirst`
- os dois chamam `stripe.transfers.create` — **dinheiro transferido duas vezes**
- um grava o earning; o outro leva P2002
- o P2002 cai no `catch` da linha 627 e vira `console.error`

Resultado: dinheiro sai dobrado, a razão registra uma vez, e o log da execução
que **transferiu com sucesso** diz "falha ao processar comissão".

### A76 — `catch` mudo em cima de dinheiro

O `catch` da 627 cobre a função inteira: falha de transferência, violação de
unicidade e erro de banco viram a mesma linha de log e nenhum sinal. É o que
transforma o A75 de incidente detectável em incidente silencioso.

### A78 — assinatura duplicada é check-then-act, sem trava no banco

**Já corrigido — schema mudou antes do resto do código, porque a decisão de
schema trava tudo o que vem depois.**

Três lugares fazem a mesma checagem, sozinhos: `checkout/route.ts`,
`checkout/verify/route.ts` e o próprio `handleB2BCheckoutComplete` do webhook.
Todos fazem `findFirst` por assinatura ativa do mesmo aluno com o mesmo
treinador, e só criam se não achar.

Provado contra Postgres real, e só na **segunda tentativa** — a primeira, com um
`Promise.all` sobre o mesmo `PrismaClient`, serializou as consultas e não
reproduziu nada. Só forçando três conexões independentes com uma barreira comum
a corrida apareceu:

```
resultados: [ 'assinou', 'assinou', 'assinou' ]
assinaturas para o MESMO usuário e parceiro: 3
```

O comentário do próprio legado mostra que a corrida era conhecida: *"BUG 48 fix:
`Date.now()` pode colidir em requests simultâneos (duplo-click) — usar UUID."*
Trocar por UUID tira a colisão de **id**, não a de **regra** — o efeito foi
tornar a duplicata silenciosa em vez de impedi-la.

### D78 — `partnerId` denormalizado + índice único parcial

`PartnerSubscription` ganhou `partnerId`, migration
`20260815140000_partner_subscription_partner_id`. Copiado de
`offer.partnerId` porque o banco só pode vigiar colunas que enxerga na mesma
linha, e a regra é sobre aluno+parceiro, não sobre aluno+oferta.

Seguro copiar porque nenhuma rota do produto move oferta de um parceiro para
outro — conferido antes de decidir, não assumido.

```sql
CREATE UNIQUE INDEX "PartnerSubscription_userId_partnerId_active_key"
  ON "PartnerSubscription" ("userId", "partnerId")
  WHERE "userId" IS NOT NULL AND "partnerId" IS NOT NULL
    AND status IN ('active', 'canceling', 'trialing', 'past_due');
```

Parcial de propósito: histórico cancelado não pode bloquear reassinatura
legítima. Verificado com o mesmo ataque de três conexões — agora **uma** passa,
e nenhum código verificou nada antes: o índice decidiu sozinho.

Banco de desenvolvimento tinha zero `PartnerSubscription` — nada para limpar. A
query de diagnóstico para outros ambientes fica documentada na própria
migration.

### A79 — a página de venda pública devolve a conta financeira inteira do parceiro

`GET /partner/offers/public/[id]` não pede sessão — é a página que o aluno vê
antes de assinar. E devolve:

```ts
include: { partner: { include: { user: {...} } }, _count: {...} } }
```

`include` sem seleção nenhuma no `partner` traz os **21 campos** de
`PartnerAccount`: `stripeAccountId`, `stripeAccountStatus`, `commissionRate`,
`customCommissionRate`, `minimumPayoutAmount`, `bonusThreshold`,
`bonusRateDrop`, `payoutsFrozen`, `motivation`, `rejectionReason`,
`approvedById`, entre outros.

É a mesma classe do A9 (perfil público de atleta) e do A11 (perfil próprio) —
`include` como allowlist de **relação**, não de **campo**, numa rota sem
sessão. A régua comercial do parceiro (quanto a plataforma fica) fica visível a
qualquer um com o link da oferta.

### A80 — o `GET` de assinaturas do cliente sincroniza, escreve e nunca para

`GET /user/subscriptions` chama `stripe.subscriptions.retrieve()` **uma vez por
assinatura ativa** (N+1, sem paralelismo real — `Promise.all` sobre chamadas de
rede, uma por vez na prática por causa do rate limit do Stripe), e dentro do
mesmo `GET`:

- atualiza `status` no banco quando diverge do Stripe
- cria `Notification` de downgrade pronto (com uma checagem de duplicata que
  não usa unicidade — só "notificação recente do mesmo tipo existe?")
- reconecta `Student.userId` de quem tinha ficado órfão

É o A70 (fatia 14) multiplicado: lá era um `upsert` de config; aqui é chamada de
rede externa, mais update condicional, mais criação de notificação, mais
reconexão de vínculo — tudo atrás de um verbo que promete só ler.

O comentário do próprio arquivo admite o motivo: *"garante consistência mesmo
em ambientes locais sem Stripe CLI (webhooks não chegam)."* É contorno de
ambiente de desenvolvimento, promovido a comportamento de produção.

### A81 — confirmação pelo `verify` e pelo webhook competem pela mesma linha, sem se falarem

`checkout/verify` (chamado pelo navegador ao voltar do Stripe) e
`handleB2BCheckoutComplete` (chamado pelo Stripe) criam `PartnerSubscription`
para o **mesmo** `stripeSubscriptionId`. A coluna é `@unique` de verdade — a
diferença do A74/A78 é que aqui **existe** trava no banco.

O problema é o que acontece quando a trava dispara: nenhum dos dois lados
espera um P2002 ali. Quem perde a corrida cai no `catch` genérico da rota e
devolve 500 — para um cliente cuja assinatura **foi criada com sucesso** pelo
outro caminho. O aluno vê erro numa compra que funcionou.

## Decisões

### D75 — reivindicar antes de trabalhar

O marcador passa a ser gravado **antes** do handler, e a chave primária vira a
trava: quem consegue o INSERT processa, quem leva P2002 devolve 200 (o Stripe já
tem alguém cuidando do evento).

Se o handler falhar, o claim é apagado, para o Stripe reentregar. A janela que
sobra é "processo morre entre o claim e o handler" — e para isso o registro ganha
`status` e `claimedAt`, com claim expirado sendo reivindicável.

### D76 — efeito externo depois do registro, nunca antes

`processAffiliateCommission` inverte a ordem:

1. **reserva** o earning com `status: 'reserving'` — a `@@unique` vira a trava,
   e P2002 aqui significa "outro já está cuidando", não erro
2. transfere no Stripe
3. marca `available` com o `transferId`, ou `pending` se a transferência falhar

Assim a unicidade que já existe passa a proteger **a transferência**, e não só a
linha da razão.

### D77 — dinheiro não tem `catch` mudo

Erro em comissão passa a subir. O webhook devolve 500, o Stripe reentrega, e o
D75 garante que reentregar é seguro. Perder comissão em silêncio é pior que
devolver 500 — o Stripe existe justamente para insistir.

### D79 — a página pública devolve `select` explícito, sem financeiro

Mesma correção do A9/A11: troca `include` por `select`, listando o que a página
de venda precisa mostrar — nome, foto, username do profissional — e nada do
lado financeiro da conta.

### D80 — o `GET` de assinaturas para de sincronizar, e o motivo é que esta
### própria fatia torna a sincronização desnecessária

Esta é a decisão que muda mais forma, e por isso fica documentada por extenso.

O comentário do legado justifica o polling do Stripe dizendo que webhooks podem
não chegar em ambiente local. Verdade — mas é sintoma de **desenvolvimento sem
Stripe CLI rodando**, não de o webhook ser structuralmente não-confiável. Em
produção, o webhook é quem muda o status; o `GET` só deveria mostrar o que já
está gravado.

E esta fatia está justamente **endurecendo o webhook**: o D75 dá idempotência
real por reivindicação, o D76 ordena reserva antes de dinheiro. Depois desta
fatia, o webhook B2B é a fonte de verdade mais confiável que existe no sistema —
manter uma segunda fonte de verdade (polling a cada leitura) é o tipo de
duplicação que esta migração inteira existe para eliminar.

**`SubscriptionsService.list()` vira leitura pura**: sem chamada ao Stripe, sem
`update`, sem `create` de notificação, sem tocar em `Student`. Lê o que o
webhook já gravou.

Duas coisas que o `GET` fazia como rede de segurança migram para onde a
correção pertence:

- **Notificação de downgrade pronto** — já é responsabilidade de
  `handleB2BSubscriptionDeleted` no webhook (linha 468–479 do legado, que este
  cutover também está migrando). A cópia que vivia no `GET` era duplicata
  defensiva; sai.
- **Reconexão de `Student.userId` órfão** — passa a acontecer na **criação** da
  assinatura (`SubscriptionsService.criar`), não a cada leitura. É onde a
  informação (email do comprador) já está disponível, sem precisar redescobrir
  a cada `GET`.

O contrato de resposta não muda: `{ subscriptions, trainers, systemSettings }`,
os mesmos campos. O cutover do frontend não precisa saber que a origem do dado
ficou mais simples.

**O que fica de fora de propósito:** ambiente local sem Stripe CLI configurado
volta a mostrar status desatualizado até o próximo evento real. Isso é
característica de ambiente de dev, documentada em `DEVELOPMENT.md`, não bug de
produção escondido atrás de uma chamada de rede a cada carga de tela.

### D81 — `verify` e webhook não competem: o segundo a chegar reconcilia, não erra

O P2002 em `stripeSubscriptionId` deixa de cair no `catch` genérico. Quem perde
a corrida busca a linha que o outro criou e devolve o mesmo resultado de
sucesso — a mesma lógica do `reivindicar` do D75, aplicada aqui sem precisar de
tabela nova, porque a unicidade já existe na coluna.

## Plano de testes

**Unitários** (Stripe e Prisma mockados):

- claim concorrente: dois processadores do mesmo `event.id`, o handler roda **uma** vez
- claim liberado quando o handler falha, e o evento pode ser reprocessado
- comissão: P2002 na reserva ⇒ **nenhuma** chamada a `transfers.create`
- transferência falha ⇒ earning fica `pending`, saldo em `pendingBalance`
- afiliado suspenso ⇒ `reserved`, sem mexer em saldo
- unicidade por treinador no checkout: trial, grátis e pago
- oferta grátis não chama Stripe

**e2e contra Postgres real:**

- `checkout.session.completed` e `invoice.payment_succeeded` do mesmo cliente,
  **em paralelo** ⇒ exatamente um `AffiliateEarning` e uma transferência
- assinatura duplicada com o mesmo profissional (checkout pago, grátis e trial)
  ⇒ 409/bloqueio, pareado com o caso legítimo em 200/201 (A55)
- **três conexões concorrentes criando assinatura para o mesmo par
  aluno+parceiro ⇒ exatamente uma passa** (prova direta do índice do D78)
- `verify` e webhook chamados para a mesma `stripeSubscriptionId` em paralelo ⇒
  os dois devolvem sucesso, uma linha só (D81)
- cancelar e retomar mantêm `stripeSubscriptionId` estável
- `GET /user/subscriptions` não muda o banco: medir contagem de queries de
  escrita antes/depois de chamar a rota, tem que ser zero (D80)

**Unitários adicionais desta metade:**

- página pública de oferta: corpo da resposta não tem `stripeAccountId`,
  `commissionRate` nem os outros 19 campos financeiros (D79)
- listagem de assinaturas nunca chama `stripe.subscriptions.retrieve` (D80)
- criar assinatura reconecta `Student.userId` quando existe registro órfão com
  o mesmo email
- guest checkout (sem `userId`) ainda cria a assinatura, e a checagem de
  duplicata não se aplica a ele — paridade explícita com o legado, não descoberta
  tardia
- admin `grant`/`revoke`: IDOR — revogar assinatura de outro usuário via
  `subscriptionId` de terceiro ⇒ 404, não sucesso silencioso

## Fica de fora

Handlers B2C, de créditos e de tier do parceiro — seguem no webhook do monolito.
O `stripe/checkout-partner-tier` e o `POST /partner/tier-request` também, e
fecham quando essa metade migrar.

**A83 — guest checkout pula a checagem de duplicata.** `if (userId) { ...guarda...
}` no legado: sem sessão, qualquer volume de assinaturas passa. Não é
corrida — é ausência de regra. Registrado, não corrigido: mudar isso é decidir
se guest checkout deve identificar por email, o que é política de produto,
não port. Com o D78, o índice parcial já filtra `userId IS NOT NULL`, então o
comportamento observável é o mesmo do legado — a lacuna sobrevive por
construção do índice, não por descuido novo.

**Ambiente local sem Stripe CLI mostrando status desatualizado** — consequência
aceita do D80. Registrar em `DEVELOPMENT.md` como nota de setup, fora do escopo
de código desta fatia.

## Segunda metade — feita

Nove rotas + webhook B2B, em quatro serviços e sete controllers, todos sob
`BillingModule`.

### A63 nesta metade — dois testes meus estavam contraditórios

Ao implementar, dois testes da rodada vermelha se revelaram errados, não o
código: `service.checkout(OFFER, null, {})` aparecia em dois testes esperando
**exceções diferentes** para a mesma chamada — um 400 (sem email), outro 401
(sem sessão). São contraditórios por construção; o legado checa email antes de
qualquer ramo, então sem email a resposta é sempre 400, nunca 401.

Um terceiro teste (A83) chamava `checkout()` para provar que guest não é
bloqueado por duplicata — mas `checkout()` nunca grava linha no caminho pago;
quem grava é `verificarCheckout()` ou o webhook, depois do Stripe confirmar. O
teste testava o método errado. Corrigido movendo a asserção para
`verificarCheckout()`, com `metadata.userId: 'guest'` — que é exatamente onde a
lacuna do A83 vive de verdade.

Os três foram pegos rodando os testes contra a implementação, não relidos a
frio — é a suíte fazendo o trabalho de encontrar a própria vacuidade.

### Verificação por mutação, aplicada às duas decisões centrais desta metade

**D78 — traduzir P2002 em `ConflictException`.** Removida a tradução, deixando
o erro cru do Prisma subir: 1 unitário e 1 e2e caem — e só esses. O e2e
continua com 1 sucesso (o índice do banco protege de qualquer jeito), mas
`conflitos` fica em 0: a diferença que a mutação prova é entre "bloqueado" e
"bloqueado do jeito certo".

Uma primeira tentativa de mutação (reintroduzir `findFirst` antes do `create`)
**não quebrou nada** — e isso também é informação: o índice do D78 protege
independente do código de aplicação, então adicionar de volta o check-then-act
do legado é redundante, não perigoso. Defesa em profundidade real.

**D80 — sincronizar com o Stripe dentro de `listar()`.** Reintroduzida uma
chamada a `stripe.recuperarSessaoDeCheckout()` por assinatura. Cai exatamente
`NUNCA chama o Stripe`, e nenhum outro teste — a suíte de leitura pura tem
precisão cirúrgica.

### Verificação ao vivo

Servidor real, `npm run dev:backend`, log completo do boot conferido: as treze
rotas mapeadas, sem colisão de path (`OffersController` em `/partner/offers` e
`CheckoutController` em `/partner/offers/:id` coexistem sem conflito — verbos e
sub-caminhos diferentes).

```
GET  /health                                  -> 200
GET  /public/partner-tiers                    -> 200
GET  /partner/offers/public/nao-existe        -> 404
POST /stripe/webhook-b2b (sem assinatura)     -> 400, mensagem clara
GET  /user/subscriptions (sem token)          -> 401
```

O webhook recusa com mensagem legível (`STRIPE_WEBHOOK_SECRET_B2B ausente`) em
vez de 500 genérico — o `.env` ainda não tem o segredo B2B configurado, e isso
é esperado neste ponto.

### Peça de infraestrutura nova: corpo cru para o webhook

`main.ts` ganhou `{ rawBody: true }` no `NestFactory.create`. Sem isso, o
Express reserializa o JSON antes do handler ver o corpo, e
`stripe.webhooks.constructEvent` falha a verificação de assinatura mesmo com o
segredo certo — a verificação é sobre os bytes exatos que o Stripe assinou, não
sobre uma releitura do JSON.

### `StripeService` deixou de ser esqueleto

As dez pontas do SDK do Stripe (`checkout.sessions`, `customers`, `products`,
`prices`, `subscriptions`, `transfers`, `webhooks.constructEvent`) foram
implementadas de verdade, com o mesmo padrão preguiçoso do `RealtimeService` e
do `CalendarService`: instancia só no primeiro uso, para a ausência de
`STRIPE_SECRET_KEY` não derrubar rotas sem relação com pagamento.

## A84 — o ramo que faltou no cutover: desconectar de profissional gratuito

Achado ao ler `dashboard/profile/page.js` antes de trocar as URLs, não em
teste. `DELETE /user/subscriptions/[id]` no legado atende **dois** tipos de id
no mesmo endpoint:

```js
// 1. É PartnerSubscription?
if (subscription && subscription.userId === session.id) { ...cancela... }
// 2. É Student record (treinador gratuito)? — desconecta imediatamente
if (studentLink && studentLink.userId === session.id) { ...desconecta... }
```

Minha primeira versão de `cancelar()` só tinha o primeiro ramo. `handleDisconnect`
na tela chama com `studentLink.id` sempre que não há `matchingSub` — é caminho
ativo (aluno vinculado sem nunca ter pago, o profissional cadastrou manual),
não redundância. Sem o segundo ramo, desconectar de um profissional gratuito
devolveria 404 para uma ação legítima — regressão real, silenciosa, que só um
teste de UI ou o próprio usuário reclamando revelaria em produção.

Corrigido com TDD antes de seguir o cutover: teste vermelho (`id de Student do
próprio usuário → desconecta`), depois `desconectarStudent()` como segundo
ramo, com o mesmo padrão de posse por filtro (D17) — `Student` de outro usuário
dá 404, igual a inexistente. 44 testes no arquivo, todos verdes.

## Cutover — feito pela metade, de propósito

19 chamadas em 8 telas apontadas para `/api/backend/...`. Nove rotas legadas
apagadas (`partner/offers` completo, `user/subscriptions` completo,
`partner/subscribers`, `admin/users/[id]/subscription`), com os três arquivos
de teste que as cobriam.

`partner/offers/public` e `stripe/webhook-b2b` entraram em `PUBLIC_PREFIXES`
no BFF, com seis testes novos na suíte de proxy — incluindo a prova de que o
corpo do webhook atravessa **byte a byte**, sem reserialização (a assinatura do
Stripe depende disso), e que o header `stripe-signature` chega intacto.
Verificado por mutação: tirar `stripe/webhook-b2b` da lista derruba exatamente
os três testes que dependem dele.

### O que NÃO apaguei, e por quê

`apps/web/app/api/stripe/webhook/route.ts` — **intocado**. Continua com os
handlers B2B inteiros (`handleB2BCheckoutComplete`,
`handleB2BSubscriptionUpdate/Deleted`, `handleB2BInvoicePaymentSucceeded/Failed`,
`processAffiliateCommission`).

Isto não é decisão técnica, é limite do que dá para fazer daqui. O Stripe está
configurado **hoje** para mandar eventos B2B para esse endpoint — mudar isso
exige mexer no Painel do Stripe, e eu não tenho acesso a ele. Migrar o código e
esquecer do painel deixaria os handlers novos existindo, mas sem tráfego
nenhum: o backend antigo continuaria processando tudo, silenciosamente, e a
fatia inteira teria sido código morto.

Pior seria o caminho contrário — apagar os handlers do endpoint antigo **antes**
de o painel apontar para o novo. Nesse intervalo, todo evento B2B (assinatura
paga, comissão de afiliado) cairia no `default` do switch e não seria
processado por ninguém. Silencioso, sem 500, sem log de erro óbvio — só
dinheiro que devia se mover e não se moveu.

Cheguei a considerar rodar os dois endpoints em paralelo por um tempo, como
transição seguindo o padrão desta fatia (idempotência por reivindicação). Não
é seguro por padrão: os dois pontos compartilham a mesma tabela
`ProcessedWebhookEvent`, mas o endpoint antigo ainda faz check-then-act (é
justamente o A74) — ele só grava o próprio marcador **no final**, depois de já
ter processado. Se as duas entregas do Stripe chegarem quase juntas, o novo
endpoint reivindica primeiro (grava logo no início) e ainda assim o antigo pode
já estar no meio do próprio processamento, sem ter visto a reivindicação. As
duas transferem no Stripe. `transfers.create` não é operação que se desfaz
sozinha.

**O que fica pendente, e é ação do Josiel, não minha:**

1. Adicionar um segundo endpoint no Painel do Stripe apontando para
   `<domínio>/api/backend/stripe/webhook-b2b`, assinando exatamente os seis
   tipos de evento que o `B2BWebhookService` trata:
   `checkout.session.completed`, `customer.subscription.created`,
   `customer.subscription.updated`, `customer.subscription.deleted`,
   `invoice.payment_succeeded`, `invoice.payment_failed`.
2. Copiar o segredo de assinatura que o Stripe gerar para esse endpoint em
   `STRIPE_WEBHOOK_SECRET_B2B`, no `.env` do backend.
3. **Só depois** de confirmar que o novo endpoint está recebendo e processando
   eventos de verdade (staging, ou um evento de teste do próprio Painel),
   remover os handlers B2B do endpoint antigo — nessa ordem, sem sobreposição
   de tráfego real.

Até lá, o backend novo processa exatamente zero pagamentos B2B reais. Testado,
verde, no ar — e desligado da fonte de eventos até essa troca manual acontecer.

### A85 — rate limit não foi portado (registrado, não corrigido)

O legado protege `POST /partner/offers` (`checkRateLimit('partnerOffer', ...)`)
e o checkout trial (`checkRateLimit('checkoutB2BTrial', ...)`) contra abuso.
Nenhum dos dois entrou no Nest — não havia limitador equivalente disponível no
backend nesta fatia, e criar um do zero é escopo maior que um cutover.

Não é rota de dinheiro sem proteção nenhuma: `criar()` exige parceiro aprovado
e `payoutsEnabled`, o que já filtra a maior parte do abuso trivial. Mas
criação de produto no Stripe a cada chamada, sem limite, é superfície real.
Registrado para fatia própria de infraestrutura (limitador compartilhado no
backend), não para esta.

### A86 — `customer.subscription.created` e `.updated` fora de ordem sobrescreviam o status certo com um velho

Achado testando um checkout real de ponta a ponta (conta Connect de teste,
oferta paga, Embedded Checkout, cartão `4242...`), não em teste sintético.

A Stripe entregou quatro eventos da mesma assinatura, todos no mesmo segundo:

```
checkout.session.completed              → cria a linha com status 'active'
customer.subscription.updated  (active) → confirma 'active'
customer.subscription.created  (incomplete) → SOBRESCREVE para 'incomplete'
invoice.payment_succeeded               → não mexe em status
```

`customer.subscription.created` carrega o retrato de ANTES do pagamento
confirmar — é assim que a Stripe gera o evento quando a assinatura nasce em
`payment_behavior: default_incomplete`. O Stripe **não garante ordem de
entrega** entre eventos diferentes do mesmo objeto, e `handleSubscriptionUpdate`
confiava cegamente no `subscription.status` de qualquer payload que chegasse
por último — nesse caso, o mais velho ganhou por ter chegado depois.

Resultado real, confirmado direto na API da Stripe: `sub_1U55CQ...` estava
`active` na Stripe, `incomplete` no nosso banco. Um cliente cobrado de verdade
veria a própria assinatura como pendente, possivelmente para sempre — nenhum
evento futuro corrigiria sozinho, porque nada re-dispara `created`.

**D82 — comparar timestamp do evento foi cogitado e descartado.** `created` do
Stripe só tem resolução de segundo, e os quatro eventos deste caso caíram no
mesmo segundo — um desempate por timestamp não teria decidido nada aqui.
Optamos por eliminar a corrida em vez de tentar ordená-la: `handleSubscriptionUpdate`
agora ignora o `status` do payload e chama `stripe.recuperarAssinatura()` —
uma releitura direta na Stripe — para decidir o status a gravar. Custo: uma
chamada de API a mais por evento de assinatura (não por webhook em geral).
Sem risco de limite de taxa nesse volume (Stripe permite ~100 req/s; este
endpoint só é chamado em mudança de assinatura, não em polling), e falha de
rede já tem rede de segurança pronta — o claim é liberado (D75) e a Stripe
reentrega.

Corrigido com TDD: dois testes vermelhos reproduzindo a corrida (`created`
chegando depois do `updated`, com `stripe.recuperarAssinatura` mockado
divergindo do payload), implementação, depois **verificado contra o evento
real** — reenviei `evt_1U55CUCnRjvq6zNu682rXkAY` (o mesmo que causou o bug,
via `stripe events resend`) contra o backend corrigido e confirmei no banco:
`status` virou `active`, batendo com a Stripe.

### Suítes finais

Backend: **603** unitários (+4 do A84, +2 do A86) + **231** e2e.
Web: **183** Jest + 65 Vitest.
