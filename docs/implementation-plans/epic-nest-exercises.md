# Fatia 23 — biblioteca de exercícios

**Estado:** backend feito e verde. Cutover ainda não.

## O recorte

3 arquivos, 5 verbos: listar/criar, buscar/editar/apagar por id, e um PDF
("cheat sheet") gerado na hora. Pré-requisito registrado desde a fatia 18
pra geração de plano por IA (que lê `Exercise.aiSummary` nos prompts) — mas
essa parte específica fica de fora, ver abaixo.

### Entra

| legado | verbo | o que faz |
|---|---|---|
| `exercises` | GET | lista paginada, filtro por categoria/busca/lista de ids (polling) |
| `exercises` | POST | cria; dispara GH Actions (processamento de vídeo R2) se for upload R2 |
| `exercises/[id]` | GET | busca um; libera pra dono, exercício global, admin, ou aluno com plano do treinador dono |
| `exercises/[id]` | PUT | edita; só o dono |
| `exercises/[id]` | DELETE | apaga + limpa arquivos R2 do vídeo (dono ou admin) |
| `exercises/[id]/pdf` | GET | gera o cheat sheet em PDF na hora (`pdf-lib`, mesmo padrão da fatia 18) |

~500 linhas legadas.

### Não entra

- **`generateAndSaveAiSummary`** (`lib/exercise-ai-summary.ts`, fire-and-forget
  no POST e no PUT quando a descrição muda) — chama Groq (`GROQ_API_KEY`)
  com fallback Gemini (`GEMINI_API_KEY`). **Nenhuma das duas chaves está em
  `apps/backend/.env`** (nem em `apps/web/.env`, que só tem placeholder
  vazio) — mesma categoria de trabalho, mesma lacuna de infra, que a geração
  de plano por IA já registrada como fatia própria desde a 18. Exercício
  criado/editado pelo Nest fica sem `aiSummary` até essa fatia chegar —
  aceitável porque o campo é opcional e hoje não tem nenhum consumidor (a
  geração de plano por IA que o lê também não existe ainda).
- **`checkRateLimit('exerciseCreate', ...)`** — mesmo gap do A85, política já
  estabelecida.
- **Limpeza de imagens inline do TipTap** (`exercise-images/{userId}/...`)
  — o próprio legado já não implementa isso, só loga um aviso. Nada a portar.

## Decisões

### D99 — GH Actions trigger e limpeza R2 entram, IA fica de fora

Diferente da IA, o disparo do GH Actions (`triggerGHActions`) e a limpeza de
arquivo no R2 (`deleteR2Files`) não dependem de chave nova nenhuma além do
que **já é** infraestrutura central do produto (armazenamento de vídeo) —
`GITHUB_ACTIONS_TOKEN`/`R2_*` também não estão em `apps/backend/.env` ainda,
mas a diferença é de categoria: isso é a própria feature de upload de vídeo
funcionando (ou não), não uma chamada de LLM acessória. Portado como porta
nova (`ExerciseStorageService`, mesmo espírito do `StripeService` — SDK só
mockado nos testes do domínio, nunca testado direto). Local ao módulo de
exercises por enquanto: quando a fatia de `upload/*` chegar e precisar do
mesmo cliente R2, aí sim vira compartilhado — generalizar antes do segundo
chamador real é o erro que os D95/D97 evitaram.

### D100 — 401 do legado em GET/POST vira 403 quando quem falta é o PAPEL

Mesmo critério do D96 (fatia 21): GET/POST devolvem 401 pra quem não é
`PROFESSIONAL` nem admin, mas 401 é do guard global (falta de sessão), não
de papel. Sessão ausente segue 401 pelo guard; papel errado vira 403.

### Gate de assinatura em POST/PUT — portado como está

`isApprovedPartner OU session.subscriptionStatus em {active, trialing,
past_due, canceling}` é o mesmo dual-check que outras fatias já viram
(sistema SaaS/B2C legado ainda alcançável via `session.subscriptionStatus`
do JWT, ao lado do caminho B2B). Não é o D92 sendo revertido — D92 é sobre
não CONSULTAR `User.subscription` no banco; aqui o dado já vem pronto no
JWT, mesma fonte que outras fatias já leem. Paridade comportamental, sem
julgamento de produto novo nesta fatia.

### A88 — `PUT /exercises/[id]` era o único endpoint sem bypass de admin

Achado ao portar, não hipótese: comparando os 5 handlers, só o `PUT` exige
`ROLES.PROFESSIONAL` sem alternativa pra admin (no gate de papel **e** na
checagem de dono), enquanto GET/POST/DELETE já tratam `isAdmin` como
suficiente. O próprio `DELETE` documenta essa exata classe de bug como
BUG-73 ("inconsistente com todos os outros endpoints — admins recebiam 401
tentando remover exercício inadequado") e já foi corrigido lá. `PUT` nunca
recebeu a mesma correção. Corrigido no port: admin edita qualquer exercício,
igual já podia apagar.

## Suítes finais

Backend: **934** unitários (+66 desta fatia, mutação verificada em 4
pontos: bypass de admin no gate de papel do A88, bypass de admin na
checagem de dono do A88, branch de upload R2 vs. cloudinary no `criar`, e
o guard de provider+chave na limpeza do R2 no `remover` — este último só
discriminou depois de eu perceber que meu primeiro teste não cobria
"cloudinary com originalVideoKey preenchido", o cenário que a checagem de
provider existe pra excluir). `tsc` limpo — inclusive um caso em que a
própria checagem de tipos rejeitou uma mutação (`originalVideoKey` deixa
de ser garantido não-nulo sem o `&&`), verificação mais forte que teste.

### Pendência de ambiente

`GITHUB_ACTIONS_TOKEN`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`,
`R2_SECRET_ACCESS_KEY` e `R2_BUCKET_NAME` não estão em
`apps/backend/.env` ainda — o `ExerciseStorageService` funciona (é
preguiçoso, só monta o client SDK/token na hora de usar), mas o disparo do
GH Actions e a limpeza de vídeo no R2 não foram verificados ao vivo. Copiar
de `apps/web/.env` (ou de onde quer que estejam guardados hoje) quando for
testar o upload/delete de exercício com vídeo de verdade.
