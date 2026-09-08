# Fatia 18 — planos de treino (sem geração por IA)

**Estado:** spec.

## O recorte, e por que ele existe

`training-plans` são 6 rotas, ~1460 linhas. Uma delas — `POST
/training-plans` (670 das 757 linhas do maior arquivo) — é outra categoria
de risco e de teste: duas chamadas de IA em cascata (Groq → Gemini →
Ollama local), engenharia de prompt com contexto RAG (histórico de
aderência do atleta), e um algoritmo de rotação/periodização de exercícios
por cima da saída da IA. Depende de `canCreatePlan` (mesmo padrão
Partner/SaaS do D83/D87) e do `CreditsService.gastar()` (fatia 17, ainda
sem chamador).

**Josiel escolheu deixar a geração por IA de fora.** Entra tudo que é
determinístico; a criação de plano via IA vira fatia própria.

### Entra

| legado | verbo | o que faz |
|---|---|---|
| `training-plans` | GET | lista planos (trainer / atleta / aluno B2B / admin), paginada, busca por título |
| `training-plans/[id]` | GET | busca plano; bloqueia aluno B2B sem assinatura ativa do treinador |
| `training-plans/[id]` | PATCH | aprova/rejeita/entrega, edita finalPlan/trainerNotes; e-mail + notificação |
| `training-plans/[id]` | DELETE | apaga plano |
| `training-plans/active` | GET | planos ativos do atleta com progresso; reconecta Student órfão por e-mail; filtro B2B |
| `training-plans/[id]/sessions` | POST | treinador adiciona sessão manual |
| `training-plans/sessions/[id]` | GET/PATCH/PUT/DELETE | ver/marcar concluída+feedback/editar/apagar sessão |
| `training-plans/[id]/pdf` | GET | gera PDF do plano (`pdf-lib`), primeira rota do backend com resposta binária |

### Não entra (registrado, não corrigido)

- **`POST /training-plans`** (geração via IA) — fatia própria, com
  `canCreatePlan` e a ligação de `CreditsService.gastar()`.
- **`checkRateLimit('planCreate', ...)`** — só usado pela rota de fora do
  escopo; mesmo gap do A85 quando entrar.

## Decisões

### D90 — `EmailService` ganha dois métodos novos

`sendPlanApprovedEmail`/`sendPlanCompletedEmail` entram no `EmailService`
existente (D86), mesmo padrão: Resend, silencioso sem `RESEND_API_KEY`,
nunca lança.

### D91 — PDF é a primeira resposta binária do backend

Todas as rotas migradas até aqui devolvem JSON. `GET
/training-plans/[id]/pdf` devolve `application/pdf` como bytes crus — o
controller usa `@Res()` do Express por baixo do Nest para escrever a
resposta diretamente, em vez de retornar um objeto que o Nest serializa.
`pdf-lib` entra como dependência nova do backend (já existe em `apps/web`).
