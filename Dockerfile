# KnowledgeHub v2 — one Dockerfile, two runtime targets:
#   web    → Next.js standalone server (Alpine; never loads the search model)
#   worker → BullMQ worker + migration runner (dist/migrate.mjs) + semantic
#            search / OCR (Debian slim: onnxruntime-node ships glibc binaries only)
# Build: docker build --target web --build-arg NEXT_PUBLIC_BASE_PATH=/v2 .

FROM node:22-alpine AS deps
WORKDIR /app
# .npmrc: onnxruntime-node must not download its CUDA binaries (CPU only)
COPY package.json package-lock.json .npmrc ./
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

# The worker's runtime packages, installed on the same base as the worker
# (glibc), minus what a Linux worker never loads: onnxruntime binaries of other
# platforms (~240 MB), onnxruntime-web (transformers.js bundles what it needs)
# and the musl/wasm variants of sharp and canvas. The model itself is NOT in
# the image: it is downloaded once into the `models` volume (docs/DEPLOY.md §6c).
FROM node:22-bookworm-slim AS worker-deps
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
RUN npm ci --omit=dev --no-audit --no-fund \
 && arch=$(node -p process.arch) \
 && ort=node_modules/onnxruntime-node/bin/napi-v6 \
 && rm -rf $ort/darwin $ort/win32 $(ls -d $ort/linux/* | grep -v "/$arch$") \
    node_modules/onnxruntime-web node_modules/@img/sharp-wasm32 \
    node_modules/@img/*linuxmusl* node_modules/@napi-rs/*-musl \
 && npm cache clean --force

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

FROM node:22-bookworm-slim AS worker
WORKDIR /app
ARG APP_VERSION=dev
ENV NODE_ENV=production APP_VERSION=$APP_VERSION MIGRATIONS_DIR=/app/drizzle MODEL_CACHE_DIR=/models
# model files + OCR languages live in a volume mounted here (owned by node)
RUN mkdir -p /models && chown node:node /models
COPY --from=worker-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node drizzle ./drizzle
COPY --chown=node:node package.json ./
USER node
CMD ["node", "dist/worker.mjs"]
