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

const port = process.env.PORT || 4000;
app.listen(port, () => console.log(`Knowledge Hub API listening on :${port}`));
