# Deploying Knowledge Hub to Hostinger (or any Node + MySQL host)

This app is a plain 3-tier stack with no vendor lock-in:

- `server/` — Node.js + Express REST API, Prisma ORM, MySQL
- `client/` — React (Vite) single-page app, builds to static files
- `deploy.sh` + `.github/workflows/deploy.yml` — one-time setup, then every `git push` auto-deploys (see step 8)

## 1. Requirements on the host

- Node.js 18+ (a VPS — e.g. Hostinger's "Node.js" OS template pre-installs Node, PM2, Nginx and Certbot for you)
- Git
- A MySQL database (self-hosted on the VPS, or any managed MySQL)
- A way to keep the API process alive: PM2 (recommended) or systemd

## 2. Get the code onto the server

Push this project to a GitHub repository (if you haven't already), then on the VPS:

```
git clone https://github.com/<you>/<repo>.git knowledge-hub
cd knowledge-hub
```

Everything below assumes the app lives at `~/knowledge-hub` on the server — adjust paths if yours differs.

## 3. Database

1. In hPanel, create a MySQL database + user, note the host/port/db/user/password.
2. On the server, set `server/.env`:
   ```
   DATABASE_URL="mysql://USER:PASSWORD@HOST:3306/DBNAME"
   JWT_SECRET="<generate with: openssl rand -hex 32>"
   ENCRYPTION_KEY="<generate with: openssl rand -hex 32>"
   PORT=4000
   CLIENT_ORIGIN="https://your-domain.com"
   ```
   `ENCRYPTION_KEY` encrypts AI Agent API tokens at rest (AES-256-GCM) — losing/changing it makes saved agent tokens undecryptable (just re-enter them). It is **not** used for the Passwords vault, which is zero-knowledge: entries are encrypted client-side with a key the server never sees.
3. Apply the schema (no shadow DB needed in production):
   ```
   cd server
   npm install
   npx prisma migrate deploy
   ```

## 4. API server

```
cd server
npm install --omit=dev
npm install -g pm2   # if not already available
pm2 start src/index.js --name knowledge-hub-api
pm2 save
```

The API serves `/api/*` and static uploaded files under `/uploads/*` (logos, avatars, voice recordings) from `server/uploads/`. Make sure that folder persists across deploys (back it up / don't wipe it on redeploy). If deploying behind HTTPS, note that Voice Notes recording requires a secure context (HTTPS or localhost) for the browser to grant microphone access.

## 5. Client build

```
cd client
npm install
npm run build
```

This produces `client/dist/` — a static site, served directly from disk by Nginx (see below). No separate upload step needed since it already lives on the server from step 2.

## 6. Reverse proxy (Nginx example)

Point your domain at Nginx, serve the built client as static files, and proxy `/api` and `/uploads` to the Node process on port 4000:

```nginx
server {
  listen 80;
  server_name your-domain.com;

  root /home/<you>/knowledge-hub/client/dist;
  index index.html;

  location /api/ {
    proxy_pass http://127.0.0.1:4000;
    proxy_set_header Host $host;
  }

  location /uploads/ {
    proxy_pass http://127.0.0.1:4000;
  }

  location / {
    try_files $uri /index.html;
  }
}
```

Add HTTPS via Hostinger's free SSL (Let's Encrypt) once the domain resolves — on Hostinger this is hPanel → Websites → your domain → Security → SSL.

## 7. First run

Visit the site, use "Create one" to register the first account — there's no seed/admin user, the first person to sign up just becomes a normal account (multi-user support beyond that is a later iteration).

## 8. Automatic deploys on every `git push`

Once the manual steps above have worked once, wire up `.github/workflows/deploy.yml` (already in this repo) so every push to `main` redeploys automatically — it SSHs into the VPS and runs `deploy.sh`, which does `git pull` → reinstall → `prisma migrate deploy` → rebuild client → `pm2 restart`.

**One-time setup:**

1. **Generate a dedicated deploy key** (don't reuse your personal SSH key):
   ```
   ssh-keygen -t ed25519 -C "github-actions-deploy" -f deploy_key -N ""
   ```
2. **Add the public key to the VPS**, appended to `~/.ssh/authorized_keys` for the user you SSH in as:
   ```
   cat deploy_key.pub | ssh youruser@your-vps-ip 'cat >> ~/.ssh/authorized_keys'
   ```
3. **Add four secrets** in your GitHub repo → Settings → Secrets and variables → Actions:
   - `VPS_HOST` — your VPS IP or domain
   - `VPS_USER` — the SSH username (e.g. `root` or your deploy user)
   - `VPS_SSH_KEY` — the full contents of `deploy_key` (the **private** key, not `.pub`)
   - `VPS_APP_DIR` — absolute path to the app on the server, e.g. `/home/youruser/knowledge-hub`
4. Delete `deploy_key`/`deploy_key.pub` from your local machine once the secret is saved — you won't need the files again, GitHub stores it encrypted.

From then on: `git push origin main` → the app updates itself within about a minute. Check progress under the repo's **Actions** tab.

## What's implemented

Every sidebar section from the design is live:

- **Home** — quick capture, stats, recent notes
- **Notes** — folders, tags, trash/restore, block-based editor with **Text** and **Code** blocks (custom syntax highlighter for ABAP, SQL, JavaScript, JSON, plain text)
- **Tasks** — priority/due date/project, Active/Done/All filters
- **Voice Notes** — real in-browser recording/playback (MediaRecorder), notes
- **Tags** — color-coded, linked to Notes
- **Passwords** — a **zero-knowledge encrypted vault**: your vault password never leaves the browser, the server only ever stores ciphertext it cannot read. A downloadable recovery key (shown once at setup) is the only way back in if you forget the vault password — there is no server-side reset. Auto-locks after 10s of inactivity.
- **Project Issues** — Table (with drag-to-resize columns) and Kanban views, drag-and-drop status changes
- **Settings** — dark/light theme, accent color, logo upload/reset, and **AI Agents**: add Anthropic or OpenAI-compatible agents (API token encrypted at rest with `ENCRYPTION_KEY`), test the connection, toggle active/inactive. Active agents show up as a floating chat widget (bottom-right) across the whole app, with one tab per agent.
  - **Chat history is persisted per agent** (survives reload/logout), with a "Clear" action per agent to wipe it.
  - **Save as Note**: any assistant reply can be saved straight into Notes with one click — fenced code blocks (e.g. ` ```abap `) become real Code blocks with the right language selected, matching text stays as Text blocks, and the title is auto-derived from the reply.

## Current limitations / later-iteration items

- **Voice Notes** record and play back real audio, but there's no speech-to-text transcription (would require a third-party/self-hosted STT service).
- **Multi-user / team management** (inviting teammates, roles) from the prototype's Settings isn't implemented — each account is currently independent.
- **AI Agents** need outbound HTTPS access from the server to `api.anthropic.com` / `api.openai.com` (or your custom OpenAI-compatible `baseUrl`) — make sure your host's firewall allows that.
- **Passwords vault recovery is absolute**: lose both your vault password and your downloaded recovery key, and those entries are permanently unrecoverable by design — there is no support/admin override, since the server never has the means to decrypt them.
