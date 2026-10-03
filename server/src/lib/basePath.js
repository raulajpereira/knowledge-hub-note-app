// Normalised BASE_PATH: "" when unset, otherwise "/v1"-style (leading slash,
// no trailing slash).
const raw = (process.env.BASE_PATH || '').trim().replace(/\/+$/, '');
export const basePath = raw && !raw.startsWith('/') ? `/${raw}` : raw;

// Upload URLs are stored in the DB as root-relative "/uploads/..." (avatars,
// logos, note images inside note content, attachments). Under a base path the
// browser has to request "<basePath>/uploads/..." instead, so JSON responses
// get the prefix added and JSON request bodies get it stripped again — the DB
// keeps the canonical form no matter which path the app is served from.
const OUTBOUND = /(^|[^\w/.-])\/uploads\//g;

function addPrefix(value) {
  if (typeof value === 'string') {
    return value.includes('/uploads/') ? value.replace(OUTBOUND, `$1${basePath}/uploads/`) : value;
  }
  if (Array.isArray(value)) return value.map(addPrefix);
  if (value && typeof value === 'object' && !(value instanceof Date) && !Buffer.isBuffer(value)) {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = addPrefix(v);
    return out;
  }
  return value;
}

function stripPrefix(value) {
  if (typeof value === 'string') {
    return value.includes(`${basePath}/uploads/`) ? value.split(`${basePath}/uploads/`).join('/uploads/') : value;
  }
  if (Array.isArray(value)) return value.map(stripPrefix);
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = stripPrefix(v);
    return out;
  }
  return value;
}

export function uploadsPrefixMiddleware(req, res, next) {
  if (!basePath) return next();
  if (req.body && typeof req.body === 'object') req.body = stripPrefix(req.body);
  const json = res.json.bind(res);
  // res.json → JSON.parse(JSON.stringify()) first so Prisma Decimals/Dates
  // etc. are already in their wire form before strings are rewritten.
  res.json = (body) => json(addPrefix(body === undefined ? body : JSON.parse(JSON.stringify(body))));
  next();
}
