#!/usr/bin/env bash
#
# Primeiros commits deste repositório, um módulo por vez.
#
# ESCOPO: aqui vive a PLATAFORMA NOVA — o backend NestJS e os pacotes
# compartilhados. O monolito Next permanece no repositório de origem e não é
# commitado; por isso não há frontend, BFF nem testes de web aqui.
#
# ORDEM: infraestrutura primeiro (nada funciona sem ela), depois os módulos de
# NÚCLEO — os que qualquer vertical reaproveita — e por último o `sports`, que é
# a regra de negócio de escola de futebol. Essa posição é deliberada: num fork
# para personal, música ou psicologia, `sports` é o único módulo a remover, e ele
# estar no último commit torna a fronteira visível no próprio histórico.
#
# USO:
#   bash scripts/commits-iniciais.sh            # simulação: mostra e NÃO commita
#   bash scripts/commits-iniciais.sh --aplicar  # cria os commits
#
set -euo pipefail
cd "$(dirname "$0")/.."

APLICAR=false
[[ "${1:-}" == "--aplicar" ]] && APLICAR=true

SOMA=0
TODOS_CAMINHOS=()

grupo() {
  local rotulo="$1" mensagem="$2"; shift 2
  local caminhos=("$@")
  TODOS_CAMINHOS+=("${caminhos[@]}")

  git reset -q
  # `2>/dev/null`: no Windows o git avisa "LF will be replaced by CRLF" por
  # arquivo, e centenas dessas linhas enterram a saída útil.
  git add -- "${caminhos[@]}" 2>/dev/null
  local n
  n=$(git diff --cached --name-only | wc -l | tr -d ' ')
  SOMA=$((SOMA + n))

  printf '\n\033[1m%s\033[0m  (%s arquivos)\n' "$rotulo" "$n"
  printf '  %s\n' "$mensagem"

  if $APLICAR; then
    git commit -q -m "$mensagem" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
    printf '  \033[32m✓\033[0m  %s\n' "$(git rev-parse --short HEAD)"
  fi
}

# Deliberadamente FORA deste repositório: o monolito Next, o processador de HLS
# do produto antigo e a documentação de referência, que descreve rotas que não
# vivem aqui. Declarado explicitamente para a conferência distinguir exclusão de
# escopo de esquecimento — um alarme que sempre dispara é um alarme que ninguém lê.
EXCLUIDOS=(apps/web hls-processor-repo memory
           docs/01-architecture docs/02-models docs/03-api docs/04-guides
           docs/05-manual docs/README.md docs/business_rules.md
           docs/technical_handbook.md
           # Dois PDFs do produto antigo, ambos com o carimbo do import
           # (08/08 09:59): relatório detalhado e especificação do Player.Action.
           # Só apareceram quando o grupo `docs` deixou de ser um balde — antes
           # entrariam no commit sem ninguém reparar.
           docs/Relatorio_Detalhado_Player_Action.pdf docs/SPECIFICATION.pdf)

TOTAL_ANTES=$(git status --porcelain -uall | wc -l | tr -d ' ')
printf 'arquivos a versionar: %s\n' "$TOTAL_ANTES"

# ── 1 ── Nada pode ser adicionado com segurança antes disto: os padrões de
# ignore reancorados para o monorepo (sem eles, 6673 artefatos de build entram).
grupo "1 · fundação do repositório" \
  "chore: estrutura de monorepo, ignore reancorado e ferramental" \
  .gitignore .mailmap package.json package-lock.json docker-compose.yml \
  README.md DEVELOPMENT.md .agent

# ── 2 ── Regra de papéis: os dois lados importam dela, então vem antes deles.
grupo "2 · pacote de papéis" \
  "feat(papeis): regra compartilhada de papéis, sem dependência de runtime" \
  packages

# ── 3 ── Esqueleto do Nest: sem controller de domínio nenhum.
grupo "3 · fundação do backend" \
  "feat(backend): aplicação NestJS, config e bootstrap" \
  apps/backend/package.json apps/backend/nest-cli.json \
  apps/backend/tsconfig.json apps/backend/tsconfig.build.json \
  apps/backend/src/main.ts apps/backend/src/app.module.ts \
  apps/backend/test/jest-e2e.json

# ── 4 ── A ponte de autenticação: guard global, contrato de erro, Prisma.
# É o que torna toda rota protegida por padrão.
grupo "4 · autenticação e infraestrutura" \
  "feat(backend): ponte de auth NextAuth, guard global e contrato de erro" \
  apps/backend/src/auth apps/backend/src/common apps/backend/src/prisma \
  apps/backend/src/health apps/backend/test/auth.e2e-spec.ts

# ── 5 ── O banco. Vem antes dos módulos porque todos consultam o schema.
# As 33 migrations mudaram de casa: eram de apps/web (D10), e passam a este
# serviço agora que ele é o dono do banco.
grupo "5 · schema e migrations" \
  "feat(backend): schema Prisma e histórico de migrations" \
  apps/backend/prisma

# ── 6 ── Módulos de NÚCLEO, reaproveitáveis por qualquer vertical.
grupo "6 · módulo de usuários" \
  "feat(users): perfil próprio, perfil público, papéis e profissionais vinculados" \
  apps/backend/src/users apps/backend/test/own-profile.e2e-spec.ts \
  apps/backend/test/public-profile.e2e-spec.ts \
  apps/backend/test/my-trainers.e2e-spec.ts

grupo "7 · módulo de notificações" \
  "feat(notifications): listagem com cursor e marcação de leitura" \
  apps/backend/src/notifications apps/backend/test/notifications.e2e-spec.ts

# ── 8 ── VERTICAL. Único módulo que um fork de outro segmento remove.
grupo "8 · esportes — regra de escola de futebol" \
  "feat(sports): catálogo de esportes e administração (vertical futebol)" \
  apps/backend/src/sports apps/backend/test/sports.e2e-spec.ts

# ── 9 ── CI e specs: descrevem e verificam o que veio acima.
grupo "9 · integração contínua" \
  "ci: workflow para o monorepo, com e2e contra Postgres real" \
  .github scripts

# Só as specs: são o registro de decisão DESTE backend — 49 achados e 59
# decisões, com o porquê de cada escolha. A documentação de referência descreve
# rotas do monolito e fica com ele.
grupo "10 · specs de decisão" \
  "docs: specs das fatias 1–11, com achados e decisões registrados" \
  docs/implementation-plans

# ── Conferência: os grupos são uma PARTIÇÃO, não uma amostra ───────────────
git reset -q
git add -- "${TODOS_CAMINHOS[@]}" "${EXCLUIDOS[@]}" 2>/dev/null
# Só as linhas `??`: com tudo encenado, elas SÃO o complemento.
DESCOBERTOS=$(git status --porcelain -uall | grep '^??' | sed 's/^?? //' || true)
RESTO=$(printf '%s' "$DESCOBERTOS" | grep -c . || true)
git reset -q

printf '\n────────────────────────────────────────\n'
if $APLICAR; then
  printf 'commits criados: %s\n' "$(git rev-list --count HEAD)"
  printf 'arquivos fora de qualquer commit: %s\n' "$RESTO"
else
  printf 'SIMULAÇÃO — nada foi commitado.\n'
  if [[ "$RESTO" == "0" ]]; then
    printf 'partição EXATA: %s commitados + %s fora de escopo = %s.\n' \
      "$SOMA" "$((TOTAL_ANTES - SOMA))" "$TOTAL_ANTES"
  else
    printf '\033[31mFURO: %s arquivo(s) fora de qualquer grupo:\033[0m\n' "$RESTO"
    printf '%s\n' "$DESCOBERTOS" | sed 's/^/    /'
  fi
  printf 'Para aplicar:  bash scripts/commits-iniciais.sh --aplicar\n'
fi
