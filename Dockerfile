# KnowledgeHub v2 — one Dockerfile, two runtime targets:
#   web    → Next.js standalone server
#   worker → BullMQ worker + migration runner (dist/migrate.mjs)
# Build: docker build --target web --build-arg NEXT_PUBLIC_BASE_PATH=/v2 .

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM deps AS build
COPY . .
# basePath is compiled into the Next.js build: "/v2" until the cut-over.
ARG NEXT_PUBLIC_BASE_PATH=""
ARG APP_VERSION=dev
ENV NEXT_PUBLIC_BASE_PATH=$NEXT_PUBLIC_BASE_PATH \
    APP_VERSION=$APP_VERSION \
    NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:22-alpine AS prod-deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

FROM node:22-alpine AS web
WORKDIR /app
ARG NEXT_PUBLIC_BASE_PATH=""
ARG APP_VERSION=dev
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0 \
    NEXT_PUBLIC_BASE_PATH=$NEXT_PUBLIC_BASE_PATH APP_VERSION=$APP_VERSION
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:3000${NEXT_PUBLIC_BASE_PATH}/api/health" >/dev/null || exit 1
CMD ["node", "server.js"]

FROM node:22-alpine AS worker
WORKDIR /app
ARG APP_VERSION=dev
ENV NODE_ENV=production APP_VERSION=$APP_VERSION MIGRATIONS_DIR=/app/drizzle
COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node drizzle ./drizzle
COPY --chown=node:node package.json ./
USER node
CMD ["node", "dist/worker.mjs"]
