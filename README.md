# ⚽ Player.Action — SaaS de Treinos de Futebol com IA

Plataforma SaaS que usa Inteligência Artificial para criar planos de treino personalizados de futebol.  
Treinadores geram planos via IA, revisam, aprovam e acompanham a evolução de cada atleta em tempo real.

---

## 🚀 Stack Tecnológica

| Camada | Tecnologia |
|---|---|
| Framework | Next.js 14 (App Router) |
| Banco de Dados | PostgreSQL via Prisma |
| Autenticação | NextAuth.js (Google OAuth) |
| IA | GROQ API (Llama 3) |
| Pagamentos | Stripe Subscriptions |
| Email | Resend |
| PDF | pdf-lib |
| UI | TailwindCSS + shadcn/ui + Recharts |

---

## ✨ Funcionalidades

### Para Treinadores
- Gerenciar atletas com perfis completos
- Gerar planos de treino personalizados via IA (GROQ)
- Revisar, editar e aprovar planos antes de entregar ao atleta
- Adicionar/remover sessões individuais manualmente
- Incluir observações visíveis ao atleta
- Download do plano em PDF
- Dashboard com gráfico de planos criados nos últimos 30 dias
- Convidar atletas via email (link mágico)
- Receber email automático quando atleta conclui o plano

### Para Atletas
- Perfil de anamnese futebolística completo (posição, nível, lesões, objetivos)
- Receber planos personalizados aprovados pelo treinador
- Acompanhar progresso em `/dashboard/my-plan`
- Marcar sessões como concluídas e adicionar feedback por sessão
- Barra de progresso geral (X de Y sessões)
- Download do plano em PDF
- Receber email quando o plano for aprovado
- Ver observações do treinador
- Dashboard com card de progresso do plano ativo

---

## 📋 Pré-requisitos

- Node.js 18+
- PostgreSQL
- Conta Google (OAuth)
- Conta Stripe
- API Key GROQ
- Conta Resend (opcional — emails ignorados silenciosamente se ausente)

---

## 🔧 Instalação

```bash
git clone https://github.com/imjosiel/player-action-saas.git
cd player-action-saas
npm install
```

Configure as variáveis de ambiente:

```env
# Database
DATABASE_URL="postgresql://..."

# NextAuth
NEXTAUTH_SECRET="your-secret-here"
NEXTAUTH_URL="http://localhost:3000"

# Google OAuth
GOOGLE_CLIENT_ID="your-client-id"
GOOGLE_CLIENT_SECRET="your-client-secret"

# GROQ AI
GROQ_API_KEY="your-groq-key"

# Stripe
STRIPE_SECRET_KEY="sk_test_..."
NEXT_PUBLIC_STRIPE_KEY="pk_test_..."
STRIPE_WEBHOOK_SECRET="whsec_..."  # Endpoint único — inclui os eventos do Stripe Connect
STRIPE_PRICE_ID_BASE="price_..."
STRIPE_PRICE_ID_PREMIUM="price_..."

# Resend (opcional — emails silenciosos se ausente)
RESEND_API_KEY="re_..."
```

Execute as migrations:

```bash
npx prisma generate
npx prisma db push
```

Inicie o servidor:

```bash
npm run dev
```

Acesse: `http://localhost:3000`

---

## 💳 Configuração do Stripe

1. Crie 2 produtos em `dashboard.stripe.com/test/products`:
   - **Player.Action Base** — R$ 97/mês
   - **Player.Action Premium** — R$ 197/mês
2. Copie os Price IDs para o `.env`
3. Configure webhook em `dashboard.stripe.com/test/webhooks`:
   - Endpoint: `https://seu-dominio.com/api/stripe/webhook`
   - Eventos: `checkout.session.completed`, `customer.subscription.*`, `invoice.payment_*`

---

## 🗄️ Banco de Dados

### Modelos Principais

| Modelo | Descrição |
|---|---|
| `User` | Usuários com roles `TRAINER` / `ATHLETE` / `BOTH` |
| `AthleteProfile` | Anamnese: posição, nível, objetivos, lesões |
| `TrainerAthlete` | Relação treinador ↔ atleta |
| `TrainingPlan` | Plano com workflow `PENDING → APPROVED → COMPLETED` |
| `TrainingSession` | Sessão individual com progresso do atleta |
| `AthleteInvite` | Token de convite com expiração de 7 dias |

---

## 🔌 APIs

### Autenticação
- `GET/POST /api/auth/*` — NextAuth endpoints

### Perfil
- `GET /api/profile` — Buscar perfil do atleta logado
- `POST /api/profile` — Criar/atualizar perfil

### Atletas
- `GET /api/athletes` — Listar atletas do treinador
- `POST /api/athletes` — Adicionar atleta existente por email
- `POST /api/athletes/invite` — Enviar convite por email (cria `AthleteInvite`)

### Convites
- `GET /api/invite/[token]` — Buscar dados do convite (público)
- `POST /api/invite/[token]` — Aceitar convite e criar relação treinador-atleta

### Planos de Treino
- `GET /api/training-plans` — Listar planos do usuário logado
- `POST /api/training-plans` — Criar plano via IA (GROQ)
- `GET /api/training-plans/[id]` — Buscar plano específico
- `PATCH /api/training-plans/[id]` — Aprovar/rejeitar/editar plano (trainer)
- `DELETE /api/training-plans/[id]` — Deletar plano (trainer)
- `GET /api/training-plans/active` — Plano ativo do atleta com progresso
- `GET /api/training-plans/[id]/pdf` — Gerar e baixar PDF do plano

### Sessões
- `POST /api/training-plans/[id]/sessions` — Treinador adiciona sessão manualmente
- `PATCH /api/training-plans/sessions/[id]` — Atleta marca sessão como concluída + feedback
- `DELETE /api/training-plans/sessions/[id]` — Treinador remove sessão

### Dashboard
- `GET /api/dashboard/stats` — Estatísticas do usuário (por role)

### Stripe
- `POST /api/stripe/create-checkout` — Criar sessão de checkout
- `GET /api/stripe/checkout-status/[id]` — Status do pagamento
- `POST /api/stripe/webhook` — Webhook do Stripe
- `POST /api/stripe/portal` — Portal do cliente Stripe

---

## 🎯 Planos de Assinatura

| | Base — R$ 97/mês | Premium — R$ 197/mês |
|---|---|---|
| Planos/mês | 10 | Ilimitados |
| Atletas | 3 | Ilimitados |
| PDF | ✅ | ✅ |
| Email | ✅ | ✅ |
| Dashboard avançado | ✅ | ✅ |

---

## 📧 Emails Automáticos

| Evento | Destinatário | Template |
|---|---|---|
| Plano aprovado | Atleta | Notifica que o plano está disponível |
| Plano concluído | Treinador | Notifica que o atleta concluiu |
| Convite | Atleta | Link mágico para aceitar convite |

> Requer `RESEND_API_KEY` configurado. Sem a chave, os emails são ignorados sem impactar o fluxo.

---

## 🔐 Fluxo de Autenticação

1. Login via Google OAuth
2. Primeira entrada → `/dashboard/onboarding` (selecionar role)
3. Role salvo no banco → acesso ao dashboard completo

---

## 📝 Licença

Proprietary — Todos os direitos reservados

## 👨‍💻 Autor

Desenvolvido para Player.Action — 2026
