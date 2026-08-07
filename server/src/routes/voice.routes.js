import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import crypto from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requireFeature } from '../middleware/auth.js';
import { decryptSecret } from '../lib/crypto.js';
import { callProvider } from '../lib/aiProvider.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const voiceDir = path.join(__dirname, '..', '..', 'uploads', 'voice');

const upload = multer({
  storage: multer.diskStorage({
    destination: voiceDir,
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname) || '.webm';
      cb(null, `${req.effectiveUserId}-${crypto.randomUUID()}${ext}`);
    },
  }),
  limits: { fileSize: 25 * 1024 * 1024 },
});

const router = Router();
router.use(requireAuth);
router.use(requireFeature('voice'));

router.get('/', async (req, res) => {
  const trashed = req.query.trashed === 'true';
  const voiceNotes = await prisma.voiceNote.findMany({
    where: { userId: req.effectiveUserId, deletedAt: trashed ? { not: null } : null },
    orderBy: trashed ? { deletedAt: 'desc' } : { createdAt: 'desc' },
  });
  res.json({ voiceNotes });
});

router.post('/', upload.single('audio'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No audio file uploaded' });
  const { title, duration, source } = req.body || {};
  const voiceNote = await prisma.voiceNote.create({
    data: {
      userId: req.effectiveUserId,
      title: title?.trim() || `Recording ${new Date().toLocaleString()}`,
      audioUrl: `/uploads/voice/${req.file.filename}`,
      duration: Number(duration) || 0,
      source: source === 'system' ? 'system' : 'mic',
    },
  });
  res.status(201).json({ voiceNote });
});

router.patch('/:id', async (req, res) => {
  const voiceNote = await prisma.voiceNote.findFirst({ where: { id: req.params.id, userId: req.effectiveUserId, deletedAt: null } });
  if (!voiceNote) return res.status(404).json({ error: 'Voice note not found' });

  const { title, notes, favorite } = req.body || {};
  const data = {};
  if (title !== undefined) data.title = title.trim() || voiceNote.title;
  if (notes !== undefined) data.notes = notes;
  if (favorite !== undefined) data.favorite = !!favorite;

  const updated = await prisma.voiceNote.update({ where: { id: voiceNote.id }, data });
  res.json({ voiceNote: updated });
});

// Soft delete (move to trash)
router.post('/:id/trash', async (req, res) => {
  const voiceNote = await prisma.voiceNote.findFirst({ where: { id: req.params.id, userId: req.effectiveUserId, deletedAt: null } });
  if (!voiceNote) return res.status(404).json({ error: 'Voice note not found' });
  const updated = await prisma.voiceNote.update({ where: { id: voiceNote.id }, data: { deletedAt: new Date() } });
  res.json({ voiceNote: updated });
});

router.post('/:id/restore', async (req, res) => {
  const voiceNote = await prisma.voiceNote.findFirst({ where: { id: req.params.id, userId: req.effectiveUserId, deletedAt: { not: null } } });
  if (!voiceNote) return res.status(404).json({ error: 'Voice note not found in trash' });
  const updated = await prisma.voiceNote.update({ where: { id: voiceNote.id }, data: { deletedAt: null } });
  res.json({ voiceNote: updated });
});

// Manual transcription via the user's active OpenAI-compatible agent (Groq's
// free Whisper endpoint, or OpenAI's). Anthropic-only agents can't do audio,
// so this is a distinct multipart call, not the chat-completions path used
// by the agents routes.
router.post('/:id/transcribe', async (req, res) => {
  const voiceNote = await prisma.voiceNote.findFirst({ where: { id: req.params.id, userId: req.effectiveUserId, deletedAt: null } });
  if (!voiceNote) return res.status(404).json({ error: 'Voice note not found' });

  const agent = await prisma.agent.findFirst({ where: { userId: req.effectiveUserId, active: true } });
  if (!agent) return res.status(400).json({ error: 'Configura um agente de IA ativo em Definições para usar a transcrição.' });
  if (agent.provider === 'anthropic') {
    return res.status(400).json({ error: 'A transcrição de áudio precisa de um agente compatível com OpenAI (ex.: Groq) — o Claude não tem esse endpoint.' });
  }

  try {
    const token = decryptSecret(agent.tokenCipher);
    const baseUrl = (agent.baseUrl || 'https://api.openai.com/v1').replace(/\/$/, '');
    const model = baseUrl.includes('groq.com') ? 'whisper-large-v3' : 'whisper-1';

    const filePath = path.join(voiceDir, path.basename(voiceNote.audioUrl));
    const buffer = await readFile(filePath);
    const form = new FormData();
    form.append('file', new Blob([buffer]), path.basename(filePath));
    form.append('model', model);

    const apiRes = await fetch(`${baseUrl}/audio/transcriptions`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
      body: form,
    });
    const data = await apiRes.json().catch(() => ({}));
    if (!apiRes.ok) throw new Error(data?.error?.message || `Transcription API error (${apiRes.status})`);

    res.json({ text: data.text || '' });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Transcription failed' });
  }
});

const TASK_SUGGEST_PROMPT =
  'Extrai items de acao (tarefas) do texto abaixo, que e a transcricao ou notas de uma nota de voz. ' +
  'Responde APENAS com um array JSON valido, sem texto a volta, no formato: ' +
  '[{"title": "...", "due": "YYYY-MM-DD ou null"}]. ' +
  'Se nao houver nenhuma acao clara a extrair, responde com um array vazio: [].';

router.post('/:id/suggest-tasks', async (req, res) => {
  const voiceNote = await prisma.voiceNote.findFirst({ where: { id: req.params.id, userId: req.effectiveUserId, deletedAt: null } });
  if (!voiceNote) return res.status(404).json({ error: 'Voice note not found' });
  const sourceText = (voiceNote.notes || '').trim();
  if (!sourceText) return res.status(400).json({ error: 'Esta nota de voz ainda nao tem texto (transcreve-a primeiro).' });

  const agent = await prisma.agent.findFirst({ where: { userId: req.effectiveUserId, active: true } });
  if (!agent) return res.status(400).json({ error: 'Configura um agente de IA ativo em Definições para usar esta funcionalidade.' });

  try {
    const reply = await callProvider(agent, [{ role: 'user', content: sourceText }], { systemPrompt: TASK_SUGGEST_PROMPT, maxTokens: 700 });
    const match = reply.match(/\[[\s\S]*\]/);
    const parsed = JSON.parse(match ? match[0] : reply);
    const tasks = Array.isArray(parsed)
      ? parsed
          .filter((t) => t && typeof t.title === 'string' && t.title.trim())
          .map((t) => ({ title: t.title.trim(), due: /^\d{4}-\d{2}-\d{2}$/.test(t.due || '') ? t.due : null }))
      : [];
    res.json({ tasks });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Não foi possível sugerir tarefas.' });
  }
});

// Permanent delete
router.delete('/:id', async (req, res) => {
  const voiceNote = await prisma.voiceNote.findFirst({ where: { id: req.params.id, userId: req.effectiveUserId } });
  if (!voiceNote) return res.status(404).json({ error: 'Voice note not found' });
  await prisma.voiceNote.delete({ where: { id: voiceNote.id } });
  res.status(204).end();
});

export default router;
