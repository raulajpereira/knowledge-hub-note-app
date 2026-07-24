import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { encryptSecret, decryptSecret } from '../lib/secretCrypto.js';
import { listVirtualMachines, getVirtualMachine, getVmMetrics, normalizeToMb, latestUsagePoint } from '../lib/hostinger.js';

const router = Router();
router.use(requireAuth);

// Short in-memory cache so Home + Settings loading together doesn't double-hit Hostinger.
const statusCache = new Map(); // userId -> { at, data }
const CACHE_MS = 60 * 1000;

router.post('/token', async (req, res) => {
  const token = (req.body?.token || '').trim();
  if (!token) return res.status(400).json({ error: 'token is required' });

  let vms;
  try {
    const result = await listVirtualMachines(token);
    vms = Array.isArray(result) ? result : result?.data;
  } catch (err) {
    if (err.status === 401 || err.status === 403) {
      return res.status(400).json({ error: 'Token inválido ou sem permissão para aceder à VPS.' });
    }
    console.error('Hostinger token validation failed:', err.status, err.body);
    return res.status(502).json({ error: 'Não foi possível validar o token com a Hostinger. Tenta novamente.' });
  }
  if (!Array.isArray(vms) || vms.length === 0) {
    return res.status(400).json({ error: 'Este token não tem nenhuma VPS associada.' });
  }

  const vmId = String(vms[0].id);
  await prisma.settings.upsert({
    where: { userId: req.userId },
    update: { hostingerApiTokenEnc: encryptSecret(token), hostingerVpsId: vmId },
    create: { userId: req.userId, hostingerApiTokenEnc: encryptSecret(token), hostingerVpsId: vmId },
  });
  statusCache.delete(req.userId);
  res.json({ connected: true, hostname: vms[0].hostname || null });
});

router.delete('/token', async (req, res) => {
  await prisma.settings.upsert({
    where: { userId: req.userId },
    update: { hostingerApiTokenEnc: null, hostingerVpsId: null },
    create: { userId: req.userId },
  });
  statusCache.delete(req.userId);
  res.json({ connected: false });
});

router.get('/status', async (req, res) => {
  const cached = statusCache.get(req.userId);
  if (cached && Date.now() - cached.at < CACHE_MS) return res.json(cached.data);

  const settings = await prisma.settings.findUnique({ where: { userId: req.userId } });
  if (!settings?.hostingerApiTokenEnc || !settings.hostingerVpsId) {
    return res.status(404).json({ error: 'not_configured' });
  }

  let token;
  try {
    token = decryptSecret(settings.hostingerApiTokenEnc);
  } catch (err) {
    console.error('Failed to decrypt stored Hostinger token:', err);
    return res.status(500).json({ error: 'Falha interna ao ler o token guardado.' });
  }

  try {
    const [vm, metrics] = await Promise.all([
      getVirtualMachine(token, settings.hostingerVpsId),
      getVmMetrics(token, settings.hostingerVpsId).catch((err) => {
        console.error('Hostinger metrics fetch failed:', err.status, err.body);
        return { __error: { status: err.status || null, body: err.body ? String(err.body).slice(0, 400) : err.message } };
      }),
    ]);
    const metricsError = metrics?.__error || null;
    const usableMetrics = metricsError ? null : metrics;

    const diskTotalMb = Number.isFinite(vm?.disk) ? vm.disk : null;
    const memTotalMb = Number.isFinite(vm?.memory) ? vm.memory : null;

    const diskPoint = usableMetrics ? latestUsagePoint(usableMetrics.diskSpace) : null;
    const memPoint = usableMetrics ? latestUsagePoint(usableMetrics.ramUsage) : null;
    const cpuPoint = usableMetrics ? latestUsagePoint(usableMetrics.cpuUsage) : null;
    const uptimePoint = usableMetrics ? latestUsagePoint(usableMetrics.uptime) : null;

    const diskUsedMb = diskPoint ? normalizeToMb(diskPoint.value, diskPoint.unit) : null;
    const memUsedMb = memPoint ? normalizeToMb(memPoint.value, memPoint.unit) : null;

    const data = {
      hostname: vm?.hostname || null,
      plan: vm?.plan || null,
      state: vm?.state || null,
      disk: {
        totalMb: diskTotalMb,
        usedMb: diskUsedMb,
        usedPct: diskTotalMb && diskUsedMb != null ? Math.min(100, Math.round((diskUsedMb / diskTotalMb) * 1000) / 10) : null,
        raw: diskPoint,
      },
      memory: {
        totalMb: memTotalMb,
        usedMb: memUsedMb,
        usedPct: memTotalMb && memUsedMb != null ? Math.min(100, Math.round((memUsedMb / memTotalMb) * 1000) / 10) : null,
        raw: memPoint,
      },
      cpu: { cores: Number.isFinite(vm?.cpus) ? vm.cpus : null, raw: cpuPoint },
      uptime: uptimePoint,
      // Surfaced so the browser Network tab / UI can show the real cause
      // without needing shell access to the server's logs.
      metricsError,
      metricsEmpty: !metricsError && !!usableMetrics && !diskPoint && !memPoint,
      updatedAt: new Date().toISOString(),
    };

    statusCache.set(req.userId, { at: Date.now(), data });
    res.json(data);
  } catch (err) {
    console.error('Hostinger status fetch failed:', err.status, err.body);
    res.status(502).json({ error: 'Não foi possível obter dados da VPS neste momento.' });
  }
});

export default router;
