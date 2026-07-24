const BASE = 'https://developers.hostinger.com/api';

async function hostingerFetch(token, path) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });
  const text = await res.text();
  if (!res.ok) {
    const err = new Error(`Hostinger API responded ${res.status}`);
    err.status = res.status;
    err.body = text;
    throw err;
  }
  return text ? JSON.parse(text) : null;
}

export function listVirtualMachines(token) {
  return hostingerFetch(token, '/vps/v1/virtual-machines');
}

export function getVirtualMachine(token, vmId) {
  return hostingerFetch(token, `/vps/v1/virtual-machines/${vmId}`);
}

export function getVmMetrics(token, vmId, { minutes = 30 } = {}) {
  const dateTo = new Date();
  const dateFrom = new Date(dateTo.getTime() - minutes * 60 * 1000);
  const qs = new URLSearchParams({ dateFrom: dateFrom.toISOString(), dateTo: dateTo.toISOString() });
  return hostingerFetch(token, `/vps/v1/virtual-machines/${vmId}/metrics?${qs.toString()}`);
}

const UNIT_TO_MB = {
  byte: 1 / 1048576, bytes: 1 / 1048576, b: 1 / 1048576,
  kb: 1 / 1024, kilobyte: 1 / 1024, kilobytes: 1 / 1024,
  mb: 1, megabyte: 1, megabytes: 1,
  gb: 1024, gigabyte: 1024, gigabytes: 1024,
  tb: 1048576, terabyte: 1048576, terabytes: 1048576,
};

// Best-effort unit normalization — Hostinger's metrics unit strings aren't
// fully pinned down in public docs, so unrecognized units return null and
// the caller falls back to showing the raw value + unit instead of a %.
export function normalizeToMb(value, unit) {
  const factor = UNIT_TO_MB[String(unit || '').trim().toLowerCase()];
  if (factor == null || !Number.isFinite(value)) return null;
  return value * factor;
}

// Metrics resources are { unit, usage: { [unixTimestamp]: value } } — take the latest point.
export function latestUsagePoint(metricsResource) {
  if (!metricsResource?.usage || typeof metricsResource.usage !== 'object') return null;
  const entries = Object.entries(metricsResource.usage);
  if (!entries.length) return null;
  entries.sort((a, b) => Number(a[0]) - Number(b[0]));
  const [ts, value] = entries[entries.length - 1];
  return { timestamp: Number(ts), value: Number(value), unit: metricsResource.unit };
}
