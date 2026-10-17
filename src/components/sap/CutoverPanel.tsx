'use client';

import { useMemo, useState } from 'react';
import { useI18n } from '@/i18n/client';
import { FN, FN_RBG, fnBlankRow, type FnRow } from '@/lib/functional';
import { blockers, depsOf, durOf, fmtDur, isBlocked, phaseOf, plan, wouldCycle } from '@/lib/cutover';
import { useConfirm, usePersistentState } from '@/components/ui';

// Cutover runbook: activities grouped by phase with their predecessors
// ("depende de"), planned start, duration, owner and status. An activity is
// "Bloqueada" until all its predecessors are done (the status can still be
// forced, after a confirmation). The critical path (longest chain of planned
// durations) is highlighted, with the planned end against now; the timeline
// draws the activities as bars with their dependency arrows.

type Lbl = { pt: string; en: string };
const ST = FN.fn_cut.rows.status!;
const CRIT = 'oklch(0.68 0.2 25)';

export function CutoverPanel({
  rows,
  golive,
  onChange,
  tr,
}: {
  rows: FnRow[];
  golive: string;
  onChange: (rows: FnRow[], delay?: number) => void;
  tr: (o: Lbl) => string;
}) {
  const { t, lang } = useI18n();
  const confirm = useConfirm();
  const [view, setView] = usePersistentState<'list' | 'timeline'>('fn.cutView', 'list');
  const [now] = useState(() => Date.now());
  const origin = useMemo(() => {
    const g = golive ? new Date(`${golive}T00:00:00`).getTime() : NaN;
    return Number.isFinite(g) ? g : new Date(new Date().toDateString()).getTime();
  }, [golive]);
  const P = useMemo(() => plan(rows, origin, now), [rows, origin, now]);
  const num = new Map(rows.map((r, i) => [r.id, i + 1]));
  const byId = new Map(rows.map((r) => [r.id, r]));
  const dt = (ms: number) =>
    new Date(ms).toLocaleString(lang === 'en' ? 'en-GB' : 'pt-PT', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });

  const set = (id: string | undefined, patch: FnRow, delay?: number) =>
    onChange(
      rows.map((r) => (r.id === id ? { ...r, ...patch } : r)),
      delay,
    );
  const setSt = async (r: FnRow, st: string) => {
    if ((st === 'run' || st === 'done') && isBlocked(rows, r)) {
      const bs = blockers(rows, r);
      const ok = await confirm({
        title: t('cu_blockedTitle'),
        body: t('cu_blockedBody').replace(
          '{x}',
          bs.map((b) => `#${num.get(b.id)} ${(b.act ?? '').slice(0, 60)}`).join(', '),
        ),
        confirmLabel: t('cu_override'),
        cancelLabel: t('tr_cancel'),
      });
      if (!ok) return;
    }
    set(r.id, { st }, 0);
  };
  const addRow = (phase: string) => {
    const r = { ...fnBlankRow('fn_cut'), phase };
    onChange([...rows, r], 0);
  };
  const phases = [...new Set(rows.map(phaseOf))];
  const groups = phases.map((p) => ({ p, rs: rows.filter((r) => phaseOf(r) === p) }));
  const late = P ? rows.filter((r) => P.rows.get(r.id!)?.late) : [];
  const risk = P ? rows.filter((r) => P.rows.get(r.id!)?.risk) : [];
  const blocked = rows.filter((r) => isBlocked(rows, r));
  const allDone = rows.length > 0 && rows.every((r) => r.st === 'done' || r.st === 'skip');
  const endState = !P
    ? ''
    : allDone
      ? 'done'
      : now > P.end
        ? 'late'
        : late.length || risk.length
          ? 'risk'
          : 'ok';

  return (
    <div className="kh-cu">
      <div className="kh-cu-sum">
        <div>
          <span>{t('cu_end')}</span>
          <b>{P ? dt(P.end) : '—'}</b>
        </div>
        <div>
          <span>{t('cu_crit')}</span>
          <b>{P ? `${P.path.length} · ${fmtDur(Math.round((P.end - P.start) / 60000))}` : '—'}</b>
        </div>
        <div>
          <span>{t('cu_blocked')}</span>
          <b>{blocked.length}</b>
        </div>
        <div className="kh-cu-state" data-state={endState}>
          {endState === 'late'
            ? t('cu_stLate')
            : endState === 'risk'
              ? t('cu_stRisk').replace('{n}', String(late.length + risk.length))
              : endState === 'done'
                ? t('cu_stDone')
                : t('cu_stOk')}
        </div>
        <div className="kh-sap-seg kh-cu-seg" role="radiogroup" aria-label={t('sn_view')}>
          {(['list', 'timeline'] as const).map((v) => (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={view === v}
              data-on={view === v || undefined}
              onClick={() => setView(v)}
            >
              {t(v === 'list' ? 's_list' : 'cu_timeline')}
            </button>
          ))}
        </div>
      </div>
      {!P && <div className="kh-fn-conflict">{t('cutover_cycle')}</div>}
      {view === 'timeline' && P ? (
        <Timeline rows={rows} P={P} now={now} num={num} dt={dt} />
      ) : (
        <div className="kh-cu-list">
          {groups.map(({ p, rs }) => (
            <div key={p || '-'} className="kh-cu-phase">
              <div className="kh-cu-phead">
                <span>{p || t('cu_noPhase')}</span>
                <small>
                  {rs.filter((r) => r.st === 'done' || r.st === 'skip').length}/{rs.length}
                </small>
                <button type="button" disabled={rows.length >= 500} onClick={() => addRow(p)}>
                  + {t('fn_addRow')}
                </button>
              </div>
              {rs.map((r) => {
                const n = num.get(r.id)!;
                const pl = P?.rows.get(r.id!);
                const bl = isBlocked(rows, r);
                const deps = depsOf(r);
                const cand = rows.filter(
                  (x) => x.id !== r.id && !deps.includes(x.id!) && !wouldCycle(rows, r.id!, x.id!),
                );
                return (
                  <div
                    key={r.id}
                    className="kh-cu-row"
                    data-crit={pl?.critical || undefined}
                    data-blocked={bl || undefined}
                    data-st={r.st || 'todo'}
                  >
                    <span className="kh-cu-n">#{n}</span>
                    <div className="kh-cu-main">
                      <input
                        className="kh-fn-cin kh-cu-act"
                        value={r.act ?? ''}
                        maxLength={2000}
                        aria-label={`${tr(FN.fn_cut.rows.cols[0]![1])} ${n}`}
                        placeholder={tr(FN.fn_cut.rows.cols[0]![1])}
                        onChange={(e) => set(r.id, { act: e.target.value.replace(/[\r\n]/g, ' ') })}
                      />
                      <div className="kh-cu-deps">
                        {pl?.critical && (
                          <span className="kh-cu-tag kh-cu-tag--crit">{t('cu_critShort')}</span>
                        )}
                        {bl && <span className="kh-cu-tag kh-cu-tag--blk">{t('cu_blockedOne')}</span>}
                        {pl?.late && <span className="kh-cu-tag kh-cu-tag--late">{t('cu_late')}</span>}
                        {!pl?.late && pl?.risk && (
                          <span className="kh-cu-tag kh-cu-tag--risk">{t('cu_risk')}</span>
                        )}
                        {deps.length > 0 && <span className="kh-cu-dl">{t('cu_dependsOn')}</span>}
                        {deps.map((d) => {
                          const x = byId.get(d);
                          const fin = x && (x.st === 'done' || x.st === 'skip');
                          return (
                            <span key={d} className="kh-cu-dep" data-done={fin || undefined} title={x?.act}>
                              #{num.get(d) ?? '?'}
                              <button
                                type="button"
                                aria-label={`${t('cu_removeDep')} #${num.get(d)}`}
                                onClick={() => set(r.id, { dep: deps.filter((y) => y !== d).join(',') }, 0)}
                              >
                                ×
                              </button>
                            </span>
                          );
                        })}
                        {deps.length < 50 && (
                          <select
                            className="kh-cu-adddep"
                            value=""
                            aria-label={`${t('cu_addDep')} ${n}`}
                            onChange={(e) =>
                              e.target.value && set(r.id, { dep: [...deps, e.target.value].join(',') }, 0)
                            }
                          >
                            <option value="">+ {t('cu_addDep')}</option>
                            {cand.map((x) => (
                              <option key={x.id} value={x.id}>
                                #{num.get(x.id)} {(x.act ?? '').slice(0, 70)}
                              </option>
                            ))}
                          </select>
                        )}
                      </div>
                    </div>
                    <label className="kh-cu-f">
                      <span>{t('cu_phase')}</span>
                      <input
                        className="kh-fn-cin"
                        value={r.phase ?? phaseOf(r)}
                        maxLength={60}
                        list="kh-cu-phases"
                        onChange={(e) => set(r.id, { phase: e.target.value.replace(/[\r\n]/g, ' ') })}
                      />
                    </label>
                    <label className="kh-cu-f">
                      <span>{tr(FN.fn_cut.rows.cols[2]![1])}</span>
                      <input
                        className="kh-fn-cin"
                        value={r.who ?? ''}
                        maxLength={2000}
                        onChange={(e) => set(r.id, { who: e.target.value.replace(/[\r\n]/g, ' ') })}
                      />
                    </label>
                    <label className="kh-cu-f">
                      <span>{t('cu_start')}</span>
                      <input
                        className="kh-fn-cin kh-cu-dt"
                        type="datetime-local"
                        value={r.start ?? ''}
                        title={pl && !r.start ? `${t('cu_earliest')} ${dt(pl.es)}` : undefined}
                        onChange={(e) => set(r.id, { start: e.target.value }, 0)}
                      />
                    </label>
                    <label className="kh-cu-f kh-cu-f--dur">
                      <span>{t('cu_dur')}</span>
                      <input
                        className="kh-fn-cin"
                        type="number"
                        min={0}
                        step={0.25}
                        value={durOf(r) ? String(Math.round((durOf(r) / 60) * 100) / 100) : ''}
                        onChange={(e) => {
                          const h = Number(e.target.value);
                          set(r.id, {
                            dur: e.target.value && h > 0 ? String(Math.min(999999, Math.round(h * 60))) : '',
                          });
                        }}
                      />
                    </label>
                    <label className="kh-cu-f kh-cu-f--st">
                      <span>{tr(FN.fn_cut.rows.cols[3]![1])}</span>
                      <select
                        className="kh-fn-rst"
                        value={r.st || 'todo'}
                        aria-label={`${tr(FN.fn_cut.rows.cols[3]![1])} ${n}`}
                        style={{
                          backgroundColor: bl
                            ? 'oklch(0.6 0.12 300 / .55)'
                            : (FN_RBG[r.st ?? ''] ?? 'rgba(255,255,255,.1)'),
                        }}
                        onChange={(e) => void setSt(r, e.target.value)}
                      >
                        {ST.map(([k, l]) => (
                          <option key={k} value={k}>
                            {k === 'todo' && bl ? t('cu_blockedOne') : tr(l)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="kh-cu-plan">
                      {pl && (
                        <span title={t('cu_planned')}>
                          {dt(pl.es)} → {dt(pl.ef)}
                        </span>
                      )}
                      <span>{fmtDur(durOf(r))}</span>
                    </div>
                    <button
                      type="button"
                      className="kh-fn-rdel"
                      title={t('fn_delRow')}
                      aria-label={`${t('fn_delRow')} ${n}`}
                      onClick={() =>
                        onChange(
                          rows
                            .filter((x) => x.id !== r.id)
                            .map((x) =>
                              depsOf(x).includes(r.id!)
                                ? {
                                    ...x,
                                    dep: depsOf(x)
                                      .filter((d) => d !== r.id)
                                      .join(','),
                                  }
                                : x,
                            ),
                          0,
                        )
                      }
                    >
                      ×
                    </button>
                  </div>
                );
              })}
            </div>
          ))}
          <datalist id="kh-cu-phases">
            {phases.filter(Boolean).map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
          <div className="kh-cu-foot">
            <button type="button" disabled={rows.length >= 500} onClick={() => addRow(phases.at(-1) ?? '')}>
              + {t('fn_addRow')}
            </button>
          </div>
          {!rows.length && <div className="kh-fn-norows">{t('fn_noRows')}</div>}
        </div>
      )}
    </div>
  );
}

function Timeline({
  rows,
  P,
  now,
  num,
  dt,
}: {
  rows: FnRow[];
  P: NonNullable<ReturnType<typeof plan>>;
  now: number;
  num: Map<string | undefined, number>;
  dt: (ms: number) => string;
}) {
  const { t } = useI18n();
  const LBL = 260;
  const RH = 28;
  const W = 1100;
  const span = Math.max(P.end - P.start, 3600_000);
  const x = (ms: number) => LBL + ((ms - P.start) / span) * (W - LBL - 20);
  const order = [...rows].sort((a, b) => {
    const pa = P.rows.get(a.id!)!;
    const pb = P.rows.get(b.id!)!;
    return pa.es - pb.es || (num.get(a.id) ?? 0) - (num.get(b.id) ?? 0);
  });
  const yOf = new Map(order.map((r, i) => [r.id, 30 + i * RH]));
  const H = 30 + order.length * RH + 10;
  // ticks: about 8 across the span
  const step =
    [3600e3, 3 * 3600e3, 6 * 3600e3, 12 * 3600e3, 86400e3, 7 * 86400e3].find((s) => span / s <= 10) ??
    30 * 86400e3;
  const ticks: number[] = [];
  for (let s = Math.ceil(P.start / step) * step; s <= P.end; s += step) ticks.push(s);
  const crit = new Set(P.path);
  return (
    <div className="kh-cu-tl">
      <svg
        width={W}
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: '100%', minWidth: 760, height: 'auto' }}
        role="img"
        aria-label={t('cu_timeline')}
      >
        <defs>
          <marker
            id="kh-cu-ar"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto"
          >
            <path d="M0 0L10 5L0 10z" fill="#fbf8f5" fillOpacity="0.6" />
          </marker>
          <marker
            id="kh-cu-arc"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto"
          >
            <path d="M0 0L10 5L0 10z" fill={CRIT} />
          </marker>
        </defs>
        {ticks.map((s) => (
          <g key={s}>
            <line x1={x(s)} x2={x(s)} y1={22} y2={H} stroke="#fff" strokeOpacity="0.08" />
            <text x={x(s) + 3} y={16} fontSize="10" fill="#fbf8f5" fillOpacity="0.6">
              {dt(s)}
            </text>
          </g>
        ))}
        {order.map((r) => {
          const p = P.rows.get(r.id!)!;
          const y = yOf.get(r.id)!;
          const c = crit.has(r.id!);
          const done = r.st === 'done' || r.st === 'skip';
          const w = Math.max(x(p.ef) - x(p.es), 4);
          return (
            <g key={r.id} data-crit={c || undefined} className="kh-cu-bar">
              <text x={8} y={y + 17} fontSize="11.5" fill="#fbf8f5" fillOpacity={done ? 0.55 : 0.9}>
                #{num.get(r.id)} {(r.act ?? '').slice(0, 36)}
              </text>
              <rect
                x={x(p.es)}
                y={y + 5}
                width={w}
                height={RH - 10}
                rx="5"
                fill={c ? CRIT : done ? 'oklch(0.74 0.14 150)' : p.late ? 'oklch(0.8 0.15 60)' : '#fbf8f5'}
                fillOpacity={c ? 0.95 : done ? 0.7 : 0.35}
                stroke={c ? CRIT : 'none'}
              />
            </g>
          );
        })}
        {order.flatMap((r) =>
          depsOf(r).map((d) => {
            const a = P.rows.get(d);
            const b = P.rows.get(r.id!);
            if (!a || !b) return null;
            const ya = yOf.get(d)! + RH / 2;
            const yb = yOf.get(r.id)! + RH / 2;
            const xa = x(a.ef);
            const xb = x(b.es);
            const c = crit.has(d) && crit.has(r.id!);
            return (
              <path
                key={`${d}>${r.id}`}
                d={`M${xa} ${ya} C${xa + 14} ${ya}, ${xb - 14} ${yb}, ${xb - 1} ${yb}`}
                fill="none"
                stroke={c ? CRIT : '#fbf8f5'}
                strokeOpacity={c ? 1 : 0.4}
                strokeWidth={c ? 2 : 1.2}
                markerEnd={`url(#${c ? 'kh-cu-arc' : 'kh-cu-ar'})`}
              />
            );
          }),
        )}
        {now >= P.start && now <= P.end + span * 0.05 && (
          <g>
            <line x1={x(now)} x2={x(now)} y1={20} y2={H} stroke="oklch(0.85 0.15 85)" strokeWidth="1.5" />
            <text x={x(now) + 4} y={30} fontSize="10" fontWeight="700" fill="oklch(0.85 0.15 85)">
              {t('cu_now')}
            </text>
          </g>
        )}
      </svg>
      <div className="kh-cu-legend">
        <span>
          <i style={{ background: CRIT }} />
          {t('cu_crit')}
        </span>
        <span>
          <i style={{ background: 'oklch(0.74 0.14 150)' }} />
          {t('cu_legDone')}
        </span>
        <span>
          <i style={{ background: 'oklch(0.8 0.15 60)' }} />
          {t('cu_late')}
        </span>
      </div>
    </div>
  );
}
