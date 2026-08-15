# Fatia 14 — tiers do parceiro (a parte que não toca Stripe)

**Estado:** backend feito e verde. Cutover ainda não.

| suíte | antes | agora |
|---|---|---|
| unitários do backend | 358 | **464** (+106) |
| e2e contra Postgres | 200 | **218** (+18) |

`tsc --noEmit` limpo. No vermelho eram 106 e 18 falhando; os 17 verdes eram todos
do `inteiroNaFaixa`, que só mudou de casa.

### Verificação por mutação

**1 — `numeroNaFaixa` sem checagem de tipo** (`parseFloat` como no legado):
23 unitários e 2 e2e caem, incluindo `price = "abc" → 400, não 500`.

**2 — aprovar move o tier sem a comissão**: 1 unitário e 1 e2e caem. É a mutação
que importa: os testes distinguem "trocou de tier" de "trocou de tier **e** de
comissão", e é essa diferença que vira dinheiro errado sem nenhum erro.

### A73 — meu e2e deixou o banco sem tier padrão

A invariante do D72 é sobre a **tabela**, então testá-la exige um `updateMany`
que alcança linhas que a suíte não criou. Na primeira execução, promover um tier
de teste a padrão desmarcou o `starter` real do banco de desenvolvimento — e a
limpeza do `afterAll`, que só apaga o que a suíte criou, devolveu o banco com
**zero** padrões. Exatamente o estado do A69.

Verde nos 18 testes, e o dano só apareceu porque fui conferir o banco depois.

Corrigido guardando os padrões originais no `beforeAll` e restaurando no
`afterAll`. **Limpar só o que se criou não basta quando a escrita é sobre o
conjunto** — e essa é uma classe de vazamento de teste que as fatias anteriores
não tinham, porque nelas toda escrita era por id.

## O recorte, e por que ele existe

"Assinaturas do parceiro" são 11 rotas (~920 linhas) **mais** o `stripe/webhook`,
que tem 766 linhas. O levantamento encontrou uma fronteira que não dá para
ignorar: **o fluxo pago de tier não termina na rota.**

`POST /partner/tier-request` só cria a sessão de checkout. Quem troca o tier e a
`commissionRate` é o **webhook**, quando o Stripe chama de volta com
`type: 'partner_tier_payment'`. E o webhook é um endpoint só — uma URL, uma
verificação de assinatura — atendendo quatro fluxos: assinatura B2C, assinatura
B2B do cliente, compra de créditos e pagamento de tier, mais comissão de afiliado
e reembolso.

Migrar a borda e deixar o webhook faria o Nest criar a cobrança e o Next aplicar
o efeito: **dois serviços escrevendo `PartnerAccount` no mesmo fluxo de dinheiro.**

**Josiel escolheu o recorte sem Stripe.** Entra o que é CRUD e decisão
administrativa; o checkout pago e o webhook ficam intactos para uma fatia
dedicada, que migra o webhook inteiro de uma vez.

### Entra

| legado | verbo | o que faz |
|---|---|---|
| `/api/partner/tiers` | GET | tiers ativos, para o parceiro escolher |
| `/api/public/partner-tiers` | GET | **público** — tabela de preços da landing |
| `/api/admin/partner-tiers` | GET/POST | CRUD de tier |
| `/api/admin/partner-tiers/[id]` | PUT/DELETE | idem |
| `/api/admin/tier-requests` | GET | fila de pedidos |
| `/api/admin/tier-requests/[id]` | PATCH | aprova ou rejeita |
| `/api/admin/partners/[id]/tier` | PATCH | admin força o tier |

### Não entra

`POST /partner/tier-request` (cria checkout), `stripe/checkout-partner-tier`,
`stripe/webhook`. O `GET /partner/tier-request` fica junto do POST: partir um
arquivo de rota ao meio para o front chamar dois backends no mesmo caminho troca
uma duplicação por outra.

## Achados

### A68 — cinco campos numéricos, três com guarda e dois sem. Os dois sem são o dinheiro.

No **mesmo** `POST /api/admin/partner-tiers`:

```
entrada "abc":
  commissionRate    BARRADO (400)
  payoutDelayDays   7        (fallback)
  creditsPerPeriod  null     (fallback)
  minPrice          NaN      <-- vai para o Prisma
  price             NaN      <-- vai para o Prisma
```

`parseFloat('abc')` é `NaN`, e `NaN` num `Float` do Prisma vira 500. Quem tem
guarda tem `Number.isFinite`; `price` e `minPrice` não têm.

E a assimetria continua na faixa: `commissionRate` é validado entre 0 e 1,
enquanto `price: -100` e `minPrice: -100` **passam**.

**Terceira ocorrência desta forma exata nesta base**, e vale nomeá-la: o BUG-102
corrigiu o tipo em `workDays` e deixou as horas (A58); aqui a guarda existe em
três campos e falta em dois. **Correção aplicada a um campo e não aos irmãos é a
forma de defeito mais recorrente deste código.**

### A69 — o BUG-118 foi corrigido no POST e não no PUT

O `POST` tem, com comentário explicando o risco:

```ts
// BUG-118 fix: updateMany(isDefault→false) + create(isDefault:true) eram operações
// independentes. Se o create falhasse, todos os tiers ficavam com isDefault=false
// → onboarding de parceiros quebrado.
await prisma.$transaction(async (tx) => { ... })
```

O `PUT`, três arquivos adiante, faz exatamente o que o comentário descreve como
defeito:

```ts
if (isDefault === true) {
  await prisma.partnerTier.updateMany({ where: { NOT: { id } }, data: { isDefault: false } })
}
const tier = await prisma.partnerTier.update({ ... })   // sem transação
```

Falha entre as duas linhas e **nenhum tier é padrão** — o mesmo estado que o
comentário do POST chama de "onboarding de parceiros quebrado".

### A70 — um `GET` que escreve no banco

`GET /api/admin/partner-tiers` faz auto-seed: se falta o slug `starter`, ele
**cria**. Carregar a tela de admin tem efeito colateral.

E o seed engole erro:

```ts
try { await prisma.partnerTier.create({ data: tierDef }) }
catch { await prisma.partnerTier.create({ data: coreFields }) }
```

O `catch` sem filtro assume que a falha foi por `payoutSchedule`/`payoutDelayDays`
não existirem no schema. Se for outra coisa — corrida com outro admin, violação
de unicidade — a segunda tentativa roda mesmo assim.

O seed também discorda do banco: ele nasceria com `commissionRate: 0.50`, e o
`starter` real está com **0.6**.

### A71 — `commissionRate` e `minPrice` na rota pública

`/api/public/partner-tiers` não pede sessão e devolve `commissionRate` e
`minPrice` de todos os tiers ativos.

Não é vazamento acidental: é uma tabela de preços, e "você fica com 50%" é
argumento de venda. Registrado porque a régua comercial em rota aberta merece ser
uma decisão consciente, não um efeito de `select` amplo. **Mantido** — mas agora
com `select` explícito, para que campo novo no modelo não apareça sozinho na
landing.

### A72 — dois desvios de contrato, herdados

- As rotas de admin devolvem **401** para quem tem sessão e não é admin. Pelo D11
  isso é **403**: 401 é "não sei quem é você".
- `POST` e `PUT` devolvem o tier **cru**; o `GET` devolve `{ tiers }`. O cliente
  precisa saber de cor qual verbo embrulha.

## Decisões

### D71 — um helper de número, e ele vale para os cinco campos

Mesma resposta do D65: o problema não é `price` estar errado, é a validação ser
escrita campo a campo. Entra `numeroNaFaixa(valor, min, max)` ao lado do
`inteiroNaFaixa` da fatia 13, e **todos** os campos numéricos passam por um dos
dois.

`price` e `minPrice` ganham mínimo `0`: valor monetário negativo não tem
significado neste domínio, e aceitar o que não significa nada é como o `''` virar
`0` no A58.

### D72 — `isDefault` num caminho só, e transacional

POST e PUT passam a chamar o mesmo método. "Só um tier é padrão" é invariante de
tabela, e invariante mantida por dois trechos parecidos é invariante que vai
divergir — foi o D55 dos papéis e é isto de novo.

### D73 — o seed sai do `GET`

Listagem lista. O `starter` já existe no banco, então o seed não tem trabalho a
fazer hoje; num banco novo, ele passa a ser passo explícito de migração — mesma
categoria do `syncDefaults` de esportes, que roda por comando e não por leitura.

### D74 — 403 para admin, e `{ tier }` sempre

O guard global já separa 401 de 403 (D11). As respostas passam a embrulhar
sempre: `{ tier }`, `{ tiers }`, `{ requests }`.

**Isto muda o que a tela lê** — é a primeira vez nesta migração que o cutover não
é troca pura. Os consumidores do admin serão ajustados junto, e a mudança está
aqui registrada como deliberada.

## Plano de testes

**Unitários:**

- `'abc'`, `''`, `[]`, `{}` em **cada um** dos cinco campos numéricos → 400, com
  o controle de que valores válidos são aceitos e gravados
- `price: -1` e `minPrice: -1` → 400; `0` → aceito
- promover a padrão desmarca os outros **e** falha atômica não deixa a tabela sem
  padrão (D72)
- aprovar pedido move `tierId`, `partnerTier` e `commissionRate` juntos
- pedido já processado → 400; tier destino desativado → 400
- apagar tier com parceiro vinculado → 400, e com histórico → 400

**e2e contra Postgres real:**

- não-admin nas rotas de admin → **403**, pareado com admin → 200 (A55)
- a rota pública responde sem sessão, e devolve só os campos do `select`
- promover a padrão deixa exatamente **um** padrão na tabela — a invariante só é
  observável com banco de verdade
- aprovação concorrente do mesmo pedido: uma 200, outra 400
