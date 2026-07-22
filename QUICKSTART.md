# Quickstart — run Knowledge Hub locally

Requires: **Node.js 18+** and **Docker** (for MySQL — or use your own MySQL if you already have one).

## 1. Start the database

```
docker compose up -d
```

This starts MySQL on `localhost:3306` with a `knowledge_hub` database already created (see `docker-compose.yml`). Skip this step if you're pointing at your own MySQL instead — just update `server/.env` accordingly.

## 2. Configure the server

```
cd server
cp .env.example .env
```

Edit `server/.env` and set:

```
DATABASE_URL="mysql://kh_app:kh_dev_pw@localhost:3306/knowledge_hub"
JWT_SECRET="<run: openssl rand -hex 32>"
ENCRYPTION_KEY="<run: openssl rand -hex 32>"
PORT=4000
CLIENT_ORIGIN="http://localhost:5173"
```

(The `DATABASE_URL` above matches the Docker Compose credentials exactly — just paste it in as-is if you used step 1.)

## 3. Install, migrate, run the server

```
npm install
npx prisma migrate dev
npm run dev
```

Leave this running — it serves the API on `http://localhost:4000`.

## 4. Install and run the client (in a new terminal)

```
cd client
npm install
npm run dev
```

## 5. Open it

Visit **http://localhost:5173**, click "Create one" to register your first account, and you're in.

---

Everything (notes, tasks, voice recordings, the encrypted password vault, AI agent chat) is stored in your local MySQL — nothing leaves your machine except calls you explicitly make from Settings → AI Agents to Anthropic/OpenAI with your own API key.

See `DEPLOYMENT.md` for putting this on a real host (e.g. Hostinger) instead of running it locally.
