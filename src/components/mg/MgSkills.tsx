'use client';

import { useState } from 'react';
import { mgL } from '@/lib/mgText';
import { css } from './css';
import { Av, Glass } from './ui';
import type { Mg } from './store';

const HEAD_BG =
  'background:linear-gradient(90deg,rgba(255,255,255,.09),rgba(255,255,255,.05));backdrop-filter:blur(var(--glass-blur-user, 28px)) saturate(150%);border-right:1px solid rgba(255,255,255,.1);';

// Competências (prototype isSkills): people × skill areas; a click moves the
// level up (wrapping back to none); the footer counts Sénior + Expert per area.
export function MgSkills({ mg }: { mg: Mg }) {
  const { lang, P, SKL, LV, LVS, LVC, NL, lvIdx } = mg;
  const L = (i: number) => mgL(i, lang);
  const [q, setQ] = useState('');
  const qq = q.trim().toLowerCase();
  const rows = P.filter((p) => !qq || `${p.name} ${p.role}`.toLowerCase().includes(qq)).sort(
    (a, b) => a.area.localeCompare(b.area) || b.level - a.level,
  );
  const grid = `260px repeat(${SKL.length}, minmax(92px,1fr))`;
  const cycle = (pid: string, k: string) =>
    mg.upd((d) => {
      const x = d.people.find((y) => y.id === pid)!;
      const n = ((x.skills[k] ?? 0) + 1) % (NL + 1);
      if (n) x.skills[k] = n;
      else delete x.skills[k];
    });

  return (
    <Glass label={L(19)}>
      <div
        style={css(
          'flex-shrink:0;display:flex;flex-wrap:wrap;align-items:flex-end;gap:12px;padding:22px 24px 14px;',
        )}
      >
        <div style={css('display:flex;flex-direction:column;gap:4px;margin-right:auto;')}>
          <h1 style={css('margin:0;font-size:28px;font-weight:600;letter-spacing:-.02em;')}>{L(19)}</h1>
          <span style={css('font-size:13.5px;color:rgba(255,248,240,.72);')}>{L(25)}</span>
        </div>
        <div style={css('display:flex;flex-wrap:wrap;gap:6px;align-items:center;')}>
          {lvIdx.map((l) => (
            <span
              key={l}
              style={css(
                'display:flex;align-items:center;gap:6px;font-size:12px;color:rgba(255,248,240,.8);',
              )}
            >
              <span
                style={css(
                  `width:22px;height:18px;border-radius:5px;background:${LVC[l]};display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;`,
                )}
              >
                {LVS[l]}
              </span>
              {LV[l]}
            </span>
          ))}
        </div>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={L(66)}
          aria-label={L(66)}
          style={css(
            'width:200px;height:36px;padding:0 14px;border-radius:999px;border:1px solid rgba(255,255,255,.14);background:rgba(18,12,9,.22);color:#fbf8f5;font:inherit;font-size:13px;outline:none;',
          )}
        />
      </div>
      <div
        style={css(
          'flex:1;min-height:0;overflow:auto;margin:0 12px 12px;border-radius:22px;background:rgba(18,12,9,.18);border:1px solid rgba(255,255,255,.1);',
        )}
      >
        <div role="table" aria-label={L(19)} style={css(`min-width:${260 + SKL.length * 92}px;width:100%;`)}>
          <div
            role="row"
            style={css(
              `position:sticky;top:0;z-index:3;display:grid;grid-template-columns:${grid};align-items:stretch;height:52px;background:linear-gradient(180deg,rgba(255,255,255,.2),rgba(255,255,255,.1));backdrop-filter:blur(var(--glass-blur-user, 30px)) saturate(160%);border-bottom:1px solid rgba(255,255,255,.16);`,
            )}
          >
            <span
              role="columnheader"
              style={css(
                `position:sticky;left:0;align-self:stretch;display:flex;align-items:center;padding:0 14px;font-size:12px;font-weight:600;color:rgba(255,248,240,.8);${HEAD_BG}`,
              )}
            >
              {L(26)}
            </span>
            {SKL.map(([k, l]) => (
              <span
                key={k}
                role="columnheader"
                title={l}
                style={css(
                  'display:flex;align-items:center;justify-content:center;padding:0 6px;min-width:0;text-align:center;font-size:11.5px;font-weight:600;line-height:1.25;color:rgba(255,248,240,.9);overflow:hidden;',
                )}
              >
                {l}
              </span>
            ))}
          </div>
          {rows.map((p) => (
            <div
              key={p.id}
              role="row"
              className="mg-skrow"
              style={css(
                `display:grid;grid-template-columns:${grid};align-items:center;height:58px;border-bottom:1px solid rgba(255,255,255,.06);`,
              )}
            >
              <span
                role="rowheader"
                tabIndex={0}
                onClick={() => mg.nav('mg_people', { p: p.id })}
                onKeyDown={(e) => e.key === 'Enter' && mg.nav('mg_people', { p: p.id })}
                style={css(
                  `position:sticky;left:0;z-index:1;height:100%;display:flex;align-items:center;gap:12px;padding:0 20px;min-width:0;cursor:pointer;${HEAD_BG}`,
                )}
              >
                <Av
                  p={p}
                  size={34}
                  fs={9.5}
                  tc={mg.tOf(p).tc}
                  s="box-shadow:0 0 0 2px rgba(255,255,255,.12);"
                />
                <span
                  style={css(
                    'flex:1;min-width:0;font-size:14px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;',
                  )}
                >
                  {p.name}
                </span>
                <span style={css('font-size:10.5px;color:rgba(255,248,240,.55);')}>{LVS[p.level]}</span>
              </span>
              {SKL.map(([k, lab]) => {
                const l = p.skills[k] ?? 0;
                const tip = `${p.name} · ${lab}${l ? ` · ${LV[l]}` : ''}`;
                return (
                  <span key={k} role="cell" style={css('display:flex;justify-content:center;')}>
                    <button
                      type="button"
                      title={tip}
                      aria-label={tip}
                      className="mg-hb"
                      onClick={() => cycle(p.id, k)}
                      style={css(
                        `width:80px;height:26px;border-radius:8px;border:1px solid ${l ? 'rgba(255,255,255,.18)' : 'rgba(255,255,255,.07)'};background:${LVC[l] ?? 'transparent'};color:#fbf8f5;font:inherit;font-size:11.5px;font-weight:600;cursor:pointer;padding:0 4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;`,
                      )}
                    >
                      {LV[l] || ''}
                    </button>
                  </span>
                );
              })}
            </div>
          ))}
          <div
            role="row"
            style={css(
              `position:sticky;bottom:0;z-index:2;display:grid;grid-template-columns:${grid};align-items:center;height:38px;background:linear-gradient(180deg,rgba(255,255,255,.14),rgba(255,255,255,.08));backdrop-filter:blur(var(--glass-blur-user, 30px));border-top:1px solid rgba(255,255,255,.16);`,
            )}
          >
            <span
              role="rowheader"
              style={css(
                'position:sticky;left:0;padding:0 14px;font-size:11.5px;font-weight:600;color:rgba(255,248,240,.8);',
              )}
            >
              {L(27)}
            </span>
            {SKL.map(([k]) => {
              const n = P.filter((p) => (p.skills[k] ?? 0) >= 3).length;
              return (
                <span
                  key={k}
                  role="cell"
                  style={css(
                    `text-align:center;font-family:'Geist Mono',monospace;font-size:12px;font-weight:600;color:${n === 0 ? 'oklch(0.82 0.14 30)' : n === 1 ? 'oklch(0.86 0.12 75)' : 'rgba(255,248,240,.85)'};`,
                  )}
                >
                  {n}
                </span>
              );
            })}
          </div>
        </div>
      </div>
    </Glass>
  );
}
