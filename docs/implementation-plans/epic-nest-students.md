# Fatia 16 — alunos (students)

**Estado:** spec + testes vermelhos.

## O recorte, e por que ele existe

`students` e `training-plans` foram consideradas juntas no início. O
levantamento achou uma dependência real: a criação de plano via IA em
`training-plans/route.ts` (757 linhas, o maior arquivo do par) gasta créditos
(`spendCredits`, `lib/credits.ts`, 356 linhas) — um domínio próprio, inteiro
ainda no legado, usado também por `/api/credits`, admin e o webhook B2C.

**Josiel escolheu só `students` agora.** `training-plans` (leitura, edição,
sessões, PDF, e a rota de geração por IA com créditos) vira fatia própria
depois. Esta fatia lê `TrainingPlan` (para a tela de detalhe do aluno, D83
abaixo) mas não cria nem edita.

### Entra

| legado | verbo | o que faz |
|---|---|---|
| `students` | GET | lista alunos do treinador (admin vê de outros), paginada, busca por nome |
| `students` | POST | cria aluno virtual + perfil de atleta + convite por e-mail |
| `students/[id]` | GET | detalhe do aluno + planos de treino paginados (leitura) + progresso |
| `students/[id]` | DELETE | remove aluno da lista do treinador |
| `students/[id]/profile` | POST | cria/atualiza ficha de atleta (anamnese) por esporte |
| `students/invite` | POST | convida um **atleta registrado** (`TrainerAthlete`) — fluxo diferente do de aluno virtual |
| `students/[id]/invite` | POST | convida por e-mail um **aluno virtual** já criado |
| `students/invite/accept` | POST | aceita convite: vincula `userId`, faz merge de `AthleteProfile` |

~660 linhas legadas, 8 rotas.

### Não entra (registrado, não corrigido)

- **`training-plans`** — fatia própria, junto de `credits` se a geração por IA
  entrar no mesmo corte.
- **`checkRateLimit`** — mesmo gap do A85: `studentCreate` e `athleteInvite`
  não têm limitador equivalente no Nest ainda. Registrado para a fatia de
  infraestrutura compartilhada.
- **Fallback SaaS/B2C de `canAddAthlete`** — ver D83.

## Decisões

### D83 — `canAddAthlete` só o caminho Partner/B2B

O legado (`getEffectiveLimits`) tem duas fontes de limite: `PartnerTier`
(sistema vigente) e `SaaSTier` (sistema anterior, para treinador que assina a
plataforma direto, sem ser parceiro). Josiel confirmou: o SaaSTier é resíduo —
existia só porque o sistema de tiers ainda não tinha sido criado; hoje o
sistema de parceiro já cobre (e supera: limite, taxa, benefícios,
armazenamento) o que aquele fazia.

`PartnerTier.maxAthletes` é **opcional por desenho**, não por descuido: o
parceiro não paga taxa fixa, a receita da plataforma vem da comissão sobre o
que ele fatura em cima dos próprios alunos — limitar alunos limita a própria
receita. Por isso o padrão real é `null` (ilimitado), e o campo existe só como
opção disponível para um tier gratuito, se um dia fizer sentido.

Port: `PartnerAccount` do treinador, **qualquer status** (mesmo `pending` ou
`suspended` conta, como no legado), `tier?.maxAthletes ?? tierStarter.maxAthletes
?? null`. Sem `PartnerAccount` (treinador não é parceiro): bloqueado, sem
tentar replicar o sistema SaaS antigo — é o caminho legado que a direção
B2B-only do produto já não sustenta. Se isso afetar algum usuário real hoje,
é decisão de produto revisitar, não bug desta fatia.

### D84 — cooldown de reenvio de convite usa `updatedAt` direto

O legado (`[id]/invite/route.ts`) calcula "quando foi o último envio" como
`expiresAt - 7 dias` — um proxy, porque o campo `updatedAt` do
`AthleteInvite` não existia no client Prisma do legado quando essa rota foi
escrita (o schema atual, que o backend possui, já tem `updatedAt` — comentário
no schema confirma: "necessário para cooldown anti-spam"). O port usa
`updatedAt` direto: mesmo cooldown de 60s, sem aritmética derivada de outro
campo.

### D85 — falha ao notificar não derruba o convite

Em `[id]/invite/route.ts`, a notificação usa `prisma.notification.create`
direto, sem proteção — se essa escrita falhar, o `catch` externo da rota
devolve 500 **mesmo com o convite já criado e o e-mail já enviado**. Em
`students/route.ts`, a mesma notificação passa por `notify()`, que nunca
lança. Inconsistência real entre as duas rotas do mesmo domínio.

Port: sempre via `NotificationsService.criar()`, chamado com `.catch()` no
call site — mesmo padrão usado no resto do backend (D62: "aviso é
acessório").

### D86 — `EmailService` novo, porta fina

Nenhuma fatia anterior precisou enviar e-mail transacional. Port de
`lib/email.ts` (Resend) como serviço fino — mesmo padrão de `StripeService`
(D66): SDK instanciado preguiçoso, ausência de `RESEND_API_KEY` loga e
segue sem lançar (paridade com o legado, que já trata a chave ausente como
modo silencioso, não erro).
