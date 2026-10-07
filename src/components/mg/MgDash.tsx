'use client';

import { useState } from 'react';
import { wLbl, wLblY, type MgPerson } from '@/lib/mg';
import { usePersistentState } from '@/components/ui';
import { css } from './css';
import { Av, Glass, PersonPop, Sel } from './ui';
import type { Mg } from './store';

const PER: Record<string, [number, number, string]> = {
  w0: [0, 0, 'Esta Semana'],
  w1: [1, 1, 'Próxima Semana'],
  n4: [0, 3, 'Próximas 4 Semanas'],
  n12: [0, 11, 'Próximas 12 Semanas'],
};
type Cat = 'below' | 'ok' | 'over';
const CAT: Record<Cat, [string, string, string]> = {
  below: ['Abaixo da Alocação', 'oklch(0.86 0.12 85)', '< 90% da capacidade'],
  ok: ['Dentro da Alocação', 'oklch(0.86 0.12 150)', '90–100% da capacidade'],
  over: ['Acima da Alocação', 'oklch(0.82 0.14 30)', '> 100% da capacidade'],
};
type F = {
  per?: string;
  q?: string;
  team?: string;
  area?: string;
  lvl?: string;
  loc?: string;
  proj?: string;
  client?: string;
  band?: string;
  sort?: string;
  group?: string;
};

// Painel de Alocação (prototype isDash): who is below, within or above
// capacity in a period, with filters, sort and grouping.
export function MgDash({ mg }: { mg: Mg }) {
  const { D, tr, lang, P, LV, SKN, ROLE, lvIdx, wk, wi } = mg;
  const en = lang === 'en';
  const [Fp, setFp] = usePersistentState<F>('mg.db', {});
  const [q, setQ] = useState('');
  const [pop, setPop] = useState<string | null>(null);
  const Fl: F = { ...Fp, q };
  const setF = (k: keyof F, v: string) => (k === 'q' ? setQ(v) : setFp({ ...Fp, [k]: v }));
  const per = PER[Fl.per ?? ''] ? Fl.per! : 'w0';
  const [a0, b0] = PER[per]!;
  const nW = b0 - a0 + 1;
  const inPer = (a: { from: string; to: string }) => wi(a.from) <= b0 && wi(a.to) >= a0;
  const qq = q.trim().toLowerCase();
  const rows = P.filter(
    (p) =>
      (!qq || `${p.name} ${p.role}`.toLowerCase().includes(qq)) &&
      (!Fl.team || p.team === Fl.team) &&
      (!Fl.area || p.area === Fl.area) &&
      (!Fl.lvl || String(p.level) === Fl.lvl) &&
      (!Fl.loc || p.loc === Fl.loc) &&
      (!Fl.proj || D.allocs.some((a) => a.person === p.id && a.project === Fl.proj && inPer(a))) &&
      (!Fl.client ||
        D.allocs.some((a) => a.person === p.id && inPer(a) && mg.pjById[a.project]?.client === Fl.client)),
  ).map((p) => {
    const cap = +p.cap || 40;
    const avg = mg.avgLoad(p.id, a0, b0);
    const b = mg.band(avg, cap);
    const cat: Cat = b === 3 ? 'over' : b === 2 ? 'ok' : 'below';
    return { p, cap, avg, pct: Math.round((avg / cap) * 100), cat };
  });
  type Row = (typeof rows)[number];
  const vis = rows.filter((r) => !Fl.band || r.cat === Fl.band);
  const sortK = Fl.sort || 'desc';
  vis.sort((x, y) =>
    sortK === 'name' ? x.p.name.localeCompare(y.p.name) : sortK === 'asc' ? x.pct - y.pct : y.pct - x.pct,
  );
  const G = Fl.group || '';
  const keyOf = (p: MgPerson) =>
    G === 'team'
      ? (mg.tById[p.team]?.name ?? '—')
      : G === 'area'
        ? (SKN[p.area] ?? p.area)
        : G === 'level'
          ? `${String(p.level).padStart(2, '0')}|${LV[p.level]}`
          : G === 'loc'
            ? p.loc || '—'
            : '';
  const gm = new Map<string, Row[]>();
  for (const r of vis) {
    const k = keyOf(r.p);
    gm.set(k, [...(gm.get(k) ?? []), r]);
  }
  const groups = [...gm.entries()].sort((x, y) => x[0].localeCompare(y[0]));
  const locs = [...new Set(P.map((p) => p.loc).filter(Boolean))].sort();
  const hasFilters = !!(q || Fl.team || Fl.area || Fl.lvl || Fl.loc || Fl.proj || Fl.client || Fl.band);
  const SEL = (on: boolean) =>
    `height:34px;padding:0 28px 0 12px;border-radius:999px;border:1px solid ${on ? 'rgba(255,255,255,.4)' : 'rgba(255,255,255,.14)'};background-color:rgba(255,255,255,.06);color:#fbf8f5;font:inherit;font-size:12.5px;outline:none;max-width:220px;`;
  const selects: Array<{ k: keyof F; opts: Array<{ v: string; l: string }>; label: string; mark?: boolean }> =
    [
      { k: 'team', label: tr('Equipa'), opts: mg.teamOpts.map((o) => ({ ...o, l: o.v ? o.l : tr(o.l) })) },
      {
        k: 'area',
        label: tr('Área principal'),
        opts: [
          { v: '', l: tr('Todas as áreas') },
          ...Object.keys(ROLE).map((k) => ({ v: k, l: SKN[k] ?? k })),
        ],
      },
      {
        k: 'lvl',
        label: tr('Senioridade'),
        opts: [{ v: '', l: tr('Todos os níveis') }, ...lvIdx.map((l) => ({ v: String(l), l: LV[l]! }))],
      },
      { k: 'proj', label: tr('Projeto'), opts: [{ v: '', l: tr('Todos os Projetos') }, ...mg.projOpt] },
      {
        k: 'client',
        label: tr('Cliente'),
        opts: [{ v: '', l: tr('Todos os clientes') }, ...D.clients.map((c) => ({ v: c.id, l: c.name }))],
      },
      {
        k: 'loc',
        label: tr('Localização'),
        opts: [{ v: '', l: tr('Todas as localizações') }, ...locs.map((l) => ({ v: l, l }))],
      },
    ];

  const tile = (r: Row) => {
    const p = r.p;
    const tm = mg.tOf(p);
    const c = CAT[r.cat][1];
    const projs = [...new Set(D.allocs.filter((a) => a.person === p.id && inPer(a)).map((a) => a.project))]
      .map((id) => mg.pjById[id])
      .filter(Boolean);
    return (
      <div
        key={p.id}
        role="button"
        tabIndex={0}
        title={`${p.name} · ${r.pct}%`}
        className="mg-dtile"
        onClick={() => setPop(p.id)}
        onKeyDown={(e) => e.key === 'Enter' && setPop(p.id)}
        style={css(
          'display:flex;flex-direction:column;gap:14px;padding:20px 20px 18px;border-radius:24px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);cursor:pointer;min-width:0;',
        )}
      >
        <div style={css('display:flex;align-items:center;gap:12px;min-width:0;')}>
          <Av p={p} size={44} fs={14} tc={tm.tc} />
          <span style={css('flex:1;min-width:0;display:flex;flex-direction:column;gap:3px;')}>
            <span
              style={css(
                'font-size:15.5px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;',
              )}
            >
              {p.name}
            </span>
            <span
              style={css(
                'font-size:12.5px;color:rgba(255,248,240,.66);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;',
              )}
            >
              {tr(p.role)}
              {tm.tn && (
                <>
                  {' · '}
                  <span style={css(`color:${tm.tc};font-weight:600;`)}>{tm.tn}</span>
                </>
              )}{' '}
              · {LV[p.level]}
            </span>
          </span>
          <span
            style={css(
              `font-family:'Geist Mono',monospace;font-size:22px;font-weight:700;letter-spacing:-.02em;color:${c};`,
            )}
          >
            {r.pct}%
          </span>
        </div>
        <div style={css('display:flex;flex-direction:column;gap:8px;')}>
          <div style={css('height:8px;border-radius:999px;background:rgba(255,255,255,.1);overflow:hidden;')}>
            <div
              style={css(`height:100%;width:${Math.min(100, r.pct)}%;border-radius:999px;background:${c};`)}
            />
          </div>
          <div
            style={css(
              'display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:12.5px;color:rgba(255,248,240,.66);',
            )}
          >
            <span
              style={css("font-family:'Geist Mono',monospace;font-size:14px;font-weight:600;color:#fbf8f5;")}
            >
              {(Math.round(r.avg * 10) / 10).toString().replace('.', en ? '.' : ',')}h / {r.cap}h
            </span>
            <span>{nW > 1 ? tr('média por semana') : wLblY(wk(a0))}</span>
          </div>
        </div>
        {nW > 1 && (
          <div style={css(`display:grid;grid-template-columns:repeat(${nW},minmax(0,1fr));gap:3px;`)}>
            {Array.from({ length: nW }, (_, i) => {
              const w = a0 + i;
              const hh = mg.loadW(p.id, w);
              return (
                <span
                  key={i}
                  title={`${wLbl(wk(w))} · ${hh}h`}
                  style={css(
                    `height:12px;border-radius:4px;background:${hh ? mg.heat(hh, r.cap).bg : 'rgba(255,255,255,.08)'};`,
                  )}
                />
              );
            })}
          </div>
        )}
        {projs.length > 0 && (
          <div style={css('display:flex;flex-wrap:wrap;gap:6px;')}>
            {projs.slice(0, 4).map((j) => (
              <span
                key={j!.id}
                style={css(
                  "display:flex;align-items:center;gap:6px;height:24px;padding:0 10px;border-radius:999px;background:rgba(255,255,255,.08);font-family:'Geist Mono',monospace;font-size:11.5px;font-weight:600;",
                )}
              >
                <span style={css(`width:6px;height:6px;border-radius:50%;background:${j!.color};`)} />
                {j!.code}
              </span>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <Glass label={tr('Painel de Alocação')}>
      <div style={css('flex-shrink:0;display:flex;flex-direction:column;gap:14px;padding:22px 24px 14px;')}>
        <div style={css('display:flex;flex-wrap:wrap;align-items:flex-end;gap:12px;')}>
          <div style={css('display:flex;flex-direction:column;gap:4px;margin-right:auto;min-width:0;')}>
            <h1 style={css('margin:0;font-size:28px;font-weight:600;letter-spacing:-.02em;')}>
              {tr('Painel de Alocação')}
            </h1>
            <span style={css('font-size:13.5px;color:rgba(255,248,240,.72);')}>
              {nW > 1 ? `${wLblY(wk(a0))} → ${wLblY(wk(b0))}` : tr(`Semana de ${wLblY(wk(a0))}`)} ·{' '}
              {tr(`${rows.length} pessoas`)}
            </span>
          </div>
          <div
            role="tablist"
            style={css(
              'display:flex;gap:2px;padding:3px;border-radius:999px;background:rgba(18,12,9,.22);border:1px solid rgba(255,255,255,.12);',
            )}
          >
            {Object.entries(PER).map(([k, v]) => (
              <button
                key={k}
                type="button"
                role="tab"
                aria-selected={per === k}
                onClick={() => setF('per', k)}
                style={css(
                  `height:28px;padding:0 12px;border-radius:999px;border:0;font:inherit;font-size:12px;font-weight:600;cursor:pointer;white-space:nowrap;background:${per === k ? '#fbf8f5' : 'transparent'};color:${per === k ? '#2a211c' : 'rgba(255,248,240,.8)'};`,
                )}
              >
                {tr(v[2])}
              </button>
            ))}
          </div>
        </div>
        <div style={css('display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;')}>
          {(['below', 'ok', 'over'] as const).map((c) => {
            const n = rows.filter((r) => r.cat === c).length;
            const on = Fl.band === c;
            const rule =
              c === 'below'
                ? `${tr(CAT[c][2])} · ${tr(`${rows.filter((r) => r.cat === 'below' && !r.avg).length} sem alocação`)}`
                : tr(CAT[c][2]);
            return (
              <button
                key={c}
                type="button"
                aria-pressed={on}
                className="mg-h12"
                onClick={() => setF('band', on ? '' : c)}
                style={css(
                  `display:flex;flex-direction:column;align-items:flex-start;gap:6px;padding:16px 18px;border-radius:22px;background:${on ? 'rgba(255,255,255,.16)' : 'rgba(255,255,255,.07)'};border:1px solid ${on ? CAT[c][1] : 'rgba(255,255,255,.12)'};color:#fbf8f5;font:inherit;text-align:left;cursor:pointer;`,
                )}
              >
                <span
                  style={css(
                    'display:flex;align-items:center;gap:8px;font-size:13px;color:rgba(255,248,240,.82);',
                  )}
                >
                  <span style={css(`width:9px;height:9px;border-radius:50%;background:${CAT[c][1]};`)} />
                  {tr(CAT[c][0])}
                </span>
                <span style={css('display:flex;align-items:baseline;gap:8px;')}>
                  <span
                    style={css(
                      `font-family:'Geist Mono',monospace;font-size:32px;font-weight:600;letter-spacing:-.02em;color:${CAT[c][1]};`,
                    )}
                  >
                    {n}
                  </span>
                  <span style={css('font-size:12.5px;color:rgba(255,248,240,.62);')}>
                    {tr(`${rows.length ? Math.round((n / rows.length) * 100) : 0}% da equipa`)}
                  </span>
                </span>
                <span style={css('font-size:12px;color:rgba(255,248,240,.62);')}>{rule}</span>
              </button>
            );
          })}
        </div>
        <div style={css('display:flex;flex-wrap:wrap;align-items:center;gap:8px;')}>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={tr('Pesquisar pessoas…')}
            aria-label={tr('Pesquisar pessoas…')}
            style={css(
              'width:200px;height:34px;padding:0 14px;border-radius:999px;border:1px solid rgba(255,255,255,.14);background:rgba(18,12,9,.22);color:#fbf8f5;font:inherit;font-size:12.5px;outline:none;',
            )}
          />
          {selects.map((f) => (
            <Sel
              key={f.k}
              value={Fl[f.k] ?? ''}
              onChange={(v) => setF(f.k, v)}
              opts={f.opts}
              s={SEL(!!Fl[f.k])}
              label={f.label}
              size="10px"
            />
          ))}
          <Sel
            value={sortK}
            onChange={(v) => setF('sort', v)}
            opts={[
              { v: 'desc', l: tr('Ocupação ↓') },
              { v: 'asc', l: tr('Ocupação ↑') },
              { v: 'name', l: tr('Nome') },
            ]}
            s={SEL(false)}
            label={tr('Ordenar')}
            size="10px"
          />
          <Sel
            value={G}
            onChange={(v) => setF('group', v)}
            opts={[
              { v: '', l: tr('Sem agrupamento') },
              { v: 'team', l: tr('Agrupar por equipa') },
              { v: 'area', l: tr('Agrupar por área') },
              { v: 'level', l: tr('Agrupar por senioridade') },
              { v: 'loc', l: tr('Agrupar por localização') },
            ]}
            s={SEL(!!G)}
            label={tr('Agrupar')}
            size="10px"
          />
          {hasFilters && (
            <button
              type="button"
              className="mg-hx"
              onClick={() => {
                setQ('');
                setFp({ per: Fp.per, sort: Fp.sort, group: Fp.group });
              }}
              style={css(
                'height:34px;padding:0 14px;border-radius:999px;border:0;background:transparent;color:rgba(255,248,240,.8);font:inherit;font-size:12.5px;font-weight:600;cursor:pointer;',
              )}
            >
              {tr('Limpar filtros')}
            </button>
          )}
          <span style={css('margin-left:auto;font-size:12.5px;color:rgba(255,248,240,.62);')}>
            {tr(`${vis.length} de ${rows.length}`)}
          </span>
        </div>
      </div>
      <div
        style={css(
          'flex:1;min-height:0;overflow:auto;padding:4px 24px 24px;display:flex;flex-direction:column;gap:18px;',
        )}
      >
        {groups.map(([k, rs]) => (
          <div key={k} style={css('display:flex;flex-direction:column;gap:10px;')}>
            {G && (
              <div style={css('display:flex;align-items:center;gap:10px;padding-top:4px;')}>
                <span style={css('font-size:15px;font-weight:600;')}>
                  {k.includes('|') ? k.split('|')[1] : k}
                </span>
                <span style={css('font-size:12px;color:rgba(255,248,240,.6);')}>
                  {tr(`${rs.length} pessoas`)}
                </span>
                <span
                  style={css(
                    "display:flex;gap:6px;margin-left:auto;font-family:'Geist Mono',monospace;font-size:12px;",
                  )}
                >
                  <span style={css('color:oklch(0.86 0.12 85);')}>
                    {rs.filter((r) => r.cat === 'below').length}
                  </span>
                  <span style={css('color:oklch(0.86 0.12 150);')}>
                    {rs.filter((r) => r.cat === 'ok').length}
                  </span>
                  <span style={css('color:oklch(0.82 0.14 30);')}>
                    {rs.filter((r) => r.cat === 'over').length}
                  </span>
                </span>
              </div>
            )}
            <div
              style={css(
                'display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,620px),1fr));gap:14px;',
              )}
            >
              {rs.map(tile)}
            </div>
          </div>
        ))}
        {!vis.length && (
          <div style={css('padding:40px 0;text-align:center;font-size:13.5px;color:rgba(255,248,240,.62);')}>
            {tr('Ninguém corresponde aos filtros.')}
          </div>
        )}
      </div>
      {pop && <PersonPop mg={mg} pid={pop} a0={a0} b0={b0} onClose={() => setPop(null)} />}
    </Glass>
  );
}
