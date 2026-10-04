# KnowledgeHub v2

SaaS multi-cliente para consultores e equipas SAP. Next.js 15 · React 19 ·
TypeScript · Drizzle · PostgreSQL 16 (RLS) · Redis/BullMQ · MinIO · Caddy.

- Handoff de design e especificação: [`docs/handoff/`](docs/handoff/README.md)
- Progresso e decisões: [`docs/PROGRESS.md`](docs/PROGRESS.md)
- Deploy na VPS: [`docs/DEPLOY.md`](docs/DEPLOY.md)

## Desenvolvimento local

```bash
cp .env.example .env          # preencher ENCRYPTION_KEY (openssl rand -hex 32)
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d postgres redis minio minio-init
npm install
npm run db:migrate
npm run dev                   # http://localhost:3000
npm run worker                # noutro terminal
```

Testes: `npm test` (unitários + integração; integração precisa de
`TEST_DATABASE_ADMIN_URL` e `TEST_DATABASE_URL`), `npm run test:e2e` (depois de `npm run build`).
