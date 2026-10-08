'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { MG_RST, isAvailable, wLbl, wLblY, type MgReq } from '@/lib/mg';
import { mgL } from '@/lib/mgText';
import { usePersistentState } from '@/components/ui';
import { css } from './css';
import { Av, Chip, PersonPop, Sel, Split, Trash, uid } from './ui';
import type { Mg } from './store';

const SEL =
  'height:38px;padding:0 30px 0 12px;border-radius:12px;border:1px solid rgba(255,255,255,.14);background-color:rgba(255,255,255,.06);color:#fbf8f5;font:inherit;font-size:13.5px;outline:none;box-sizing:border-box;width:100%;min-width:0;';
const INP =
  "height:38px;padding:0 12px;border-radius:12px;border:1px solid rgba(255,255,255,.14);background-color:rgba(18,12,9,.22);color:#fbf8f5;font:inherit;font-size:13.5px;outline:none;box-sizing:border-box;width:100%;min-width:0;font-family:'Geist Mono',monospace;";
const LBL = 'font-size:12px;color:rgba(255,248,240,.72);';
const OCC = ['rgba(255,248,240,.6)', 'oklch(0.86 0.12 85)', 'oklch(0.86 0.12 150)', 'oklch(0.82 0.14 30)'];

// Pesquisar Recursos (prototype isStaff): resource requests (skills + level,
// project, period, hours, max cost) and the people who match, by availability.
export function MgStaff({ mg }: { mg: Mg }) {
  const sp = useSearchParams();
  const { D, tr, lang, LV, SKN, SKL, lvIdx, wk, wi, gTeam } = mg;
  const L = (i: number) => mgL(i, lang);
  const en = lang === 'en';
  const rf = sp.get('rf') ?? 'open';
  const [sort, setSort] = usePersistentState('mg.rSort', 'avail');
  const [pop, setPop] = useState<string | null>(null);
  const title = (r: MgReq) => r.skills.map((s) => (SKN[s.k] ?? s.k) + (s.l ? ` ${LV[s.l]}` : '')).join(' + ');
  const list = D.reqs.filter(
    (r) =>
      (rf === 'all' || (rf === 'open' ? r.status !== 'Preenchido' : r.status === rf)) &&
      (gTeam === 'all' ||
        r.team === gTeam ||
        (!r.team && (mg.inTeamProj(r.project) || mg.pById[r.assigned]?.team === gTeam))),
  );
  const sel = list.find((r) => r.id === sp.get('r')) ?? list[0];

  const side = (
    <>
      <div style={css('flex-shrink:0;display:flex;flex-direction:column;gap:12px;padding:20px 16px 12px;')}>
        <div style={css('display:flex;align-items:center;gap:10px;')}>
          <h1 style={css('margin:0;font-size:24px;font-weight:600;letter-spacing:-.02em;margin-right:auto;')}>
            {en ? 'Resource Finder' : 'Pesquisar Recursos'}
          </h1>
        </div>
        <button
          type="button"
          onClick={() => {
            const id = uid();
            mg.upd(
              (d) =>
                void d.reqs.unshift({
                  id,
                  team: gTeam !== 'all' ? gTeam : '',
                  project: (mg.PJ.find((p) => mg.inTeamProj(p.id)) ?? mg.PJ[0])?.id ?? '',
                  skills: [{ k: SKL[0]?.[0] ?? 'abap', l: 0 }],
                  hours: 40,
                  maxCost: '',
                  from: wk(1),
                  to: wk(8),
                  status: 'Aberto',
                  assigned: '',
                  note: '',
                }),
            );
            mg.nav('mg_staff', { r: id, rf: 'all' });
          }}
          style={css(
            'height:40px;border-radius:999px;border:0;background:#fbf8f5;color:#2a211c;font:inherit;font-size:13.5px;font-weight:600;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;',
          )}
        >
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="6.5" />
            <path d="M20 20l-4.2-4.2" />
          </svg>
          {tr('Nova Pesquisa')}
        </button>
        <div style={css('display:flex;flex-wrap:wrap;gap:4px;')}>
          {(
            [
              ['open', 'Em aberto'],
              ['Preenchido', 'Preenchidos'],
              ['all', 'Todos'],
            ] as const
          ).map(([k, l]) => (
            <Chip key={k} on={rf === k} label={tr(l)} onClick={() => mg.nav('mg_staff', { rf: k })} />
          ))}
        </div>
      </div>
      <div
        style={css(
          'flex:1;min-height:0;overflow:auto;padding:0 8px 12px;display:flex;flex-direction:column;gap:4px;',
        )}
      >
        {list.map((r) => {
          const pj = mg.pjById[r.project];
          const on = sel && r.id === sel.id;
          return (
            <div
              key={r.id}
              role="button"
              tabIndex={0}
              aria-current={on || undefined}
              className="mg-h8"
              onClick={() => mg.nav('mg_staff', { rf, r: r.id })}
              onKeyDown={(e) => e.key === 'Enter' && mg.nav('mg_staff', { rf, r: r.id })}
              style={css(
                `flex-shrink:0;display:flex;flex-direction:column;gap:7px;padding:12px 14px;border-radius:18px;cursor:pointer;background:${on ? 'rgba(255,255,255,.14)' : 'rgba(255,255,255,.03)'};border:1px solid ${on ? 'rgba(255,255,255,.22)' : 'rgba(255,255,255,.08)'};`,
              )}
            >
              <div style={css('display:flex;align-items:center;gap:8px;')}>
                <span
                  style={css(
                    'flex:1;min-width:0;font-size:14px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;',
                  )}
                >
                  {title(r)}
                </span>
                <span
                  style={css(
                    `flex:none;height:20px;padding:0 8px;border-radius:999px;display:flex;align-items:center;font-size:10.5px;font-weight:700;background:${MG_RST[r.status]};`,
                  )}
                >
                  {tr(r.status)}
                </span>
              </div>
              <div
                style={css(
                  'display:flex;align-items:center;gap:8px;font-size:12px;color:rgba(255,248,240,.66);',
                )}
              >
                <span
                  style={css(
                    `width:7px;height:7px;flex:none;border-radius:50%;background:${pj?.color ?? 'rgba(255,255,255,.3)'};`,
                  )}
                />
                <span style={css("font-family:'Geist Mono',monospace;white-space:nowrap;")}>
                  {pj?.code ?? '—'}
                </span>
                <span style={css('margin-left:auto;white-space:nowrap;')}>
                  {tr(`${r.hours || 0}h/sem`)} · {wLbl(r.from)} → {wLbl(r.to)}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
  if (!sel)
    return (
      <Split page="mg_staff" list={side}>
        {null}
      </Split>
    );

  const sk = sel.skills;
  const f = Math.min(wi(sel.from), wi(sel.to));
  const t = Math.max(wi(sel.from), wi(sel.to));
  const nW = t - f + 1;
  const need = Math.max(0, +sel.hours || 0);
  const maxC = +sel.maxCost || 0;
  const upd = (fn: (r: MgReq) => void) => mg.upd((d) => fn(d.reqs.find((x) => x.id === sel.id)!));
  const pj = mg.pjById[sel.project];
  const res = mg.P.filter(
    (p) =>
      isAvailable(p) &&
      sk.every((s) => (p.skills[s.k] ?? 0) > 0 && (!s.l || p.skills[s.k] === s.l)) &&
      (!maxC || (+p.cost || 0) <= maxC),
  ).map((p) => {
    const cap = +p.cap || 40;
    const wl = Array.from({ length: nW }, (_, i) => mg.loadW(p.id, f + i));
    const load = wl.reduce((x, y) => x + y, 0) / nW;
    const minFree = Math.max(0, Math.min(...wl.map((x) => cap - x)));
    const isAvail = need > 0 ? minFree >= need : minFree > 0;
    const assigned = D.allocs.some(
      (x) => x.person === p.id && x.project === sel.project && wi(x.from) <= t && wi(x.to) >= f,
    );
    return { p, cap, wl, load, minFree, isAvail, assigned };
  });
  res.sort((x, y) =>
    sort === 'name'
      ? x.p.name.localeCompare(y.p.name)
      : sort === 'cost'
        ? x.p.cost - y.p.cost
        : +y.isAvail - +x.isAvail || y.minFree - x.minFree,
  );
  const nAv = res.filter((r) => r.isAvail).length;
  const lvlOpts = [{ v: '0', l: tr('Qualquer nível') }, ...lvIdx.map((l) => ({ v: String(l), l: LV[l]! }))];

  return (
    <Split page="mg_staff" list={side}>
      <div style={css('display:flex;flex-direction:column;gap:18px;padding:24px 26px 30px;')}>
        <div style={css('display:flex;align-items:center;gap:12px;')}>
          <div style={css('flex:1;min-width:0;display:flex;flex-direction:column;gap:4px;')}>
            <span style={css('font-size:24px;font-weight:600;letter-spacing:-.02em;')}>{title(sel)}</span>
            <span style={css('font-size:13px;color:rgba(255,248,240,.7);')}>
              {pj ? `${pj.code} · ${pj.name} · ` : ''}
              {wLblY(wk(f))} → {wLblY(wk(t))} · {tr(`${nW} semanas`)}
            </span>
          </div>
          <Sel
            value={sel.status}
            onChange={(v) =>
              upd((r) => {
                r.status = v;
                if (v !== 'Preenchido') r.assigned = '';
              })
            }
            opts={Object.keys(MG_RST).map((s) => ({ v: s, l: tr(s) }))}
            s={`${SEL}width:150px;border-radius:999px;height:36px;`}
            label={tr('Estado')}
            pos="right 12px center"
          />
          <button
            type="button"
            className="mg-round"
            title={L(72)}
            aria-label={L(72)}
            style={{ color: '#ffc9b8' }}
            onClick={() => {
              mg.upd((d) => void (d.reqs = d.reqs.filter((x) => x.id !== sel.id)));
              mg.nav('mg_staff', { rf });
            }}
          >
            <Trash />
          </button>
        </div>
        <div
          style={css(
            'display:flex;flex-direction:column;gap:16px;padding:18px;border-radius:22px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.12);',
          )}
        >
          <span style={css('font-size:15px;font-weight:600;')}>{tr('Perfil Necessário')}</span>
          <div style={css('display:flex;flex-direction:column;gap:8px;')}>
            <span style={css(LBL)}>{tr('Competências')}</span>
            {sk.map((s, i) => (
              <div
                key={i}
                style={css(
                  'display:grid;grid-template-columns:minmax(0,1.4fr) minmax(0,1fr) 34px;gap:8px;align-items:center;',
                )}
              >
                <Sel
                  value={s.k}
                  onChange={(v) => upd((r) => void (r.skills[i]!.k = v))}
                  opts={SKL.map(([v, l]) => ({ v, l }))}
                  s={SEL}
                  label={`${tr('Competências')} ${i + 1}`}
                  pos="right 12px center"
                />
                <Sel
                  value={String(s.l || 0)}
                  onChange={(v) => upd((r) => void (r.skills[i]!.l = +v))}
                  opts={lvlOpts}
                  s={SEL}
                  label={`${tr('Senioridade')} ${i + 1}`}
                  pos="right 12px center"
                />
                {sk.length > 1 ? (
                  <button
                    type="button"
                    className="mg-hdel"
                    title={L(38)}
                    aria-label={`${L(38)}: ${SKN[s.k] ?? s.k}`}
                    onClick={() => upd((r) => void r.skills.splice(i, 1))}
                    style={css(
                      'width:34px;height:34px;border-radius:50%;border:0;background:transparent;color:rgba(255,248,240,.6);cursor:pointer;padding:0;font-size:16px;',
                    )}
                  >
                    ×
                  </button>
                ) : (
                  <span />
                )}
              </div>
            ))}
            <button
              type="button"
              disabled={sk.length >= 20}
              onClick={() =>
                upd((r) => {
                  const used = r.skills.map((x) => x.k);
                  r.skills.push({ k: (SKL.find(([k]) => !used.includes(k)) ?? SKL[0]!)[0], l: 0 });
                })
              }
              style={css(
                'align-self:flex-start;height:32px;padding:0 14px;border-radius:999px;border:1.5px dashed rgba(255,255,255,.28);background:transparent;color:rgba(255,248,240,.85);font:inherit;font-size:12.5px;font-weight:600;cursor:pointer;',
              )}
            >
              {tr('+ Competência')}
            </button>
          </div>
          <div style={css('display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;')}>
            <label style={css('display:flex;flex-direction:column;gap:6px;min-width:0;grid-column:span 2;')}>
              <span style={css(LBL)}>{tr('Projeto')}</span>
              <Sel
                value={sel.project}
                onChange={(v) => upd((r) => void (r.project = v))}
                opts={sel.project ? mg.projOpt : [{ v: '', l: '—' }, ...mg.projOpt]}
                s={SEL}
                label={tr('Projeto')}
                pos="right 12px center"
              />
            </label>
            <label style={css('display:flex;flex-direction:column;gap:6px;min-width:0;')}>
              <span style={css(LBL)}>{tr('De')}</span>
              <Sel
                value={sel.from}
                onChange={(v) => upd((r) => void (r.from = v))}
                opts={mg.weekOpts}
                s={SEL}
                label={tr('De')}
                pos="right 12px center"
              />
            </label>
            <label style={css('display:flex;flex-direction:column;gap:6px;min-width:0;')}>
              <span style={css(LBL)}>{tr('Até')}</span>
              <Sel
                value={sel.to}
                onChange={(v) => upd((r) => void (r.to = v))}
                opts={mg.weekOpts}
                s={SEL}
                label={tr('Até')}
                pos="right 12px center"
              />
            </label>
            <label style={css('display:flex;flex-direction:column;gap:6px;min-width:0;')}>
              <span style={css(LBL)}>{tr('Horas por semana')}</span>
              <input
                type="number"
                min={1}
                max={60}
                value={sel.hours}
                onChange={(e) => {
                  const v = e.target.value;
                  upd((r) => void (r.hours = v === '' ? '' : Math.min(1000, Math.max(0, +v))));
                }}
                style={css(INP)}
              />
            </label>
            <label style={css('display:flex;flex-direction:column;gap:6px;min-width:0;')}>
              <span style={css(LBL)}>{tr('Custo/hora máx. (€)')}</span>
              <input
                type="number"
                min={0}
                value={sel.maxCost}
                placeholder={tr('Sem limite')}
                onChange={(e) => {
                  const v = e.target.value;
                  upd((r) => void (r.maxCost = v === '' ? '' : Math.min(100000, Math.max(0, +v))));
                }}
                style={css(INP)}
              />
            </label>
          </div>
        </div>
        <div style={css('display:flex;flex-direction:column;gap:10px;')}>
          <div style={css('display:flex;flex-wrap:wrap;align-items:center;gap:10px;')}>
            <span style={css('font-size:16px;font-weight:600;')}>{tr('Resultados')}</span>
            <span style={css('font-size:12.5px;color:rgba(255,248,240,.65);margin-right:auto;')}>
              {tr(`${res.length} correspondem · ${nAv} disponíveis`)}
            </span>
            <Sel
              value={sort}
              onChange={setSort}
              opts={[
                { v: 'avail', l: tr('Ordenar por disponibilidade') },
                { v: 'cost', l: tr('Ordenar por custo') },
                { v: 'name', l: tr('Ordenar por nome') },
              ]}
              s={`${SEL}width:auto;height:34px;border-radius:999px;font-size:12.5px;`}
              label={tr('Ordenar')}
              pos="right 12px center"
            />
          </div>
          {res.map((r) => {
            const p = r.p;
            const tm = mg.tOf(p);
            const occ = Math.round((r.load / r.cap) * 100);
            const cov = need ? Math.min(1, r.minFree / need) : 1;
            const short = Math.max(0, need - r.minFree);
            return (
              <div
                key={p.id}
                style={css(
                  `display:flex;flex-direction:column;gap:12px;padding:16px 18px;border-radius:20px;background:${r.isAvail ? 'oklch(0.8 0.12 150 / .09)' : 'rgba(255,255,255,.04)'};border:1px solid ${r.isAvail ? 'oklch(0.82 0.13 150 / .45)' : 'rgba(255,255,255,.1)'};`,
                )}
              >
                <div style={css('display:flex;align-items:center;gap:12px;min-width:0;')}>
                  <Av p={p} size={42} fs={14} tc={tm.tc} s="box-shadow:0 0 0 2px rgba(255,255,255,.12);" />
                  <span style={css('flex:1;min-width:0;display:flex;flex-direction:column;gap:3px;')}>
                    <span style={css('display:flex;align-items:center;gap:8px;min-width:0;')}>
                      <span
                        style={css(
                          'font-size:15px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;',
                        )}
                      >
                        {p.name}
                      </span>
                      {r.isAvail && (
                        <span
                          style={css(
                            'flex:none;height:20px;padding:0 8px;border-radius:999px;display:flex;align-items:center;font-size:10.5px;font-weight:700;color:#10241a;background:oklch(0.82 0.14 150);',
                          )}
                        >
                          {tr('Disponível')}
                        </span>
                      )}
                    </span>
                    <span
                      style={css(
                        'font-size:12.5px;color:rgba(255,248,240,.64);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;',
                      )}
                    >
                      {tr(p.role)}
                      {tm.tn && (
                        <>
                          {' · '}
                          <span style={css(`color:${tm.tc};font-weight:600;`)}>{tm.tn}</span>
                        </>
                      )}{' '}
                      · {LV[p.level]} · {+p.cost || 0} €/h
                    </span>
                  </span>
                  <span style={css('display:flex;flex-direction:column;align-items:flex-end;gap:2px;')}>
                    <span
                      style={css(
                        `font-family:'Geist Mono',monospace;font-size:20px;font-weight:700;color:${OCC[mg.band(r.load, r.cap)]};`,
                      )}
                    >
                      {occ}%
                    </span>
                    <span style={css('font-size:11px;color:rgba(255,248,240,.58);white-space:nowrap;')}>
                      {tr('ocupação no período')}
                    </span>
                  </span>
                </div>
                <div style={css('display:flex;flex-wrap:wrap;gap:6px;')}>
                  {sk.map((s, i) => (
                    <span
                      key={i}
                      style={css(
                        'height:24px;padding:0 10px;border-radius:999px;display:flex;align-items:center;gap:6px;font-size:12px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.12);',
                      )}
                    >
                      <span style={css('font-weight:600;')}>{SKN[s.k] ?? s.k}</span>
                      <span style={css('opacity:.75;')}>{LV[p.skills[s.k] ?? 0] ?? ''}</span>
                    </span>
                  ))}
                </div>
                <div
                  style={css(
                    'display:grid;grid-template-columns:minmax(0,220px) minmax(0,1fr);gap:16px;align-items:center;',
                  )}
                >
                  <div style={css('display:flex;flex-direction:column;gap:6px;')}>
                    <div
                      style={css('display:flex;align-items:baseline;justify-content:space-between;gap:8px;')}
                    >
                      <span
                        style={css("font-family:'Geist Mono',monospace;font-size:13.5px;font-weight:600;")}
                      >
                        {tr(`${Math.round(r.minFree)}h livres / semana`)}
                      </span>
                      <span style={css('font-size:11.5px;color:oklch(0.84 0.13 30);')}>
                        {short ? tr(`faltam ${Math.round(short)}h`) : ''}
                      </span>
                    </div>
                    <div
                      style={css(
                        'height:7px;border-radius:999px;background:rgba(255,255,255,.1);overflow:hidden;',
                      )}
                    >
                      <div
                        style={css(
                          `height:100%;width:${Math.round(cov * 100)}%;border-radius:999px;background:${cov >= 1 ? 'oklch(0.8 0.14 150)' : cov >= 0.5 ? 'oklch(0.84 0.13 85)' : 'oklch(0.74 0.15 30)'};`,
                        )}
                      />
                    </div>
                  </div>
                  <div
                    style={css(
                      `display:grid;grid-template-columns:repeat(${Math.min(nW, 26)},minmax(0,1fr));gap:3px;`,
                    )}
                  >
                    {r.wl.slice(0, 26).map((hh, i) => (
                      <span
                        key={i}
                        title={`${wLbl(wk(f + i))} · ${hh}h / ${r.cap}h`}
                        style={css(
                          `height:14px;border-radius:4px;background:${hh ? mg.heat(hh, r.cap).bg : 'rgba(255,255,255,.08)'};`,
                        )}
                      />
                    ))}
                  </div>
                </div>
                <div style={css('display:flex;justify-content:flex-end;gap:8px;')}>
                  <button
                    type="button"
                    onClick={() => setPop(p.id)}
                    style={css(
                      'height:34px;padding:0 14px;border-radius:999px;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.08);color:#fbf8f5;font:inherit;font-size:12.5px;font-weight:600;cursor:pointer;',
                    )}
                  >
                    {tr('Ver Alocação')}
                  </button>
                  {!r.assigned && !!sel.project && (
                    <button
                      type="button"
                      aria-label={`${tr('Alocar')}: ${p.name}`}
                      onClick={() =>
                        mg.upd((d) => {
                          d.allocs.push({
                            id: uid(),
                            person: p.id,
                            project: sel.project,
                            from: wk(f),
                            to: wk(t),
                            hours: need || 8,
                          });
                          const rq = d.reqs.find((x) => x.id === sel.id)!;
                          rq.status = 'Preenchido';
                          rq.assigned = p.id;
                        })
                      }
                      style={css(
                        'height:34px;padding:0 16px;border-radius:999px;border:0;background:#fbf8f5;color:#2a211c;font:inherit;font-size:12.5px;font-weight:600;cursor:pointer;',
                      )}
                    >
                      {tr('Alocar')}
                    </button>
                  )}
                  {r.assigned && (
                    <span
                      style={css(
                        'height:34px;padding:0 14px;border-radius:999px;display:flex;align-items:center;gap:6px;font-size:12.5px;font-weight:600;color:oklch(0.86 0.13 150);background:oklch(0.8 0.13 150 / .14);',
                      )}
                    >
                      ✓ {tr('Alocado')}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
          {!res.length && (
            <div
              style={css('padding:24px 0;text-align:center;font-size:13.5px;color:rgba(255,248,240,.62);')}
            >
              {tr('Ninguém com este perfil.')}
            </div>
          )}
        </div>
      </div>
      {pop && <PersonPop mg={mg} pid={pop} a0={f} b0={t} onClose={() => setPop(null)} />}
    </Split>
  );
}
