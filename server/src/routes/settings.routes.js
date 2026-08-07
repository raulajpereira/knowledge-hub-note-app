import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadsRoot = path.join(__dirname, '..', '..', 'uploads');

const ACCENT_COLORS = ['purple', 'blue', 'green', 'yellow', 'pink', 'orange', 'red', 'teal'];
// Blocks can live in either column (the user drags freely between them), so
// validation only checks each key is a known block and appears at most once
// across both columns combined — not which column it's in.
const HOME_BLOCK_KEYS = new Set(['quickCapture', 'myTasks', 'issuesByStatus', 'recentNotes', 'favorites', 'resurfacing', 'weeklySummary', 'sapNewsTeaser', 'vpsDiskUsage', 'tagsHeatmap']);

function makeUpload(subdir) {
  const storage = multer.diskStorage({
    destination: path.join(uploadsRoot, subdir),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname) || '.png';
      cb(null, `${req.userId}-${crypto.randomUUID()}${ext}`);
    },
  });
  return multer({
    storage,
    limits: { fileSize: 3 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
      if (!/^image\/(png|jpe?g|webp|svg\+xml)$/.test(file.mimetype)) {
        return cb(new Error('Only PNG, JPG, WEBP or SVG images are allowed'));
      }
      cb(null, true);
    },
  });
}

const uploadLogo = makeUpload('logos');
const uploadAvatar = makeUpload('avatars');
const uploadFavicon = makeUpload('favicons');

const router = Router();
router.use(requireAuth);

router.get('/', async (req, res) => {
  const settings = await prisma.settings.upsert({
    where: { userId: req.userId },
    update: {},
    create: { userId: req.userId },
  });
  res.json({ settings });
});

const FONT_FAMILIES = ['inter', 'grotesk', 'system', 'serif', 'mono', 'poppins', 'lora', 'firacode', 'playfair'];
const FONT_SCALES = ['small', 'medium', 'large'];
const RADIUS_STYLES = ['sharp', 'default', 'round'];
const DENSITY_OPTIONS = ['comfortable', 'compact'];
const LANGUAGES = ['pt', 'en'];

router.patch('/', async (req, res) => {
  const {
    theme, accentColor, accentHue, fontFamily, fontScale, radiusStyle, density, language,
    vaultAutoLockSeconds, issueStatuses, trashRetentionDays, sidebarLayout, homeLayout, sidebarCollapsed, sidebarWidth,
    columnWidths, panelWidths, continueDismissed,
  } = req.body || {};
  const data = {};
  if (theme !== undefined) {
    if (!['dark', 'light'].includes(theme)) return res.status(400).json({ error: 'Invalid theme' });
    data.theme = theme;
  }
  if (accentColor !== undefined) {
    if (!ACCENT_COLORS.includes(accentColor)) return res.status(400).json({ error: 'Invalid accent color' });
    data.accentColor = accentColor;
  }
  if (accentHue !== undefined) {
    const n = Number(accentHue);
    if (accentHue !== null && (!Number.isFinite(n) || n < 0 || n > 360)) {
      return res.status(400).json({ error: 'accentHue must be a number between 0 and 360' });
    }
    data.accentHue = accentHue === null ? null : Math.round(n);
  }
  if (fontFamily !== undefined) {
    if (fontFamily !== null && !FONT_FAMILIES.includes(fontFamily)) return res.status(400).json({ error: 'Invalid fontFamily' });
    data.fontFamily = fontFamily;
  }
  if (fontScale !== undefined) {
    if (!FONT_SCALES.includes(fontScale)) return res.status(400).json({ error: 'Invalid fontScale' });
    data.fontScale = fontScale;
  }
  if (radiusStyle !== undefined) {
    if (!RADIUS_STYLES.includes(radiusStyle)) return res.status(400).json({ error: 'Invalid radiusStyle' });
    data.radiusStyle = radiusStyle;
  }
  if (density !== undefined) {
    if (!DENSITY_OPTIONS.includes(density)) return res.status(400).json({ error: 'Invalid density' });
    data.density = density;
  }
  if (language !== undefined) {
    if (!LANGUAGES.includes(language)) return res.status(400).json({ error: 'Invalid language' });
    data.language = language;
  }
  if (vaultAutoLockSeconds !== undefined) {
    const n = Number(vaultAutoLockSeconds);
    if (!Number.isInteger(n) || n < 5 || n > 3600) {
      return res.status(400).json({ error: 'Auto-lock duration must be an integer between 5 and 3600 seconds' });
    }
    data.vaultAutoLockSeconds = n;
  }
  if (issueStatuses !== undefined) {
    const valid =
      Array.isArray(issueStatuses) &&
      issueStatuses.length > 0 &&
      issueStatuses.every((s) => s && typeof s.name === 'string' && s.name.trim() && Number.isFinite(s.hue));
    if (!valid) return res.status(400).json({ error: 'issueStatuses must be a non-empty array of { name, hue }' });
    data.issueStatuses = issueStatuses.map((s) => ({ name: s.name.trim(), hue: s.hue }));
  }
  if (trashRetentionDays !== undefined) {
    const n = Number(trashRetentionDays);
    if (!Number.isInteger(n) || n < 0 || n > 365) {
      return res.status(400).json({ error: 'trashRetentionDays must be an integer between 0 and 365' });
    }
    data.trashRetentionDays = n;
  }
  if (sidebarLayout !== undefined) {
    // Deliberately doesn't check `key` against a fixed catalog of known nav
    // items — that list only exists client-side (client/src/lib/sidebarItems.js)
    // and changes every time a page is added, so mirroring it here as an
    // allowlist meant every new page silently broke saving this until the
    // duplicate got updated too. This is just a display preference (order/
    // visibility/labels), not a permission, so validating shape rather than
    // a specific set of keys is enough: resolveSidebarLayout() on the client
    // already drops any key it doesn't recognize.
    const validLabel = (v) => v === undefined || typeof v === 'string';
    const isSpacer = (s) => s?.type === 'spacer' && typeof s.key === 'string' && s.key.startsWith('spacer-');
    // Collapsible sidebar groups are two boundary markers (group-start /
    // group-end) sharing a groupId — everything between them (by array
    // position) counts as the group's contents. Same flat-array trick as
    // spacers, just paired, which is what lets nesting (a group inside a
    // group) fall out for free without a separate tree shape here.
    const isGroupStart = (s) => s?.type === 'group-start' && typeof s.key === 'string' && typeof s.groupId === 'string' && s.groupId.length > 0;
    const isGroupEnd = (s) => s?.type === 'group-end' && typeof s.key === 'string' && typeof s.groupId === 'string' && s.groupId.length > 0;
    const valid =
      sidebarLayout === null ||
      (Array.isArray(sidebarLayout) &&
        sidebarLayout.every((s) => s && (isSpacer(s) || isGroupStart(s) || isGroupEnd(s) || (typeof s.key === 'string' && s.key.length > 0 && validLabel(s.labelPt) && validLabel(s.labelEn)))));
    if (!valid) return res.status(400).json({ error: 'sidebarLayout must be an array of { key, hidden?, labelPt?, labelEn? }, spacer entries { key, type: "spacer" }, or group boundary entries { key, type: "group-start"|"group-end", groupId }' });
    data.sidebarLayout =
      sidebarLayout === null
        ? null
        : sidebarLayout.map((s) => {
            if (isSpacer(s)) return { key: s.key, type: 'spacer' };
            if (isGroupStart(s)) {
              return {
                key: s.key, type: 'group-start', groupId: s.groupId, collapsed: !!s.collapsed,
                labelPt: s.labelPt?.trim().slice(0, 40) || undefined,
                labelEn: s.labelEn?.trim().slice(0, 40) || undefined,
              };
            }
            if (isGroupEnd(s)) return { key: s.key, type: 'group-end', groupId: s.groupId };
            return {
              key: s.key,
              hidden: !!s.hidden,
              labelPt: s.labelPt?.trim().slice(0, 40) || undefined,
              labelEn: s.labelEn?.trim().slice(0, 40) || undefined,
            };
          });
  }
  if (homeLayout !== undefined) {
    const isArr = (v) => Array.isArray(v);
    const hiddenArr = Array.isArray(homeLayout?.hidden) ? homeLayout.hidden : [];
    const allKeys = homeLayout ? [...(homeLayout.left || []), ...(homeLayout.right || []), ...hiddenArr] : [];
    const valid =
      homeLayout === null ||
      (homeLayout &&
        isArr(homeLayout.left) &&
        isArr(homeLayout.right) &&
        (homeLayout.hidden === undefined || isArr(homeLayout.hidden)) &&
        allKeys.every((k) => HOME_BLOCK_KEYS.has(k)) &&
        new Set(allKeys).size === allKeys.length);
    if (!valid) return res.status(400).json({ error: 'homeLayout must be { left: [...], right: [...], hidden?: [...] } with known, non-duplicate block keys' });
    data.homeLayout = homeLayout === null ? null : { left: homeLayout.left, right: homeLayout.right, hidden: hiddenArr };
  }
  if (sidebarCollapsed !== undefined) data.sidebarCollapsed = !!sidebarCollapsed;
  if (sidebarWidth !== undefined) {
    if (sidebarWidth !== null) {
      const n = Number(sidebarWidth);
      if (!Number.isFinite(n) || n < 200 || n > 480) return res.status(400).json({ error: 'sidebarWidth must be between 200 and 480' });
      data.sidebarWidth = Math.round(n);
    } else {
      data.sidebarWidth = null;
    }
  }
  if (columnWidths !== undefined) {
    const valid =
      columnWidths === null ||
      (columnWidths &&
        typeof columnWidths === 'object' &&
        !Array.isArray(columnWidths) &&
        Object.values(columnWidths).every(
          (page) =>
            page &&
            typeof page === 'object' &&
            !Array.isArray(page) &&
            Object.values(page).every((w) => Number.isFinite(w))
        ));
    if (!valid) return res.status(400).json({ error: 'columnWidths must be { [pageKey]: { [columnKey]: number } }' });
    data.columnWidths =
      columnWidths === null
        ? null
        : Object.fromEntries(
            Object.entries(columnWidths).map(([page, cols]) => [
              page,
              Object.fromEntries(Object.entries(cols).map(([key, w]) => [key, Math.round(w)])),
            ])
          );
  }
  if (panelWidths !== undefined) {
    const valid =
      panelWidths === null ||
      (panelWidths &&
        typeof panelWidths === 'object' &&
        !Array.isArray(panelWidths) &&
        Object.values(panelWidths).every((w) => Number.isFinite(w)));
    if (!valid) return res.status(400).json({ error: 'panelWidths must be { [key]: number }' });
    data.panelWidths =
      panelWidths === null ? null : Object.fromEntries(Object.entries(panelWidths).map(([key, w]) => [key, Math.round(w)]));
  }
  if (continueDismissed !== undefined) {
    const valid =
      continueDismissed === null ||
      (continueDismissed &&
        typeof continueDismissed === 'object' &&
        !Array.isArray(continueDismissed) &&
        Object.values(continueDismissed).every((v) => typeof v === 'string'));
    if (!valid) return res.status(400).json({ error: 'continueDismissed must be { [key]: isoDateString }' });
    data.continueDismissed = continueDismissed;
  }
  const settings = await prisma.settings.upsert({
    where: { userId: req.userId },
    update: data,
    create: { userId: req.userId, ...data },
  });
  res.json({ settings });
});

router.post('/logo', uploadLogo.single('logo'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const logoUrl = `/uploads/logos/${req.file.filename}`;
  const settings = await prisma.settings.upsert({
    where: { userId: req.userId },
    update: { logoUrl },
    create: { userId: req.userId, logoUrl },
  });
  res.json({ settings });
});

router.delete('/logo', async (req, res) => {
  const settings = await prisma.settings.upsert({
    where: { userId: req.userId },
    update: { logoUrl: null },
    create: { userId: req.userId },
  });
  res.json({ settings });
});

router.post('/favicon', uploadFavicon.single('favicon'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const faviconUrl = `/uploads/favicons/${req.file.filename}`;
  const settings = await prisma.settings.upsert({
    where: { userId: req.userId },
    update: { faviconUrl },
    create: { userId: req.userId, faviconUrl },
  });
  res.json({ settings });
});

router.delete('/favicon', async (req, res) => {
  const settings = await prisma.settings.upsert({
    where: { userId: req.userId },
    update: { faviconUrl: null },
    create: { userId: req.userId },
  });
  res.json({ settings });
});

router.post('/avatar', uploadAvatar.single('avatar'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const avatarUrl = `/uploads/avatars/${req.file.filename}`;
  const settings = await prisma.settings.upsert({
    where: { userId: req.userId },
    update: { avatarUrl },
    create: { userId: req.userId, avatarUrl },
  });
  res.json({ settings });
});

export default router;
