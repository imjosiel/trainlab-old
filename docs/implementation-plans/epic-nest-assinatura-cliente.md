# Fatia 15 — assinatura do cliente (B2B) e o webhook

**Estado:** o **núcleo de dinheiro** está verde. O CRUD ainda não começou.

| peça | testes | situação |
|---|---|---|
| `WebhookClaimService` (D75) | 11 | **verde** |
| `AffiliateCommissionService` (D76/D77) | 19 | **verde** |
| ofertas, checkout, assinaturas do cliente | — | ainda sem teste |

Backend: 464 → **494** unitários. `tsc --noEmit` limpo.

Comecei por estas duas porque são as que movem dinheiro e as que o legado erra:
o resto da fatia é CRUD com posse, que esta migração já fez cinco vezes. Se
alguma decisão aqui mudar, ela muda o formato do resto — o contrário não.

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
- assinatura duplicada com o mesmo profissional ⇒ 409, pareado com o caso
  legítimo em 200/201
- cancelar e retomar mantêm `stripeSubscriptionId` estável

## Fica de fora

Handlers B2C, de créditos e de tier do parceiro — seguem no webhook do monolito.
O `stripe/checkout-partner-tier` e o `POST /partner/tier-request` também, e
fecham quando essa metade migrar.
