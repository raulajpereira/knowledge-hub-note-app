import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import authRoutes from './routes/auth.routes.js';
import notesRoutes from './routes/notes.routes.js';
import foldersRoutes from './routes/folders.routes.js';
import settingsRoutes from './routes/settings.routes.js';
import tasksRoutes from './routes/tasks.routes.js';
import tagsRoutes from './routes/tags.routes.js';
import voiceRoutes from './routes/voice.routes.js';
import passwordsRoutes from './routes/passwords.routes.js';
import issuesRoutes from './routes/issues.routes.js';
import agentsRoutes from './routes/agents.routes.js';
import newsRoutes from './routes/news.routes.js';
import artifactsRoutes from './routes/artifacts.routes.js';
import artifactFoldersRoutes from './routes/artifactfolders.routes.js';
import sapNewsRoutes from './routes/sapnews.routes.js';
import codeLibraryRoutes from './routes/codelibrary.routes.js';
import linksRoutes from './routes/links.routes.js';
import vpsRoutes from './routes/vps.routes.js';
import templatesRoutes from './routes/templates.routes.js';
import publicRoutes from './routes/public.routes.js';
import projectsRoutes from './routes/projects.routes.js';
import transactionsRoutes from './routes/transactions.routes.js';
import documentacaoRoutes from './routes/documentacao.routes.js';
import clientsRoutes from './routes/clients.routes.js';
import sapSystemsRoutes from './routes/sapsystems.routes.js';
import contactsRoutes from './routes/contacts.routes.js';
import transportRequestsRoutes from './routes/transportrequests.routes.js';
import auditLogRoutes from './routes/auditlog.routes.js';
import apiPlaygroundRoutes from './routes/apiplayground.routes.js';
import whiteboardsRoutes from './routes/whiteboards.routes.js';
import activityRoutes from './routes/activity.routes.js';
import emailsRoutes from './routes/emails.routes.js';
import emailFoldersRoutes from './routes/emailfolders.routes.js';
import codeRequestsRoutes from './routes/coderequests.routes.js';
import { purgeExpiredTrash } from './lib/trashPurge.js';
import { auditMiddleware } from './lib/auditLog.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();

app.use(cors({ origin: process.env.CLIENT_ORIGIN || '*' }));
app.use(express.json({ limit: '5mb' }));
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));
app.use(auditMiddleware);

app.get('/api/health', (req, res) => res.json({ ok: true }));

app.use('/api/auth', authRoutes);
app.use('/api/notes', notesRoutes);
app.use('/api/folders', foldersRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/tasks', tasksRoutes);
app.use('/api/tags', tagsRoutes);
app.use('/api/voice', voiceRoutes);
app.use('/api/passwords', passwordsRoutes);
app.use('/api/issues', issuesRoutes);
app.use('/api/agents', agentsRoutes);
app.use('/api/news', newsRoutes);
app.use('/api/artifacts', artifactsRoutes);
app.use('/api/artifact-folders', artifactFoldersRoutes);
app.use('/api/sap-news', sapNewsRoutes);
app.use('/api/code-library', codeLibraryRoutes);
app.use('/api/links', linksRoutes);
app.use('/api/vps', vpsRoutes);
app.use('/api/templates', templatesRoutes);
app.use('/api/public', publicRoutes);
app.use('/api/projects', projectsRoutes);
app.use('/api/transactions', transactionsRoutes);
app.use('/api/documentacao', documentacaoRoutes);
app.use('/api/clients', clientsRoutes);
app.use('/api/sap-systems', sapSystemsRoutes);
app.use('/api/contacts', contactsRoutes);
app.use('/api/transport-requests', transportRequestsRoutes);
app.use('/api/audit-log', auditLogRoutes);
app.use('/api/api-playground', apiPlaygroundRoutes);
app.use('/api/whiteboards', whiteboardsRoutes);
app.use('/api/activity', activityRoutes);
app.use('/api/emails', emailsRoutes);
app.use('/api/email-folders', emailFoldersRoutes);
app.use('/api/code-requests', codeRequestsRoutes);

app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

// A separate, isolated frontend bundle for the /backoffice admin tools
// (Pedidos de Código, Criar Códigos, Contas, Templates, Activity Log) — its
// own build, its own login/session, so none of that ships inside the bundle
// the paying-customer app downloads. Same Express process, same API, same
// DB — just a second static root, mounted (and thus matched) before the
// product app's catch-all below.
const backofficeDist = path.join(__dirname, '..', '..', 'backoffice', 'dist');
app.use('/backoffice', express.static(backofficeDist));
app.get('/backoffice*', (req, res) => {
  res.sendFile(path.join(backofficeDist, 'index.html'));
});

const clientDist = path.join(__dirname, '..', '..', 'client', 'dist');
app.use(express.static(clientDist));
app.get('*', (req, res) => {
  res.sendFile(path.join(clientDist, 'index.html'));
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

const PURGE_INTERVAL_MS = 6 * 60 * 60 * 1000;
purgeExpiredTrash().catch((err) => console.error('Trash purge failed', err));
setInterval(() => purgeExpiredTrash().catch((err) => console.error('Trash purge failed', err)), PURGE_INTERVAL_MS);

const port = process.env.PORT || 4000;
app.listen(port, () => console.log(`Knowledge Hub API listening on :${port}`));
