// Alocações v2 — regression check of the 0050 conversion: weekly hours of each
// person from the old mg_allocs (old rule of store.tsx aWeek) against the new
// mg_bookings + mg_booking_days (src/lib/alloc.ts), from 6 months before to
// 12 months after this week. Differences in weeks with a national holiday on
// a weekday are expected (the new model gives holidays 0 h); anything else is
// listed. Read-only.
//
//   set -a; . /var/tmp/kh-v2.env; set +a; npx tsx scripts/alloc-regression.ts
import postgres from 'postgres';
import {
  bookingSeries,
  dnOf,
  holidayOf,
  isoOf,
  mondayOf,
  todayIso,
  type Absence,
  type Booking,
  type CalcEnv,
} from '../src/lib/alloc';

type Old = {
  id: string;
  person_id: string;
  from_date: string;
  to_date: string;
  hours: number;
  extra: { ovr?: Record<string, number | ''>; dov?: Record<string, number | ''> };
};

const url = process.env.DATABASE_ADMIN_URL;
if (!url) throw new Error('DATABASE_ADMIN_URL is required');
const sql = postgres(url, { max: 1, onnotice: () => {} });
const d2s = (d: unknown) => (d instanceof Date ? d.toISOString().slice(0, 10) : String(d));

try {
  const old =
    (await sql`select id, person_id, from_date::text, to_date::text, hours, extra from mg_allocs`) as unknown as Old[];
  const bks =
    await sql`select b.*, b.from_date::text f, b.to_date::text t from mg_bookings b where b.person_id is not null`;
  const days = await sql`select booking_id, day::text d, hours from mg_booking_days`;
  const abs = await sql`select person_id, type, from_date::text f, to_date::text t, hours from mg_absences`;
  const caps = await sql`select id, cap from mg_people`;
  const capOf = new Map(caps.map((r) => [r.id as string, Number(r.cap)]));
  const absBy = new Map<string, Absence[]>();
  for (const a of abs)
    absBy.set(a.person_id, [
      ...(absBy.get(a.person_id) ?? []),
      {
        id: '',
        person: a.person_id,
        type: a.type,
        from: a.f,
        to: a.t,
        hours: a.hours,
        note: '',
        ver: '',
      } as Absence,
    ]);
  const daysBy = new Map<string, Record<string, number>>();
  for (const r of days) {
    const m = daysBy.get(r.booking_id) ?? {};
    m[r.d] = Number(r.hours);
    daysBy.set(r.booking_id, m);
  }
  const env: CalcEnv = { weekly: (p) => capOf.get(p) ?? 40, absences: (p) => absBy.get(p) ?? [] };

  const W0 = mondayOf(dnOf(todayIso())) - 26 * 7;
  const W1 = mondayOf(dnOf(todayIso())) + 52 * 7;
  const key = (p: string, w: number) => `${p}|${w}`;
  // old weekly totals (store.tsx aWeek)
  const oldW = new Map<string, number>();
  for (const a of old) {
    const f = dnOf(d2s(a.from_date));
    const t = dnOf(d2s(a.to_date));
    for (let w = Math.max(W0, f); w <= Math.min(W1, t); w += 7) {
      const iso = isoOf(w);
      const ov = a.extra?.ovr?.[iso];
      const wv = ov != null && ov !== '' ? +ov : +a.hours || 0;
      const dov = a.extra?.dov ?? {};
      const has = [0, 1, 2, 3, 4].some((i) => dov[isoOf(w + i)] != null && dov[isoOf(w + i)] !== '');
      let v = wv;
      if (has)
        v =
          Math.round(
            [0, 1, 2, 3, 4].reduce((s, i) => {
              const x = dov[isoOf(w + i)];
              return s + (x != null && x !== '' ? +x : Math.round((wv / 5) * 10) / 10);
            }, 0) * 10,
          ) / 10;
      oldW.set(key(a.person_id, w), (oldW.get(key(a.person_id, w)) ?? 0) + v);
    }
  }
  // new weekly totals
  const newW = new Map<string, number>();
  for (const r of bks) {
    if (r.status === 'tentative') continue;
    const b: Booking = {
      id: r.id,
      person: r.person_id,
      project: r.project_id,
      role: r.role,
      status: r.status,
      from: r.f,
      to: r.t,
      mode: r.mode,
      value: Number(r.value),
      mask: r.mask,
      hol: r.hol,
      note: '',
      need: [],
      days: daysBy.get(r.id) ?? {},
      ver: '',
    };
    const s = bookingSeries(b, env);
    for (let i = 0; i < s.h.length; i++) {
      const n = s.from + i;
      if (n < W0 || n > W1 + 6 || !s.h[i]) continue;
      const k = key(b.person, mondayOf(n));
      newW.set(k, (newW.get(k) ?? 0) + s.h[i]!);
    }
  }
  const keys = new Set([...oldW.keys(), ...newW.keys()]);
  let same = 0;
  let hol = 0;
  let holH = 0;
  const other: string[] = [];
  let otherH = 0;
  for (const k of [...keys].sort()) {
    const [p, w] = k.split('|') as [string, string];
    const o = Math.round((oldW.get(k) ?? 0) * 10) / 10;
    const n = Math.round((newW.get(k) ?? 0) * 10) / 10;
    if (Math.abs(o - n) < 0.05) {
      same++;
      continue;
    }
    const wn = +w;
    const hd = [0, 1, 2, 3, 4].map((i) => holidayOf(wn + i)).filter(Boolean);
    if (hd.length && n < o) {
      hol++;
      holH += o - n;
    } else {
      otherH += n - o;
      other.push(
        `  ${isoOf(wn)}  person ${p.slice(0, 8)}  old ${o}h  new ${n}h  (${n - o > 0 ? '+' : ''}${Math.round((n - o) * 10) / 10}h)`,
      );
    }
  }
  console.log(`Alocações v2 — regression check ${isoOf(W0)} … ${isoOf(W1 + 6)} (−6 / +12 months)`);
  console.log(
    `old allocations: ${old.length} · new bookings with a person: ${bks.length} · typed days: ${days.length}`,
  );
  console.log(`person-weeks compared: ${keys.size}`);
  console.log(`  equal:                          ${same}`);
  console.log(
    `  differ, week with a holiday:    ${hol}  (expected; ${Math.round(holH * 10) / 10}h less in total)`,
  );
  console.log(`  differ, other:                  ${other.length}  (${Math.round(otherH * 10) / 10}h net)`);
  for (const l of other.slice(0, 40)) console.log(l);
  if (other.length > 40) console.log(`  … and ${other.length - 40} more`);
} finally {
  await sql.end();
}
