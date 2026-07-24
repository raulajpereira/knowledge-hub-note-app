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
import { purgeExpiredTrash } from './lib/trashPurge.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();

app.use(cors({ origin: process.env.CLIENT_ORIGIN || '*' }));
app.use(express.json({ limit: '5mb' }));
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

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

app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

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
