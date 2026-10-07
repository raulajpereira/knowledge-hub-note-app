'use client';

import { wLbl, wLblY, type MgPerson } from '@/lib/mg';
import { mgL } from '@/lib/mgText';
import { css } from './css';
import { Av, Glass } from './ui';
import type { Mg } from './store';

const BOX =
  'display:flex;flex-direction:column;gap:4px;padding:16px 14px 12px;border-radius:22px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.12);';

// Visão Geral (prototype isOverview): KPIs, team capacity over 12 weeks,
// over-allocated and available people, budget of the active projects.
export function MgOverview({ mg }: { mg: Mg }) {
  const { D, tr, lang, P, PJ, LV, wk, wi } = mg;
  const L = (i: number) => mgL(i, lang);
  const act = PJ.filter((p) => p.status !== 'Concluído' && wi(p.from) <= 0 && wi(p.to) >= 0);
  const cap = P.reduce((s, p) => s + (+p.cap || 40), 0);
  const weeks = Array.from({ length: 12 }, (_, w) => P.reduce((s, p) => s + mg.loadW(p.id, w), 0));
  const util4 = mg.pct(weeks.slice(0, 4).reduce((a, b) => a + b, 0) / 4, cap);
  const over = P.map((p) => {
    let mx = 0;
    let mw = 0;
    for (let w = 0; w < 4; w++) {
      const h = mg.loadW(p.id, w);
      if (h > mx) {
        mx = h;
        mw = w;
      }
    }
    return { p, mx, mw };
  })
    .filter((x) => x.mx > (+x.p.cap || 40))
    .sort((a, b) => b.mx - a.mx);
  const free = P.map((p) => ({ p, f: (+p.cap || 40) - mg.avgLoad(p.id, 0, 3) }))
    .filter((x) => x.f >= 16)
    .sort((a, b) => b.f - a.f);
  const openReqs = D.reqs.filter((r) => r.status !== 'Preenchido');
  const DIM = 'rgba(255,248,240,.62)';
  const kpis = [
    {
      label: 'Ocupação · 4 semanas',
      val: `${util4}%`,
      sub: util4 > 95 ? 'Equipa no limite' : util4 < 70 ? 'Capacidade livre' : 'Dentro do previsto',
      subC: util4 > 95 ? 'oklch(0.84 0.13 30)' : DIM,
      go: () => mg.nav('mg_alloc'),
    },
    {
      label: 'Sobre-alocados',
      val: String(over.length),
      sub: 'acima de 40h numa semana',
      subC: over.length ? 'oklch(0.84 0.13 30)' : DIM,
      go: () => mg.nav('mg_alloc', { mode: 'heat' }),
    },
    {
      label: 'Disponíveis',
      val: String(free.length),
      sub: '≥ 16h livres por semana',
      subC: DIM,
      go: () => mg.nav('mg_people'),
    },
    {
      label: 'Pedidos de Recurso',
      val: String(openReqs.length),
      sub: 'abertos ou propostos',
      subC: openReqs.length ? 'oklch(0.86 0.12 75)' : DIM,
      go: () => mg.nav('mg_staff'),
    },
  ];
  const person = (p: MgPerson, right: React.ReactNode, lvl: boolean) => {
    const tm = mg.tOf(p);
    const go = () => mg.nav('mg_people', { p: p.id });
    return (
      <div
        key={p.id}
        role="button"
        tabIndex={0}
        className="mg-h6"
        onClick={go}
        onKeyDown={(e) => e.key === 'Enter' && go()}
        style={css(
          'display:flex;align-items:center;gap:10px;min-height:44px;padding:0 8px;border-radius:14px;cursor:pointer;',
        )}
      >
        <Av p={p} size={30} fs={11} tc={tm.tc} />
        <span style={css('flex:1;min-width:0;display:flex;flex-direction:column;')}>
          <span
            style={css(
              'font-size:13.5px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;',
            )}
          >
            {p.name}
          </span>
          <span style={css('font-size:11.5px;color:rgba(255,248,240,.62);')}>
            {tr(p.role)}
            {tm.tn && (
              <>
                {' · '}
                <span style={css(`color:${tm.tc};font-weight:600;`)}>{tm.tn}</span>
              </>
            )}
            {lvl && ` · ${LV[p.level]}`}
          </span>
        </span>
        {right}
      </div>
    );
  };

  return (
    <Glass label={L(7)}>
      <div
        style={css(
          'flex-shrink:0;display:flex;flex-wrap:wrap;align-items:flex-end;gap:12px;padding:22px 24px 14px;',
        )}
      >
        <div style={css('display:flex;flex-direction:column;gap:4px;margin-right:auto;min-width:0;')}>
          <h1 style={css('margin:0;font-size:28px;font-weight:600;letter-spacing:-.02em;')}>{L(7)}</h1>
          <span style={css('font-size:13.5px;color:rgba(255,248,240,.72);')}>
            {tr(`${P.length} pessoas · ${act.length} projetos ativos · semana de ${wLblY(wk(0))}`)}
          </span>
        </div>
      </div>
      <div
        style={css(
          'flex:1;min-height:0;overflow:auto;padding:0 24px 24px;display:flex;flex-direction:column;gap:16px;',
        )}
      >
        <div style={css('display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:12px;')}>
          {kpis.map((k) => (
            <div
              key={k.label}
              role="button"
              tabIndex={0}
              className="mg-h12"
              onClick={k.go}
              onKeyDown={(e) => e.key === 'Enter' && k.go()}
              style={css(
                'display:flex;flex-direction:column;gap:6px;padding:16px 18px;border-radius:22px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.12);cursor:pointer;',
              )}
            >
              <span style={css('font-size:12.5px;color:rgba(255,248,240,.72);')}>{tr(k.label)}</span>
              <span
                style={css(
                  "font-family:'Geist Mono',monospace;font-size:28px;font-weight:600;letter-spacing:-.02em;",
                )}
              >
                {k.val}
              </span>
              <span style={css(`font-size:12px;color:${k.subC};`)}>{tr(k.sub)}</span>
            </div>
          ))}
        </div>
        <div
          style={css(
            'display:flex;flex-direction:column;gap:14px;padding:18px 20px;border-radius:22px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.12);',
          )}
        >
          <div style={css('display:flex;flex-wrap:wrap;align-items:center;gap:14px;')}>
            <span style={css('font-size:16px;font-weight:600;margin-right:auto;')}>{L(8)}</span>
            <span
              style={css(
                'display:flex;align-items:center;gap:6px;font-size:12px;color:rgba(255,248,240,.75);',
              )}
            >
              <span
                style={css('width:10px;height:10px;border-radius:3px;background:oklch(0.78 0.11 200);')}
              />
              {L(9)}
            </span>
            <span
              style={css(
                'display:flex;align-items:center;gap:6px;font-size:12px;color:rgba(255,248,240,.75);',
              )}
            >
              <span
                style={css('width:10px;height:10px;border-radius:3px;background:rgba(255,255,255,.14);')}
              />
              {L(10)}
            </span>
          </div>
          <div
            style={css(
              'display:grid;grid-template-columns:repeat(12,minmax(0,1fr));gap:8px;align-items:end;height:170px;',
            )}
          >
            {weeks.map((a, i) => {
              const p = mg.pct(a, cap);
              return (
                <div
                  key={i}
                  title={tr(`${a}h alocadas de ${cap}h`)}
                  style={css(
                    'height:100%;display:flex;flex-direction:column;justify-content:flex-end;gap:6px;min-width:0;',
                  )}
                >
                  <span
                    style={css(
                      "font-family:'Geist Mono',monospace;font-size:11px;text-align:center;color:rgba(255,248,240,.8);",
                    )}
                  >
                    {p}%
                  </span>
                  <div
                    style={css(
                      'position:relative;height:120px;border-radius:10px;background:rgba(255,255,255,.08);overflow:hidden;',
                    )}
                  >
                    <div
                      style={css(
                        `position:absolute;left:0;right:0;bottom:0;height:${Math.min(100, p)}%;border-radius:10px 10px 0 0;background:${p > 100 ? 'oklch(0.7 0.15 30)' : 'oklch(0.78 0.11 200)'};`,
                      )}
                    />
                  </div>
                  <span
                    style={css(
                      'font-size:11px;text-align:center;color:rgba(255,248,240,.62);white-space:nowrap;',
                    )}
                  >
                    {wLbl(wk(i))}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
        <div style={css('display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:12px;')}>
          <div style={css(BOX)}>
            <div style={css('display:flex;align-items:center;gap:8px;padding:0 6px 8px;')}>
              <span style={css('width:8px;height:8px;border-radius:50%;background:oklch(0.72 0.16 25);')} />
              <span style={css('font-size:15px;font-weight:600;')}>{L(11)}</span>
              <span style={css('margin-left:auto;font-size:12px;color:rgba(255,248,240,.6);')}>{L(12)}</span>
            </div>
            {over.slice(0, 6).map((x) =>
              person(
                x.p,
                <span
                  style={css(
                    "font-family:'Geist Mono',monospace;font-size:13px;font-weight:600;color:oklch(0.82 0.13 30);",
                  )}
                >
                  {x.mx}h · {wLbl(wk(x.mw))}
                </span>,
                false,
              ),
            )}
            {!over.length && (
              <div style={css('padding:8px;font-size:13px;color:rgba(255,248,240,.62);')}>{L(13)}</div>
            )}
          </div>
          <div style={css(BOX)}>
            <div style={css('display:flex;align-items:center;gap:8px;padding:0 6px 8px;')}>
              <span style={css('width:8px;height:8px;border-radius:50%;background:oklch(0.8 0.14 150);')} />
              <span style={css('font-size:15px;font-weight:600;')}>{L(14)}</span>
              <span style={css('margin-left:auto;font-size:12px;color:rgba(255,248,240,.6);')}>{L(15)}</span>
            </div>
            {free
              .slice(0, 6)
              .map((x) =>
                person(
                  x.p,
                  <span
                    style={css(
                      "font-family:'Geist Mono',monospace;font-size:13px;font-weight:600;color:oklch(0.86 0.12 150);",
                    )}
                  >
                    {Math.round(x.f)}h
                  </span>,
                  true,
                ),
              )}
          </div>
          <div style={css(BOX)}>
            <div style={css('display:flex;align-items:center;gap:8px;padding:0 6px 8px;')}>
              <span style={css('font-size:15px;font-weight:600;')}>{L(16)}</span>
            </div>
            {act.map((p) => {
              const r = mg.pct(mg.tsHours(p.id).v, p.budget);
              const go = () => mg.nav('mg_projects', { pj: p.id });
              return (
                <div
                  key={p.id}
                  role="button"
                  tabIndex={0}
                  className="mg-h6"
                  onClick={go}
                  onKeyDown={(e) => e.key === 'Enter' && go()}
                  style={css(
                    'display:flex;flex-direction:column;gap:6px;padding:8px;border-radius:14px;cursor:pointer;',
                  )}
                >
                  <div style={css('display:flex;align-items:center;gap:8px;min-width:0;')}>
                    <span
                      style={css(`width:8px;height:8px;flex:none;border-radius:50%;background:${p.color};`)}
                    />
                    <span style={css("font-family:'Geist Mono',monospace;font-size:12px;font-weight:600;")}>
                      {p.code}
                    </span>
                    <span
                      style={css(
                        'flex:1;min-width:0;font-size:12.5px;color:rgba(255,248,240,.72);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;',
                      )}
                    >
                      {p.name}
                    </span>
                    <span
                      style={css(
                        `font-family:'Geist Mono',monospace;font-size:12px;color:${r > 90 ? 'oklch(0.84 0.13 30)' : 'rgba(255,248,240,.75)'};`,
                      )}
                    >
                      {r}%
                    </span>
                  </div>
                  <div
                    style={css(
                      'height:5px;border-radius:999px;background:rgba(255,255,255,.1);overflow:hidden;',
                    )}
                  >
                    <div
                      style={css(
                        `height:100%;width:${Math.min(100, r)}%;border-radius:999px;background:${r > 90 ? 'oklch(0.72 0.15 30)' : p.color};`,
                      )}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </Glass>
  );
}
