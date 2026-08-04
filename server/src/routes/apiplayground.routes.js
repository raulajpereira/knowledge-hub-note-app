import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];
const BODY_TYPES = ['none', 'json', 'text', 'form'];
const AUTH_TYPES = ['none', 'bearer', 'basic', 'apiKey'];

const router = Router();
router.use(requireAuth);

router.get('/folders', async (req, res) => {
  const folders = await prisma.apiFolder.findMany({
    where: { userId: req.effectiveUserId },
    orderBy: { createdAt: 'asc' },
    include: { _count: { select: { requests: true } } },
  });
  res.json({ folders: folders.map(({ _count, ...f }) => ({ ...f, requestCount: _count.requests })) });
});

router.post('/folders', async (req, res) => {
  const { name } = req.body || {};
  if (!name?.trim()) return res.status(400).json({ error: 'name is required' });
  const folder = await prisma.apiFolder.create({ data: { userId: req.effectiveUserId, name: name.trim() } });
  res.status(201).json({ folder: { ...folder, requestCount: 0 } });
});

router.patch('/folders/:id', async (req, res) => {
  const folder = await prisma.apiFolder.findFirst({ where: { id: req.params.id, userId: req.effectiveUserId } });
  if (!folder) return res.status(404).json({ error: 'Folder not found' });
  const { name } = req.body || {};
  const data = {};
  if (name !== undefined) data.name = name.trim() || folder.name;
  const updated = await prisma.apiFolder.update({ where: { id: folder.id }, data });
  res.json({ folder: updated });
});

router.delete('/folders/:id', async (req, res) => {
  const folder = await prisma.apiFolder.findFirst({ where: { id: req.params.id, userId: req.effectiveUserId } });
  if (!folder) return res.status(404).json({ error: 'Folder not found' });
  await prisma.apiRequest.updateMany({ where: { folderId: folder.id, userId: req.effectiveUserId }, data: { folderId: null } });
  await prisma.apiFolder.delete({ where: { id: folder.id } });
  res.status(204).end();
});

router.get('/requests', async (req, res) => {
  const requests = await prisma.apiRequest.findMany({
    where: { userId: req.effectiveUserId },
    orderBy: { updatedAt: 'desc' },
  });
  res.json({ requests });
});

router.post('/requests', async (req, res) => {
  const { name, folderId } = req.body || {};
  let validFolderId = null;
  if (folderId) {
    const folder = await prisma.apiFolder.findFirst({ where: { id: folderId, userId: req.effectiveUserId } });
    if (folder) validFolderId = folder.id;
  }
  const request = await prisma.apiRequest.create({
    data: {
      userId: req.effectiveUserId,
      folderId: validFolderId,
      name: name?.trim() || 'New request',
      method: 'GET',
      url: '',
    },
  });
  res.status(201).json({ request });
});

router.patch('/requests/:id', async (req, res) => {
  const request = await prisma.apiRequest.findFirst({ where: { id: req.params.id, userId: req.effectiveUserId } });
  if (!request) return res.status(404).json({ error: 'Request not found' });

  const { name, method, url, headers, queryParams, bodyType, body, authType, authConfig, folderId, lastResponse } = req.body || {};
  const data = {};
  if (name !== undefined) data.name = name.trim() || request.name;
  if (method !== undefined) {
    if (!METHODS.includes(method)) return res.status(400).json({ error: 'Invalid method' });
    data.method = method;
  }
  if (url !== undefined) data.url = url;
  if (headers !== undefined) data.headers = Array.isArray(headers) ? headers : null;
  if (queryParams !== undefined) data.queryParams = Array.isArray(queryParams) ? queryParams : null;
  if (bodyType !== undefined) {
    if (!BODY_TYPES.includes(bodyType)) return res.status(400).json({ error: 'Invalid bodyType' });
    data.bodyType = bodyType;
  }
  if (body !== undefined) data.body = body;
  if (authType !== undefined) {
    if (!AUTH_TYPES.includes(authType)) return res.status(400).json({ error: 'Invalid authType' });
    data.authType = authType;
  }
  if (authConfig !== undefined) data.authConfig = authConfig;
  if (lastResponse !== undefined) data.lastResponse = lastResponse;
  if (folderId !== undefined) {
    if (!folderId) {
      data.folderId = null;
    } else {
      const folder = await prisma.apiFolder.findFirst({ where: { id: folderId, userId: req.effectiveUserId } });
      if (!folder) return res.status(404).json({ error: 'Folder not found' });
      data.folderId = folder.id;
    }
  }

  const updated = await prisma.apiRequest.update({ where: { id: request.id }, data });
  res.json({ request: updated });
});

router.delete('/requests/:id', async (req, res) => {
  const request = await prisma.apiRequest.findFirst({ where: { id: req.params.id, userId: req.effectiveUserId } });
  if (!request) return res.status(404).json({ error: 'Request not found' });
  await prisma.apiRequest.delete({ where: { id: request.id } });
  res.status(204).end();
});

export default router;
