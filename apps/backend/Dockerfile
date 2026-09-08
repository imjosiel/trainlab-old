# Backend Nest — multi-stage para Render (Docker).
#
# - Build usa o monorepo (precisa de packages/papeis + lockfile da raiz).
# - Runtime enxuto: só dist + node_modules de prod + schema Prisma.
# - Prisma Client gerado no build (output isolado .prisma-backend).
# - Migrate roda no start (deploy), nunca no build.
# - Healthcheck usa GET /health (rota @Public, sem auth).

FROM node:22-alpine AS deps
WORKDIR /app
RUN apk add --no-cache openssl
COPY package.json package-lock.json ./
COPY apps/backend/package.json apps/backend/
COPY apps/frontend/package.json apps/frontend/
COPY packages/papeis/package.json packages/papeis/
RUN npm ci --workspace=@trainlab/backend --workspace=@trainlab/papeis --include-workspace-root=false

FROM node:22-alpine AS build
WORKDIR /app
RUN apk add --no-cache openssl
COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json ./
COPY apps/backend apps/backend
COPY packages/papeis packages/papeis
RUN npm run build:packages \
 && npm run prisma:generate --workspace=@trainlab/backend \
 && npm run build --workspace=@trainlab/backend

# Runtime enxuto: reinstall prod-only (recria symlinks do workspace) +
# prisma CLI avulso (só para o `migrate deploy` do entrypoint) +
# artefatos do build (dist, client gerado, dist do papeis).
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache openssl
COPY package.json package-lock.json ./
COPY apps/backend/package.json apps/backend/
COPY apps/frontend/package.json apps/frontend/
COPY packages/papeis/package.json packages/papeis/
RUN npm ci --omit=dev --workspace=@trainlab/backend --workspace=@trainlab/papeis --include-workspace-root=false \
 && npm install --no-save --workspace=@trainlab/backend prisma@6.2.0 \
 && npm cache clean --force
COPY --from=build /app/apps/backend/dist ./apps/backend/dist
COPY --from=build /app/apps/backend/prisma ./apps/backend/prisma
COPY --from=build /app/apps/backend/node_modules/.prisma-backend ./apps/backend/node_modules/.prisma-backend
COPY --from=build /app/packages/papeis/dist ./packages/papeis/dist
COPY apps/backend/docker-entrypoint.sh ./apps/backend/docker-entrypoint.sh
RUN sed -i 's/\r$//' ./apps/backend/docker-entrypoint.sh && chmod +x ./apps/backend/docker-entrypoint.sh
WORKDIR /app/apps/backend
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://localhost:'+(process.env.PORT||3001)+'/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "dist/main"]
