#!/bin/sh
# Entrypoint do backend em prod (Render/Docker).
#
# 1. Exige as variáveis críticas antes de subir (fail-fast, mesma lógica do
#    exigirSegredoDeSessao() em src/main.ts, mas antes do Node iniciar).
# 2. Roda `prisma migrate deploy` (Neon) — NUNCA `migrate dev`.
# 3. Entrega para o CMD (`node dist/main`).
set -eu

: "${DATABASE_URL:?DATABASE_URL não definida}"
: "${NEXTAUTH_SECRET:?NEXTAUTH_SECRET não definida}"

echo "[entrypoint] aplicando migrations..."
npx prisma migrate deploy --schema=./prisma/schema.prisma

echo "[entrypoint] iniciando backend..."
exec "$@"
