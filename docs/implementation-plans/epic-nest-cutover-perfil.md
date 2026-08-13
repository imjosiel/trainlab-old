# Fatia 8 — Cutover de `/api/user/profile`

**Estado:** spec escrita, nada implementado.

Segundo cutover. O primeiro (notificações, fatia 7) provou a maquinaria: cookie → BFF → Bearer → guard → Prisma funciona com tela de verdade. Esta fatia gasta essa maquinaria no recurso onde a duplicação **já cobrou duas vezes**.

## Por que este recurso, e não o mais fácil

`sports` seria mais confortável — rota pública, só leitura, sem posse. Mas se der errado ninguém perde nada, e se der certo também não ganhamos muito.

`user/profile` é o caso que importa, porque a duplicação ali já custou trabalho dobrado **duas vezes documentadas**:

| defeito | onde apareceu | corrigido em |
|---|---|---|
| Vazamento de dado de saúde (D22) | perfil público | legado **e** Nest |
| Gamificação zerada por NULLS FIRST (A12/D29) | perfil próprio | legado **e** Nest |

Enquanto as duas implementações existirem, o terceiro defeito também cobra dobrado. A fatia 5 deixou o lado Nest pronto e coberto por **69 testes e2e contra Postgres real**; falta só religar a tela e apagar o legado.

## Estado atual — as duas implementações

```
tela ──> /api/user/profile          (legado, 275 linhas, app/api/user/profile/route.ts)
tela ──> /api/backend/users/profile (BFF ──> Nest, apps/backend/src/users/)
```

### Paridade da resposta: conferida campo a campo

**`GET` — `select` idêntico nos dois:**

`id`, `name`, `email`, `image`, `phone`, `roles`, `username`, `bio`, `isPublic`, `socialLinks`, `systemRoles`, `partnerAccount`, `_count`

`_count` é retirado do corpo nos dois e vira `stats.followers` / `stats.following` (D27). O corpo final é `{ …perfil, stats: { followers, following, completionRate, streak } }` nas duas implementações.

**`partnerAccount` — os mesmos 7 campos nos dois** (`PARTNER_ACCOUNT_SELECT` no legado, `OWN_PARTNER_ACCOUNT_SELECT` no Nest):

`status`, `stripeAccountStatus`, `payoutsEnabled`, `chargesEnabled`, `rejectionReason`, `approvedAt`, `createdAt`

Taxa de comissão negociada e alavancas internas ficam fora dos dois (A11/D26).

**`PATCH` — `select` idêntico nos dois**, sete campos:

`id`, `name`, `phone`, `username`, `bio`, `isPublic`, `roles`

Isso não é coincidência: a fatia 5 alinhou os dois de propósito, com paridade de comportamento como critério. **O cutover é troca de URL, não mudança de contrato.**

### A única diferença textual

| | legado | depois do cutover |
|---|---|---|
| 401 | `{"error":"Não autorizado."}` | `{"error":"Não autorizado"}` (BFF) |
| 500 | `{"error":"Erro interno."}` | contrato do `ErrorContractFilter` |

Diferença de **ponto final**. Aceita — ver D50 para por que isso não é visível a nenhum consumidor.

Mensagens de 400 e 409, que os consumidores *podem* exibir, são **idênticas**: `Telefone inválido. Informe DDD + número (10 ou 11 dígitos).` e `Este @username já está em uso por outra pessoa.`

## Os consumidores — 3 arquivos, 5 chamadas

### 1. `app/[locale]/dashboard/profile/page.js` — a tela de perfil

`GET` (linha 107) e `PATCH` (linha 139). O único consumidor que usa a rota "de verdade": lê `name`, `username`, `bio`, `isPublic`, `roles[0]`, `phone` e envia os seis campos de volta.

### 2. `app/[locale]/partner/apply/page.js` — candidatura pública (214 linhas)

`GET` (linha 30) só para pré-preencher o telefone: `if (d?.phone) setPhone(d.phone)`. Ignora o resto.
`PATCH` (linha 49) grava só `{ phone }` antes de chamar `/api/partner/apply`.

### 3. `app/[locale]/dashboard/partner/apply/page.js` — candidatura no dashboard (353 linhas)

`GET` (linha 50), lendo **só** `data.partnerAccount`. O comentário na linha 48 é honesto sobre o motivo:

> "Vamos simular a busca pelo status direto do banco de dados chamando uma rota de profile segura"

Usa o perfil como atalho para o estado da candidatura. Funciona, mas amarra a tela de parceiro ao contrato do perfil.

---

## A35 — as duas telas `partner/apply` não são duplicatas

Levantei a suspeita antes de investigar: dois caminhos (`/partner/apply` e `/dashboard/partner/apply`) chamando a mesma rota cheirava a tela duplicada, dado o histórico desta sessão.

**Não são.** 214 vs 353 linhas, conteúdo diferente, propósitos diferentes: uma é a candidatura pública (pede telefone + aceite, chama `/api/partner/apply`), a outra é o acompanhamento dentro do dashboard (mostra o estado da candidatura existente).

Registro porque a suspeita era razoável e a resposta é "está certo" — e porque a próxima pessoa a olhar isso vai desconfiar do mesmo jeito.

## A36 — a tela de perfil mostra JSON cru no toast de erro

`dashboard/profile/page.js`, linhas 145-148:

```js
if (!response.ok) {
    const errorText = await response.text()
    throw new Error(errorText || 'Erro ao atualizar perfil')
}
```

`response.text()` num corpo `{"error":"…"}` devolve **a string JSON inteira**. O usuário que tenta um @username tomado vê:

```
{"error":"Este @username já está em uso por outra pessoa."}
```

Chaves, aspas e a chave `error` incluídas. A mensagem existe e é boa — só está embrulhada.

Isso é anterior ao cutover e independente dele (o corpo de erro é idêntico nas duas implementações). Mas fica **mais** relevante agora: é a única tela que exibe erro do perfil, e vou tocar exatamente nessas linhas para trocar a URL. Corrigir junto custa três linhas.

## A37 — `dashboard/partner/apply` lê o corpo sem checar o status

Linhas 50-55:

```js
const res  = await fetch('/api/user/profile')
const data = await res.json()          // sem checar res.ok
if (data.partnerAccount) { … }
```

Num 401 ou 500, `data` é `{ error: … }`, `data.partnerAccount` é `undefined`, o `if` não entra e a tela mostra o estado "sem candidatura" — que é indistinguível de "candidatura não existe". Falha silenciosa que **mente** para o usuário: quem tem candidatura aprovada e pega um 401 vê a tela de quem nunca aplicou.

Não é causado pelo cutover, mas o cutover troca a origem da resposta, então o risco de um 401 novo passa por aqui.

## A38 — o PATCH do Nest **não** reabriu a porta do A22 (verificado)

O A22 (fatia 6) achou um caminho que promove usuário a admin quando não existe nenhum admin — o "Safety First Admin", documentado e intencional. Como o `PATCH` de perfil escreve `roles`, precisei confirmar que o Nest não criou uma segunda porta.

**Não criou:**

- `resolverPapeis` rejeita qualquer coisa fora de `PAPEIS_ESCOLHIVEIS = ['PENDING','TRAINER','ATHLETE','STUDENT']` — devolve `undefined` e nada é escrito.
- `systemRoles` aparece no código do perfil próprio em **dois lugares**: no `select` do `GET` (leitura) e num comentário. **Nunca** em escrita.
- A allowlist de entrada é por nome de campo, não spread: `systemRoles: ['ADMIN']` no corpo não tem efeito nenhum.

Achado positivo, mas registrado com o mesmo peso de um negativo: é a resposta a uma pergunta de segurança que eu tinha obrigação de fazer, e a próxima pessoa não deveria precisar refazê-la.

---

## Decisões

### D50 — a diferença de ponto final é aceita, não corrigida

`'Não autorizado.'` vira `'Não autorizado'`. Não vou mexer, por dois motivos:

1. **Nenhum consumidor exibe essa mensagem.** `partner/apply` faz `r.ok ? r.json() : null` (descarta); `dashboard/partner/apply` só lê `.partnerAccount`; `dashboard/profile` exibe — mas via A36, que já mostra JSON cru, então o ponto final é o menor dos problemas ali.
2. A mensagem do BFF é **compartilhada** por todas as rotas do Nest. Mudar para agradar o perfil quebraria a uniformidade que o `ErrorContractFilter` garante.

### D51 — corrigir o A36 na mesma fatia; não corrigir o A37

O A36 mora **nas linhas que vou editar** para trocar a URL do `PATCH`. Deixar JSON cru num toast que estou tocando é escolher não consertar. Custa trocar `response.text()` por ler `error` do JSON.

O A37 mora numa tela que só lê `partnerAccount`, e a correção certa é maior que "checar `res.ok`": aquela tela não deveria buscar estado de parceiro pela rota de perfil. Corrigir a checagem esconderia o acoplamento; corrigir o acoplamento é outra fatia. **Registrado, não tocado.**

### D52 — o `_count` continua saindo do corpo

Confirmado por grep nos três consumidores: nenhum lê `_count`. Os mesmos dois números chegam em `stats`. Mantido como está nas duas implementações (D27).

### D53 — apagar a rota legada nesta fatia, não na seguinte

Na fatia 7 apaguei a rota legada no mesmo passo e funcionou. Manter a rota morta "por segurança" só cria a ilusão de rollback: com a tela apontada para o BFF, a rota legada não é caminho de volta, é código não exercitado.

Ressalva conhecida: enquanto o catch-all de MongoDB existir, a rota apagada responde **500**, não 404 (A23). Vira 404 quando aquela tarefa terminar.

---

## Propriedades a provar

1. `GET /api/backend/users/profile` com cookie de sessão devolve **200** e o corpo tem os 12 campos + `stats` com quatro chaves.
2. O corpo do `GET` é **campo a campo igual** ao da rota legada para o mesmo usuário — comparado por diff de JSON, não por inspeção visual.
3. `partnerAccount` traz os 7 campos e **nenhum** dos internos (taxa negociada, alavancas de moderação).
4. `PATCH` com os seis campos aceitos devolve **200** e os **sete** campos de `PATCH_PROFILE_SELECT`.
5. `PATCH` com `systemRoles: ['ADMIN']` no corpo devolve 200 e **não** altera `systemRoles` no banco.
6. `PATCH` com `role` fora da lista devolve **200** sem alterar `roles` (D30 preservado).
7. `PATCH` com @username tomado devolve **409** com `Este @username já está em uso por outra pessoa.`
8. A tela de perfil carrega, salva e mostra o valor salvo depois de recarregar.
9. A tela de perfil, num erro de @username, mostra **a mensagem** — não JSON cru (A36 corrigido).
10. As duas telas `partner/apply` seguem funcionando: telefone pré-preenchido numa, estado da candidatura na outra.
11. Nenhuma requisição para `/api/user/profile` na aba de rede.
12. Nenhuma referência a `/api/user/profile` no código fora de menções históricas.

## Verificação — feita

### Propriedades 1-3: o diff, rodado enquanto as duas rotas existiam

```
camposLegado: [bio, email, id, image, isPublic, name, partnerAccount,
               phone, roles, socialLinks, stats, systemRoles, username]
camposNest:   [idem, 13 campos]
chavesDeStats: [completionRate, followers, following, streak]
IDENTICOS: true
diferencas: []
```

**Zero diferenças** em 13 campos. O diff normaliza ordem de chaves recursivamente, então "idêntico" não é artefato de serialização. Precondição do A15 embutida: aborta antes de comparar conteúdo se alguma rota não devolver 200.

### A39 — a primeira rodada do diff provou menos do que parecia

A primeira execução saiu com `IDENTICOS: true` e **`camposDePartnerAccount: null`** — o usuário semeado não tinha candidatura. `null === null` nos dois lados não diz nada sobre a propriedade 3, que é justamente a que protege a taxa de comissão.

Semeei um `PartnerAccount` com **valores-sentinela** nas 14 alavancas internas (`commissionRate: 0.87`, `customCommissionRate: 0.93`, `stripeAccountId: 'acct_SENTINELA_STRIPE'`, `motivation`, `approvedById`, `payoutsFrozen`, `minimumPayoutAmount: 999777`, `allowTestMode`, …) e rodei de novo:

```
camposDePartnerAccount: [approvedAt, chargesEnabled, createdAt,
                         payoutsEnabled, rejectionReason, status, stripeAccountStatus]
ocorrencias de sentinela no corpo: 0
```

Sete campos, exatamente a allowlist. **Nenhuma sentinela escapou.** A ideia de valor-sentinela é o que transforma "não vi nada estranho" em "um vazamento teria se anunciado".

### Propriedades 4-7: `PATCH` pelo BFF

| propriedade | resultado |
|---|---|
| 4 · seis campos aceitos | **200**, os sete campos de `PATCH_PROFILE_SELECT`, telefone normalizado para `(11) 98888-7777` |
| 5 · `systemRoles` no corpo | **200**, `systemRoles` intacto |
| 6 · papel fora da lista (`PARTNER_B2B`) | **200**, `roles` inalterado (D30 preservado) |
| 7 · @username tomado | **409** com `Este @username já está em uso por outra pessoa.` |

### A40 — a propriedade 5 passou por vacuidade na primeira tentativa

O teste reportou `ok: true` com **`systemRolesAntes: ["ADMIN"]`**. O usuário semeado já é admin. Tentar setar `['ADMIN']` num usuário que já é `['ADMIN']` e concluir "não escalou" **não prova nada** — `["ADMIN"] === ["ADMIN"]` seria verdade com ou sem a allowlist funcionando.

Refeito com usuário partindo de `systemRoles: ['USER']`, mandando os três vetores de uma vez:

```json
{ "systemRoles": ["ADMIN"], "roles": ["ADMIN"], "isAdmin": true, "bio": "tentei escalar" }
```

```
status: 200
systemRolesDepois: ["USER"]     ← não escalou
rolesDepois: ["ATHLETE"]        ← `roles` plural não está na allowlist
bioMudou: true                  ← O PATCH RODOU DE VERDADE
systemRolesNoCorpoDaResposta: false
```

A linha que salva o teste de ser vacuidade é a `bioMudou`. Sem ela, "nada mudou" seria compatível com "o PATCH nem executou".

**Terceira vez nesta sessão** que uma asserção positiva passou sem provar o que dizia (A15 nos scripts da fatia 5, o mock trocado nos testes de Pusher, e agora esta). O padrão comum: **o estado inicial já satisfazia a asserção.** A defesa é sempre a mesma — incluir no teste algo que *tem* que mudar.

### Telas, no navegador

| tela | resultado |
|---|---|
| `/dashboard/profile` | carrega pelo BFF, mostra `Josiel Cutover` / `cutover_perfil` |
| `/dashboard/partner/apply` | reconhece a candidatura aprovada, **zero sentinela no texto da página** |
| `/partner/apply` | telefone pré-preenchido `(11) 98888-7777` |

Nas três: **zero requisições** para `/api/user/profile`.

**A36 corrigido e provado na tela:** com o @username tomado, o toast mostra

```
Este @username já está em uso por outra pessoa.
```

Antes mostraria `{"error":"Este @username já está em uso por outra pessoa."}`, chaves incluídas.

### Suítes e builds

`tsc` limpo nos dois apps, `next build` e `nest build` exit 0, **208 unit + 148 e2e** (backend), **218 Jest + 65 Vitest** (web). Banco limpo ao final.

Jest caiu de 300 para 218: os **82** testes da rota legada saíram com ela. O comportamento que cobriam está nos 69 e2e do Nest, contra Postgres real.

### A41 — a interação da tela custou quatro tentativas, e a razão é instrutiva

Para provar o A36 precisei disparar um 409 pela interface. Errei o botão três vezes:

1. O `[role="dialog"]` que encontrei era o **banner de cookies**, não o modal do perfil — ele reaparece em sessão nova e fica por cima. Dispensei escolhendo "Apenas Essenciais".
2. Depois disso, o último botão do modal era o **"Close"**, não o de salvar.
3. O botão certo é `Salvar Perfil`, `type="submit"`.

O sintoma que me disse que eu estava errando: **o contador de requisições não subia**. Toast vazio pode ser timing; requisição que não sai é prova de que o clique não fez nada. Medir a requisição em vez de olhar a tela foi o que evitou eu concluir "o toast não aparece" e sair procurando bug onde não havia.

## Riscos

**A tela de perfil é a mais complexa dos três consumidores** — tem `GET`, `PATCH`, formulário controlado e atualização de sessão do NextAuth quando o papel muda (linha 153). O cutover não muda nenhuma dessas mecânicas, mas é a tela onde uma quebra é mais visível.

**Dois `PATCH` de telefone em fluxos diferentes.** `partner/apply` grava `{ phone }` isolado e **não checa a resposta** — se o `PATCH` falhar, a candidatura segue sem o telefone salvo. Existe hoje; o cutover não piora, mas está aqui porque é onde eu olharia primeiro se algo estranho aparecer na candidatura depois desta fatia.
