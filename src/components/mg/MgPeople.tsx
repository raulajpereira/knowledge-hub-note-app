'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { MG_COST, MG_PERSON_STATUS, MG_RATE, mgAv, wLbl, wLblY, type MgPerson } from '@/lib/mg';
import { mgL } from '@/lib/mgText';
import { CHEV, OPT, css } from './css';
import { Av, Chip, Fields, Sel, Split, Trash, uid } from './ui';
import type { Mg } from './store';

// Recursos (prototype isPeople): people with role, team, area, seniority,
// cost/price, capacity, skills, 12-week load and allocations.
export function MgPeople({ mg }: { mg: Mg }) {
  const sp = useSearchParams();
  const { D, tr, lang, LV, SKN, ROLE, lvIdx } = mg;
  const L = (i: number) => mgL(i, lang);
  const [q, setQ] = useState('');
  const [lvF, setLvF] = useState(0);
  const [ppTeam, setPpTeam] = useState('');
  const [stF, setStF] = useState('');
  const qq = q.trim().toLowerCase();
  const list = mg.P.filter(
    (p) =>
      (!ppTeam || p.team === ppTeam) &&
      (!stF || (p.status ?? 'Ativo') === stF) &&
      (!lvF || p.level === lvF) &&
      (!qq ||
        [p.name, p.role, ...Object.keys(p.skills).map((k) => SKN[k])].join(' ').toLowerCase().includes(qq)),
  );
  const sel = mg.pById[sp.get('p') ?? ''] ?? list[0];
  const select = (id: string) => mg.nav('mg_people', { p: id });

  /** prototype addArea / addLevel (the "+ Nova…" option of the selects) */
  const addArea = () => {
    const n = (window.prompt(tr('Nome da nova área principal (ex.: SAP IBP)')) || '').trim();
    if (!n) return null;
    const id = `x${Date.now().toString(36)}`;
    const role = (
      window.prompt(tr('Função por omissão para esta área'), `Consultor ${n}`) || `Consultor ${n}`
    ).trim();
    return { id, n, role };
  };
  const set = (k: keyof MgPerson, num?: boolean) => (raw: string) => {
    if (!sel) return;
    if (raw === '__new') {
      if (k === 'area') {
        const r = addArea();
        if (!r) return;
        mg.upd((d) => {
          d.settings.xsk = [...(d.settings.xsk ?? []), [r.id, r.n]];
          d.settings.xrole = { ...(d.settings.xrole ?? {}), [r.id]: r.role };
          const p = d.people.find((x) => x.id === sel.id)!;
          p.area = r.id;
          p.role = r.role;
          p.skills[r.id] = p.skills[r.id] || p.level;
        });
      } else if (k === 'level') {
        const n = (window.prompt(tr('Nome do novo nível de senioridade (ex.: Principal)')) || '').trim();
        if (!n) return;
        mg.upd((d) => {
          d.settings.levels = [...(d.settings.levels ?? LV), n];
          d.people.find((x) => x.id === sel.id)!.level = LV.length;
        });
      }
      return;
    }
    const v = num ? (raw === '' ? 0 : +raw) : k === 'expYears' ? (raw === '' ? '' : +raw) : raw;
    mg.upd((d) => {
      const p = d.people.find((x) => x.id === sel.id)!;
      (p as Record<string, unknown>)[k] = v;
      if (k === 'area') {
        p.role = ROLE[raw] || p.role;
        p.skills[raw] = p.skills[raw] || p.level;
      }
    });
  };

  const side = (
    <>
      <div style={css('flex-shrink:0;display:flex;flex-direction:column;gap:10px;padding:20px 16px 12px;')}>
        <div style={css('display:flex;align-items:center;gap:10px;')}>
          <h1 style={css('margin:0;font-size:24px;font-weight:600;letter-spacing:-.02em;margin-right:auto;')}>
            {tr('Recursos')}
          </h1>
          <span style={css('font-size:12.5px;color:rgba(255,248,240,.65);white-space:nowrap;')}>
            {tr(`${list.length} pessoas`)}
          </span>
          <button
            type="button"
            title={L(62)}
            aria-label={L(62)}
            onClick={() => {
              const id = uid();
              mg.upd(
                (d) =>
                  void d.people.unshift({
                    id,
                    team: mg.gTeam !== 'all' ? mg.gTeam : (mg.TEAMS[0]?.id ?? ''),
                    name: tr('Nova Pessoa'),
                    area: 'abap',
                    role: ROLE.abap ?? '',
                    level: 2,
                    cost: MG_COST[2]!,
                    rate: MG_RATE[2]!,
                    cap: 40,
                    loc: 'Lisboa',
                    status: 'Ativo',
                    statusNote: '',
                    hired: new Date().toISOString().slice(0, 10),
                    expYears: '',
                    email: '',
                    av: mgAv(d.people.length + 3),
                    skills: { abap: 2 },
                  }),
              );
              setQ('');
              setLvF(0);
              setStF('');
              select(id);
            }}
            style={css(
              'width:32px;height:32px;border-radius:50%;border:0;background:#fbf8f5;color:#2a211c;cursor:pointer;font-size:18px;line-height:1;',
            )}
          >
            +
          </button>
        </div>
        <input
          value={q}
          placeholder={L(63)}
          aria-label={L(63)}
          onChange={(e) => setQ(e.target.value)}
          style={css(
            'height:38px;padding:0 14px;border-radius:999px;border:1px solid rgba(255,255,255,.14);background:rgba(18,12,9,.22);color:#fbf8f5;font:inherit;font-size:13.5px;outline:none;',
          )}
        />
        <div role="group" aria-label={tr('Senioridade')} style={css('display:flex;flex-wrap:wrap;gap:4px;')}>
          {[0, ...lvIdx].map((l) => (
            <Chip key={l} on={lvF === l} label={l ? LV[l]! : tr('Todos')} onClick={() => setLvF(l)} />
          ))}
        </div>
        <div style={css('display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:8px;')}>
          <Sel
            value={ppTeam}
            onChange={setPpTeam}
            label={tr('Equipa')}
            opts={mg.teamOpts.map((o) => ({ ...o, l: o.v ? o.l : tr(o.l) }))}
            pos="right 10px center"
            size="10px"
            s="height:34px;padding:0 28px 0 12px;border-radius:999px;border:1px solid rgba(255,255,255,.14);background-color:rgba(255,255,255,.06);color:#fbf8f5;font:inherit;font-size:12.5px;outline:none;width:100%;"
          />
          <Sel
            value={stF}
            onChange={setStF}
            label={tr('Filtrar por estado')}
            opts={[
              { v: '', l: tr('Todos os estados') },
              ...MG_PERSON_STATUS.map((x) => ({ v: x, l: tr(x) })),
            ]}
            pos="right 10px center"
            size="10px"
            s="height:34px;padding:0 28px 0 12px;border-radius:999px;border:1px solid rgba(255,255,255,.14);background-color:rgba(255,255,255,.06);color:#fbf8f5;font:inherit;font-size:12.5px;outline:none;width:100%;"
          />
        </div>
      </div>
      <div
        style={css(
          'flex:1;min-height:0;overflow:auto;padding:0 8px 12px;display:flex;flex-direction:column;gap:2px;',
        )}
      >
        {list.map((p) => {
          const l = Math.round(mg.avgLoad(p.id, 0, 3));
          const on = sel && p.id === sel.id;
          const t = mg.tOf(p);
          return (
            <div
              key={p.id}
              role="button"
              tabIndex={0}
              aria-current={on || undefined}
              className="mg-h8"
              onClick={() => select(p.id)}
              onKeyDown={(e) => e.key === 'Enter' && select(p.id)}
              style={css(
                `flex-shrink:0;display:flex;align-items:center;gap:10px;min-height:52px;padding:0 10px;border-radius:16px;cursor:pointer;background:${on ? 'rgba(255,255,255,.14)' : 'transparent'};border:1px solid ${on ? 'rgba(255,255,255,.2)' : 'transparent'};`,
              )}
            >
              <Av p={p} size={34} fs={12} tc={t.tc} />
              <span style={css('flex:1;min-width:0;display:flex;flex-direction:column;gap:1px;')}>
                <span
                  style={css(
                    'font-size:14px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;',
                  )}
                >
                  {p.name}
                </span>
                <span
                  style={css(
                    'font-size:12px;color:rgba(255,248,240,.64);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;',
                  )}
                >
                  {tr(p.role)}
                  {t.tn && (
                    <>
                      {' · '}
                      <span style={css(`color:${t.tc};font-weight:600;`)}>{tr(t.tn)}</span>
                    </>
                  )}
                  {' · '}
                  {LV[p.level]}
                </span>
              </span>
              {(p.status ?? 'Ativo') !== 'Ativo' && <StatusBadge status={p.status} tr={tr} />}
              <span
                title={L(64)}
                style={css(
                  `font-family:'Geist Mono',monospace;font-size:12px;font-weight:600;color:${mg.lc(l, p.cap)};`,
                )}
              >
                {l}h
              </span>
            </div>
          );
        })}
      </div>
    </>
  );

  if (!sel)
    return (
      <Split page="mg_people" list={side}>
        {null}
      </Split>
    );
  const t = mg.tOf(sel);
  const my = D.allocs
    .filter((a) => a.person === sel.id && mg.wi(a.to) >= 0)
    .sort((a, b) => a.from.localeCompare(b.from));
  let tsh = 0;
  for (let w = -4; w <= -1; w++) {
    const e = mg.tsBy[`${sel.id}|${mg.wk(w)}`];
    if (e) Object.values(e.rows).forEach((r) => r.forEach((x) => (tsh += +x || 0)));
  }
  const areaOpts = [
    ...Object.keys(ROLE).map((k) => ({ v: k, l: tr(SKN[k] ?? k) })),
    { v: '__new', l: tr('+ Nova área…') },
  ];
  const levelOpts = [
    ...lvIdx.map((l) => ({ v: String(l), l: LV[l]! })),
    { v: '__new', l: tr('+ Novo nível…') },
  ];
  return (
    <Split page="mg_people" list={side}>
      <div style={css('display:flex;flex-direction:column;gap:18px;padding:24px 26px 30px;')}>
        <div style={css('display:flex;align-items:center;gap:16px;min-width:0;')}>
          <Av p={sel} size={56} fs={19} tc={t.tc} />
          <div style={css('flex:1;min-width:0;display:flex;flex-direction:column;gap:4px;')}>
            <input
              value={sel.name}
              maxLength={120}
              aria-label={tr('Nome')}
              onChange={(e) => set('name')(e.target.value)}
              style={css(
                'width:100%;padding:0;border:0;background:transparent;color:#fbf8f5;font:inherit;font-size:26px;font-weight:600;letter-spacing:-.02em;outline:none;',
              )}
            />
            <span style={css('font-size:13px;color:rgba(255,248,240,.7);')}>
              {tr(sel.role)}
              {t.tn && (
                <>
                  {' · '}
                  <span style={css(`color:${t.tc};font-weight:600;`)}>{tr(t.tn)}</span>
                </>
              )}
              {` · ${LV[sel.level]}`}
              {sel.hired && ` ${L(18)} ${sel.hired.slice(0, 4)}`}
              {(sel.status ?? 'Ativo') !== 'Ativo' && (
                <>
                  {' '}
                  <StatusBadge status={sel.status} tr={tr} />
                </>
              )}
            </span>
          </div>
          <button
            type="button"
            className="mg-round"
            title={L(65)}
            aria-label={L(65)}
            style={{ color: '#ffc9b8' }}
            onClick={() => {
              if (!mg.cf(`Remover ${sel.name} e as suas alocações?`)) return;
              mg.upd((d) => {
                d.people = d.people.filter((x) => x.id !== sel.id);
                d.allocs = d.allocs.filter((a) => a.person !== sel.id);
                d.teams.forEach((x) => {
                  if (x.lead === sel.id) x.lead = '';
                });
                d.projects.forEach((x) => {
                  if (x.manager === sel.id) x.manager = '';
                });
                d.reqs.forEach((x) => {
                  if (x.assigned === sel.id) x.assigned = '';
                });
                d.ts = d.ts.filter((x) => x.person !== sel.id);
              });
              mg.nav('mg_people');
            }}
          >
            <Trash />
          </button>
        </div>
        <Fields
          fields={[
            {
              label: tr('Estado'),
              val: sel.status ?? 'Ativo',
              opts: MG_PERSON_STATUS.map((x) => ({ v: x, l: tr(x) })),
              onChange: set('status'),
            },
            {
              label: tr('Motivo / observações'),
              val: sel.statusNote ?? '',
              placeholder:
                (sel.status ?? 'Ativo') === 'Suspenso' ? tr('Ex.: baixa médica até 30/11') : tr('Opcional'),
              onChange: set('statusNote'),
            },
            { label: tr('Data de contratação'), val: sel.hired ?? '', type: 'date', onChange: set('hired') },
            {
              label: tr('Anos de experiência'),
              val: sel.expYears ?? '',
              type: 'number',
              unit: tr('anos'),
              onChange: (v) => set('expYears')(v === '' ? '' : String(Math.max(0, Math.min(70, Number(v))))),
            },
            { label: tr('Função'), val: sel.role, onChange: set('role') },
            {
              label: tr('Equipa'),
              val: sel.team,
              opts: mg.TEAMS.map((x) => ({ v: x.id, l: x.name })),
              onChange: set('team'),
            },
            { label: tr('Área principal'), val: sel.area, opts: areaOpts, onChange: set('area') },
            {
              label: tr('Senioridade'),
              val: String(sel.level),
              opts: levelOpts,
              onChange: set('level', true),
            },
            {
              label: tr('Custo interno'),
              val: sel.cost,
              type: 'number',
              unit: '€/h',
              onChange: set('cost', true),
            },
            {
              label: tr('Preço de venda'),
              val: sel.rate,
              type: 'number',
              unit: '€/h',
              onChange: set('rate', true),
            },
            {
              label: tr('Capacidade'),
              val: sel.cap,
              type: 'number',
              unit: tr('h/semana'),
              onChange: set('cap', true),
            },
            { label: tr('Localização'), val: sel.loc, onChange: set('loc') },
            { label: tr('Email'), val: sel.email, onChange: set('email') },
          ]}
        />
        <div style={css('display:flex;flex-direction:column;gap:10px;')}>
          <div style={css('display:flex;align-items:center;gap:10px;')}>
            <span style={css('font-size:16px;font-weight:600;margin-right:auto;')}>{L(19)}</span>
            <span style={css('font-size:12px;color:rgba(255,248,240,.6);')}>{L(20)}</span>
          </div>
          <div style={css('display:flex;flex-wrap:wrap;gap:6px;align-items:center;')}>
            {Object.entries(sel.skills)
              .sort((a, b) => b[1] - a[1])
              .map(([k, l]) => (
                <span
                  key={k}
                  style={css(
                    `display:flex;align-items:center;height:30px;border-radius:999px;background:${mg.LVC[l]};border:1px solid rgba(255,255,255,.16);overflow:hidden;`,
                  )}
                >
                  <button
                    type="button"
                    onClick={() =>
                      mg.upd((d) => {
                        const p = d.people.find((x) => x.id === sel.id)!;
                        p.skills[k] = (p.skills[k]! % mg.NL) + 1;
                      })
                    }
                    style={css(
                      'height:100%;padding:0 6px 0 12px;border:0;background:transparent;color:#fbf8f5;font:inherit;font-size:12.5px;cursor:pointer;display:flex;align-items:center;gap:7px;',
                    )}
                  >
                    <span style={css('font-weight:600;')}>{tr(SKN[k] ?? k)}</span>
                    <span style={css('font-size:11px;opacity:.85;')}>{LV[l]}</span>
                  </button>
                  <button
                    type="button"
                    className="mg-hx"
                    title={L(38)}
                    aria-label={`${L(38)} ${SKN[k] ?? k}`}
                    onClick={() =>
                      mg.upd((d) => {
                        delete d.people.find((x) => x.id === sel.id)!.skills[k];
                      })
                    }
                    style={css(
                      'height:100%;width:24px;border:0;background:transparent;color:rgba(255,248,240,.6);cursor:pointer;padding:0;font-size:13px;',
                    )}
                  >
                    ×
                  </button>
                </span>
              ))}
            <select
              value=""
              aria-label={L(21)}
              onChange={(e) => {
                const k = e.target.value;
                if (k) mg.upd((d) => void (d.people.find((x) => x.id === sel.id)!.skills[k] = 1));
              }}
              style={{
                ...css(
                  'height:30px;padding:0 26px 0 12px;border-radius:999px;border:1.5px dashed rgba(255,255,255,.28);background-color:transparent;color:rgba(255,248,240,.85);font:inherit;font-size:12.5px;cursor:pointer;appearance:none;-webkit-appearance:none;color-scheme:dark;',
                ),
                backgroundImage: CHEV,
                backgroundRepeat: 'no-repeat',
                backgroundPosition: 'right 9px center',
                backgroundSize: '10px',
              }}
            >
              <option value="" style={OPT}>
                {L(21)}
              </option>
              {mg.SKL.filter(([k]) => !sel.skills[k]).map(([v, l]) => (
                <option key={v} value={v} style={OPT}>
                  {tr(l)}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div style={css('display:flex;flex-direction:column;gap:10px;')}>
          <span style={css('font-size:16px;font-weight:600;')}>{L(22)}</span>
          <div style={css('display:grid;grid-template-columns:repeat(12,minmax(0,1fr));gap:4px;')}>
            {Array.from({ length: 12 }, (_, w) => {
              const h = mg.loadW(sel.id, w);
              const c = mg.heat(h, sel.cap);
              return (
                <div
                  key={w}
                  title={tr(`${h}h na semana de ${wLblY(mg.wk(w))}`)}
                  style={css('display:flex;flex-direction:column;gap:4px;align-items:stretch;min-width:0;')}
                >
                  <div
                    style={css(
                      `height:34px;border-radius:9px;background:${c.bg};display:flex;align-items:center;justify-content:center;font-family:'Geist Mono',monospace;font-size:11.5px;font-weight:600;color:${c.fg};`,
                    )}
                  >
                    {h || '·'}
                  </div>
                  <span
                    style={css(
                      'font-size:10.5px;text-align:center;color:rgba(255,248,240,.55);white-space:nowrap;',
                    )}
                  >
                    {wLbl(mg.wk(w))}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
        <div style={css('display:flex;flex-direction:column;gap:8px;')}>
          <div style={css('display:flex;align-items:center;gap:10px;')}>
            <span style={css('font-size:16px;font-weight:600;margin-right:auto;')}>{L(23)}</span>
            <span style={css('font-size:12px;color:rgba(255,248,240,.62);')}>
              {tr(`${tsh}h registadas nas últimas 4 semanas`)}
            </span>
          </div>
          {my.map((a) => {
            const pj = mg.pjById[a.project];
            return (
              <div
                key={a.id}
                role="button"
                tabIndex={0}
                className="mg-h10"
                onClick={() => mg.nav('mg_projects', { pj: a.project })}
                onKeyDown={(e) => e.key === 'Enter' && mg.nav('mg_projects', { pj: a.project })}
                style={css(
                  'display:flex;align-items:center;gap:12px;min-height:48px;padding:0 14px;border-radius:16px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);cursor:pointer;',
                )}
              >
                <span
                  style={css(
                    `width:4px;height:26px;flex:none;border-radius:999px;background:${pj?.color ?? 'transparent'};`,
                  )}
                />
                <span style={css('flex:1;min-width:0;display:flex;flex-direction:column;')}>
                  <span
                    style={css(
                      'font-size:13.5px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;',
                    )}
                  >
                    <span style={css("font-family:'Geist Mono',monospace;")}>{pj?.code}</span> · {pj?.name}
                  </span>
                  <span style={css('font-size:12px;color:rgba(255,248,240,.62);')}>
                    {wLblY(a.from)} → {wLblY(a.to)}
                  </span>
                </span>
                <span style={css("font-family:'Geist Mono',monospace;font-size:13px;font-weight:600;")}>
                  {tr(`${a.hours}h/sem`)}
                </span>
              </div>
            );
          })}
          {!my.length && <div style={css('font-size:13px;color:rgba(255,248,240,.62);')}>{L(24)}</div>}
        </div>
      </div>
    </Split>
  );
}

const ST_C: Record<string, string> = {
  Inativo: 'rgba(255,255,255,.16)',
  Suspenso: 'oklch(0.7 0.15 50 / .35)',
};
/** "Inativo" / "Suspenso" next to a person (Ativo shows nothing). */
export function StatusBadge({ status, tr }: { status: string; tr: (s: string) => string }) {
  return (
    <span
      style={css(
        `flex:none;display:inline-flex;align-items:center;height:20px;padding:0 8px;border-radius:999px;font-size:11px;font-weight:700;color:#fbf8f5;background:${ST_C[status] ?? 'rgba(255,255,255,.16)'};vertical-align:middle;`,
      )}
    >
      {tr(status)}
    </span>
  );
}
