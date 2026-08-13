import { Router } from 'express';
import dns from 'node:dns/promises';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requireFeature } from '../middleware/auth.js';

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];
const BODY_TYPES = ['none', 'json', 'text', 'form'];
const AUTH_TYPES = ['none', 'bearer', 'basic', 'apiKey'];

const router = Router();
router.use(requireAuth);
router.use(requireFeature('apiPlayground'));

// Best-effort SSRF guard for the proxy below: blocks loopback, private,
// link-local (incl. the 169.254.169.254 cloud metadata address) and unique
// local ranges. This checks the resolved IP at request time, so it doesn't
// fully close DNS-rebinding races against a malicious, fast-TTL domain —
// acceptable here since this is an authenticated, single-team dev tool, not
// a public multi-tenant service.
function isPrivateAddress(ip) {
  if (ip.startsWith('::ffff:')) ip = ip.slice(7);
  if (/^\d+\.\d+\.\d+\.\d+$/.test(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
  }
  const lower = ip.toLowerCase();
  return lower === '::1' || lower.startsWith('fe80:') || lower.startsWith('fc') || lower.startsWith('fd');
}

// Server-side fetch relay so the client can fall back to it when a direct
// browser fetch() is blocked by the target API's CORS policy — the browser
// enforces CORS, a plain server-to-server request doesn't need to satisfy it.
router.post('/proxy', async (req, res) => {
  const { url, method, headers, body } = req.body || {};
  if (typeof url !== 'string' || !url) return res.status(400).json({ error: 'url is required' });

  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return res.status(400).json({ error: 'Invalid URL' });
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) return res.status(400).json({ error: 'Only http/https URLs are allowed' });
  if (parsed.hostname === 'localhost' || parsed.hostname === '0.0.0.0') {
    return res.status(400).json({ error: 'Requests to local/internal addresses are blocked' });
  }

  let addresses;
  try {
    addresses = await dns.lookup(parsed.hostname, { all: true });
  } catch {
    return res.status(400).json({ error: 'Could not resolve host' });
  }
  if (addresses.length === 0 || addresses.some((a) => isPrivateAddress(a.address))) {
    return res.status(400).json({ error: 'Requests to local/internal addresses are blocked' });
  }

  const httpMethod = METHODS.includes(method) ? method : 'GET';
  const outHeaders = {};
  if (headers && typeof headers === 'object') {
    for (const [k, v] of Object.entries(headers)) {
      if (typeof k === 'string' && typeof v === 'string') outHeaders[k] = v;
    }
  }

  const startedAt = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const upstream = await fetch(parsed.toString(), {
      method: httpMethod,
      headers: outHeaders,
      body: ['GET', 'HEAD'].includes(httpMethod) ? undefined : body || undefined,
      redirect: 'manual', // never auto-follow — a redirect could point at an internal address
      signal: controller.signal,
    });
    const timeMs = Date.now() - startedAt;
    const resHeaders = {};
    upstream.headers.forEach((v, k) => { resHeaders[k] = v; });
    const text = await upstream.text();
    res.json({ status: upstream.status, statusText: upstream.statusText, headers: resHeaders, body: text, timeMs });
  } catch (err) {
    res.status(502).json({ error: err.name === 'AbortError' ? 'Request timed out' : err.message || 'Request failed' });
  } finally {
    clearTimeout(timer);
  }
});

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

  const { name, method, url, headers, queryParams, bodyType, body, formBody, authType, authConfig, folderId, lastResponse } = req.body || {};
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
  if (formBody !== undefined) data.formBody = Array.isArray(formBody) ? formBody : null;
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
