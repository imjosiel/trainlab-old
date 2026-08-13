# Epic: Backend NestJS — Fatia 4: perfil público, e o vazamento de dado de saúde

Quarta fatia. As três anteriores cobriram os eixos de autorização: **sessão** (401), **papel** (403) e **posse** (404). Esta cobre o quarto, que não é sobre quem lê — é sobre **o que sai**: modelagem de exposição.

E ela existe porque, ao ler o recurso antes de desenhar, apareceu um vazamento real.

---

## O achado (A9) — anamnese médica exposta sem autenticação

`GET /api/users/public/:username` é público por projeto. O `select` no `User` é cuidadoso e **não** expõe email. Mas a relação aninhada usa `include`:

```ts
athleteProfiles: {
  include: {
    sport: { select: { name: true, slug: true } },
    teams: { select: { name: true } },
  },
}
```

`include` traz **todos** os campos do `AthleteProfile` — e é lá que mora a anamnese.

### Medido, não deduzido

Fixture com anamnese preenchida, e um `curl` **sem cookie, sem header, sem nada**:

```
status=200 — 28 campos do perfil no corpo
  injuryHistory    = "Ruptura de LCA em 2022, cirurgia no joelho direito"
  currentInjuries  = "Tendinite no ombro esquerdo"
  healthIssuesDesc = "Asma induzida por exercicio"
  medicationDesc   = "Salbutamol 100mcg antes do treino"
  dateOfBirth      = "1995-03-14T00:00:00.000Z"
  height           = 178
  weight           = 74
```

Também sai `hasHealthIssues`, `takesMedication`, `goals`, `strengths`, `weaknesses` e o `userId` interno.

### Por que é pior do que parece

- **`isPublic` tem default `true`** no schema. Não é opt-in.
- **O `username` é gerado automaticamente** do nome no primeiro login (`lib/auth.ts`, evento `createUser`). Então o endereço do perfil é adivinhável a partir do nome da pessoa.
- É **dado de saúde**. O próprio schema tem `termsAcceptedAt`/`privacyAcceptedAt` — o produto sabe que trata dado sensível sob LGPD.
- O cuidado existia e foi desfeito um nível abaixo: quem escreveu o `select` do `User` pensou em exposição; o `include` da relação apagou esse pensamento sem aviso.

**Lição que generaliza, e é o motivo desta fatia existir como eixo próprio**: `include` é allowlist de *relação*, não de *campo*. Num modelo que mistura dado público e dado sensível na mesma tabela, `include` numa rota pública é sempre suspeito. `select` explícito é a única forma que falha fechado — campo novo no schema não entra na resposta por acidente.

### Alcance

Neste banco local não há usuário real (0 usuários; o dado acima é fixture, já removida). O código, porém, é o mesmo que roda no deploy do produto original — lá é exposição viva. Aqui é um defeito que seria **herdado** se a rota fosse portada fielmente.

---

## A10 — a migration carregou um drift antigo, e ele era um passo prometido e nunca feito

`prisma migrate dev` gerou, junto da mudança pedida, uma linha não solicitada:

```sql
ALTER TABLE "AffiliateEarning" ALTER COLUMN "updatedAt" DROP DEFAULT;
```

A origem está em `20260706171746_add_affiliate_earning_updated_at`, cujo comentário diz:

> *"Primeiro adiciona a coluna com um default temporário, depois remove o default."*

O SQL dessa migration tem **só o `ADD`**. O "depois remove o default" nunca foi escrito. O default temporário ficou no banco desde julho, e o Prisma vinha reportando essa diferença como drift em toda migration posterior — sem ninguém notar, porque `@updatedAt` é preenchido pelo client, então nada quebrava.

**Mantido**, porque completa a intenção documentada e alinha banco com schema. Registrado aqui porque o nome da migration (`is_public_default_false`) não anuncia essa segunda mudança, e quem ler o histórico depois merece saber por que ela está ali.

**Lição**: comentário de migration que descreve dois passos e SQL que executa um é indistinguível de migration correta até alguém rodar `migrate dev` e ver o drift aparecer. O comentário não é executável — se o passo importa, ele precisa estar no SQL.

---

## Decisões

### D20 — Vazamento não é comportamento a preservar

Todas as fatias anteriores portaram peculiaridade fielmente e registraram em vez de "consertar" (A1 do MODERATOR, A4 dos limites de slug). **Esta não segue essa regra, e a distinção é clara**: aquelas são regras de negócio em disputa, onde mudar exige decisão de produto e pode trancar alguém fora. Esta é dado de saúde saindo para quem não deveria ver — não há leitura em que o comportamento atual seja o desejado.

Consequência: a fatia tem duas frentes, e **a rota legada também é corrigida** (ver D22). Não dá para deixar a exposição viva pelo tempo que o cutover levar.

### D21 — O que sai é allowlist explícita, nunca `include`

Decisão de produto tomada por Josiel: **recorte mínimo**.

| Do `User` | Do `AthleteProfile` |
|---|---|
| `name`, `username`, `image`, `bio`, `roles`, `createdAt` | `sport` (nome e slug), `position`, `technicalLevel`, `yearsPlaying`, `teams` (nome) |

Fora, deliberadamente:

- **Anamnese**: `injuryHistory`, `currentInjuries`, `hasHealthIssues`, `healthIssuesDesc`, `takesMedication`, `medicationDesc`.
- **Dados corporais**: `dateOfBirth`, `height`, `weight`, `dominantFoot`.
- **Anotações de treino**: `goals`, `strengths`, `weaknesses`, `trainingFocus`, `trainingDaysPerWeek`, `trainingHoursPerDay`.
- **Internos**: `id` do usuário, `userId`/`studentId` do perfil, `email`, `isPublic`, `acceptedTerms`.

`id` do usuário sai da resposta porque nada no perfil público precisa dele — a página é endereçada por `username`. Expor id interno só amplia superfície.

### D22 — A rota legada é corrigida junto, com o mesmo recorte

Mesma allowlist aplicada em `app/api/users/public/[username]/route.ts`. As duas implementações passam a concordar, então o cutover depois não muda nada observável.

### D23 — `isPublic` passa a ter default `false`

Decisão de Josiel: fechar por padrão. Perfil público deixa de ser algo que acontece com a pessoa e passa a ser algo que ela liga.

**Linhas existentes preservam o valor atual** (`true` para quem já existe). Motivo: depois do D21, um perfil público expõe só identidade e esporte — benigno. Virar todas para `false` desligaria em silêncio um perfil que alguém pode estar usando e divulgando, e isso é dano sem ganho de privacidade correspondente. O default cobre o futuro; o recorte de campos cobre o passado.

Fica registrado como decisão separada, caso Josiel queira também fechar as existentes: é um `UPDATE` de uma linha de SQL, mas é escolha de produto, não de segurança.

### D24 — 404 para "não existe" e para "não é público", indistinguíveis

Preservado do legado, e é o mesmo raciocínio do D16 (posse) uma fatia atrás: 403 em perfil privado confirmaria que o `@username` existe. Com 404 nos dois casos, o endpoint não vira oráculo de existência de conta — o que importa porque `username` é derivado do nome real.

### D25 — Busca por `username` continua case-insensitive

`mode: 'insensitive'`, como no legado. `@Josiel` e `@josiel` são a mesma pessoa, e o link compartilhado não deve depender de capitalização.

---

## Propriedades a provar por teste

**Exposição (D21) — o núcleo:**
1. A resposta **não contém nenhum** campo de anamnese, dado corporal ou anotação de treino. Afirmado por lista negra explícita, não por igualdade de objeto — para que campo novo no schema não passe calado.
2. A resposta contém os campos do recorte acordado.
3. Nem `email` nem `id` do usuário aparecem.
4. Nem `userId` nem `studentId` do perfil aparecem.
5. O perfil traz `sport` (nome e slug) e `teams` (nome), sem outros campos dessas relações.

**Visibilidade (D23/D24):**
6. `isPublic: false` → 404.
7. `username` inexistente → 404, com o **mesmo** corpo do caso anterior.
8. Usuário sem nenhum `athleteProfile` → 200 com lista vazia, não erro.

**Busca (D25):**
9. Casa `username` ignorando capitalização.
10. `username` com caractere percent-encoded é decodificado.

**Schema (D23):**
11. Usuário criado sem informar `isPublic` nasce `false`.

**Paridade entre as duas implementações (D22):**
12. Para o mesmo usuário, o corpo do Nest e o da rota legada corrigida têm as mesmas chaves.

---

## Verificação

- Suítes + builds com exit code conferido separado do pipe.
- Execução real com um usuário que **tem anamnese completa gravada**, provando por `curl` sem credencial que nem o Nest nem a rota legada corrigida devolvem campo médico. Testar com o perfil vazio não prova nada — o vazamento só aparece quando existe dado para vazar.

### Mutação: o `select` da relação de volta para `include`

Reintroduzir o `include` derruba **4 dos 76** e2e — exatamente os de exposição. O e2e é o que prova, não o unitário: mock ignora `select`, então com Prisma mockado quem "filtra" é a fixture.

### Duas lições sobre os próprios testes, descobertas fazendo esta fatia

**1. Asserção negativa não pega vulnerabilidade cujo mecanismo é omissão.** Os 20 casos de `it.each(PROIBIDOS)` — "o select não menciona `injuryHistory`" — **passavam contra o código vulnerável**. Com `include`, os campos vêm sem serem nomeados, então a asserção é trivialmente verdadeira. Quem reprova o `include` são as asserções **positivas**: exigir que exista um `select` explícito e conferir as chaves exatas. Os negativos ficam só como guarda contra alguém acrescentar um campo sensível de propósito.

**2. `jest.mock('@/lib/prisma')` puro devolveu o automock do módulo real**, um objeto com só `$connect`/`$disconnect`/`$transaction`/`$extends` e **nenhum modelo** — porque em `PrismaClient` os modelos são getters de protótipo, que o automock não enxerga. Agrava: existem **dois** mocks manuais no repo, com formatos diferentes (`__mocks__/lib/prisma.js`, completo, e `lib/__mocks__/prisma.js`, parcial), e qual se aplica não é óbvio. Resolvido com factory explícita.

### Provado ao vivo (usuário com anamnese sentinela, sem nenhuma credencial)

| Rota | Resultado |
|---|---|
| `GET /api/backend/users/public/:username` (Nest via BFF) | 200, **nada sensível** |
| `GET /api/users/public/:username` (legada corrigida) | 200, **nada sensível** |
| `GET :3001/users/public/:username` (Nest direto) | 200, **nada sensível** |
| Perfil privado, nas duas rotas | 404 `'Usuário não encontrado.'` |
| Username inexistente, nas duas rotas | 404 — **corpo idêntico ao privado** |

**Paridade conferida campo a campo** (propriedade 12): as chaves do Nest e da rota legada corrigida são exatamente as mesmas, no nível do usuário e no do perfil. O cutover depois não muda nada observável.

**E o dado continua no banco** — conferido por consulta direta: `medicationDesc`, `injuryHistory`, `healthIssuesDesc`, altura e peso seguem gravados. O que mudou é só o que sai.

`isPublic` de usuário criado sem informar o campo: **`false`**, confirmado contra o banco.

e2e rodado duas vezes seguidas, 76/76 nas duas. Banco conferido no fim: 0 usuários, 0 perfis, 14 esportes.

**Fora de escopo:** nenhuma tela é religada; `/user/profile` (onde `isPublic` é alternado) não é migrado nesta fatia — o controle continua existindo na rota legada, então o default `false` não deixa ninguém sem como abrir o perfil.
