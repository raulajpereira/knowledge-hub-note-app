// "Mapa da paisagem" (Sistemas SAP): the systems of each landscape (client +
// track) in DEV → QAS → PRD lanes, and the transport routes between them with
// the requests waiting on each one. Pure functions, shared by the map and tests.
import { ENV_ORDER, type SapEnv } from './sap';

export type LSystem = {
  id: string;
  sid: string;
  name: string;
  env: SapEnv;
  clientId: string | null;
  mandt: string;
  track: string;
  nextId: string | null;
};
export type LTransport = {
  id: string;
  systemId: string | null;
  releasedAt: string | null;
  qasAt: string | null;
  prdAt: string | null;
  junkAt: string | null;
};
export type Landscape = { key: string; clientId: string | null; track: string; systems: LSystem[] };
export type Route = { from: string; to: string; waiting: string[] };

const NEXT_ROLE: Partial<Record<SapEnv, SapEnv>> = { DEV: 'QAS', QAS: 'PRD' };
export const landscapeKey = (s: Pick<LSystem, 'clientId' | 'track'>) =>
  `${s.clientId ?? ''}|${s.track.trim().toLowerCase()}`;

/** Landscapes (one per client and track), systems by role and SID. */
export function landscapes(systems: LSystem[]): Landscape[] {
  const m = new Map<string, Landscape>();
  for (const s of systems) {
    const k = landscapeKey(s);
    const l = m.get(k) ?? { key: k, clientId: s.clientId, track: s.track.trim(), systems: [] };
    l.systems.push(s);
    m.set(k, l);
  }
  for (const l of m.values())
    l.systems.sort((a, b) => ENV_ORDER[a.env] - ENV_ORDER[b.env] || a.sid.localeCompare(b.sid));
  return [...m.values()];
}

/**
 * Where a system's transports go next: its own target when set, otherwise the
 * first system of the next role (DEV → QAS → PRD) in the same landscape.
 */
export function nextSystem(s: LSystem, systems: LSystem[]): LSystem | null {
  if (s.nextId) return systems.find((x) => x.id === s.nextId && x.id !== s.id) ?? null;
  const role = NEXT_ROLE[s.env];
  if (!role) return null;
  const k = landscapeKey(s);
  return (
    systems
      .filter((x) => x.env === role && landscapeKey(x) === k)
      .sort((a, b) => a.sid.localeCompare(b.sid))[0] ?? null
  );
}

/** The route of a request: its system, then each next one (no loops, max 6 stops). */
export function routeOf(systemId: string | null, systems: LSystem[]): LSystem[] {
  const out: LSystem[] = [];
  let cur = systems.find((s) => s.id === systemId) ?? null;
  while (cur && out.length < 6 && !out.includes(cur)) {
    out.push(cur);
    cur = nextSystem(cur, systems);
  }
  return out;
}

/**
 * Every route edge between systems, with the requests waiting to be imported
 * into its target: released and not yet in QAS → first edge; in QAS and not yet
 * in PRD → second edge. Requests in the bin ("lixo") are left out.
 */
export function routes(systems: LSystem[], transports: LTransport[]): Route[] {
  const edges = new Map<string, Route>();
  const edge = (a: LSystem, b: LSystem) => {
    const k = `${a.id}>${b.id}`;
    let e = edges.get(k);
    if (!e) edges.set(k, (e = { from: a.id, to: b.id, waiting: [] }));
    return e;
  };
  for (const s of systems) {
    const n = nextSystem(s, systems);
    if (n) edge(s, n);
  }
  for (const x of transports) {
    if (x.junkAt || !x.releasedAt || x.prdAt) continue;
    const r = routeOf(x.systemId, systems);
    const step = x.qasAt ? 1 : 0;
    const a = r[step];
    const b = r[step + 1];
    if (a && b) edge(a, b).waiting.push(x.id);
  }
  return [...edges.values()];
}
