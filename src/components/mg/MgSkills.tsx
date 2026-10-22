'use client';

import { useState } from 'react';
import { mgL } from '@/lib/mgText';
import { useI18n } from '@/i18n/client';
import { css } from './css';
import { Av, Glass } from './ui';
import type { Mg } from './store';

const HEAD_BG =
  'background:linear-gradient(90deg,rgb(var(--sf) / calc(.09 * var(--sf-k))),rgb(var(--sf) / calc(.05 * var(--sf-k))));backdrop-filter:blur(var(--glass-blur-user, 28px)) saturate(150%);border-right:1px solid rgb(var(--w) / .1);';

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
  // phones (D71): consult only — a narrow sticky name column, cells not clickable
  const phone = mg.vp === 'phone';
  const { t } = useI18n();
  const grid = phone
    ? `128px repeat(${SKL.length}, minmax(72px,1fr))`
    : `260px repeat(${SKL.length}, minmax(92px,1fr))`;
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
          <span style={css('font-size:13.5px;color:rgb(var(--t) / calc(.72 * var(--t-k)));')}>{L(25)}</span>
        </div>
        <div style={css('display:flex;flex-wrap:wrap;gap:6px;align-items:center;')}>
          {lvIdx.map((l) => (
            <span
              key={l}
              style={css(
                'display:flex;align-items:center;gap:6px;font-size:12px;color:rgb(var(--t) / calc(.8 * var(--t-k)));',
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
        {phone && (
          <span className="mg-mnote" role="note" title={t('mob_editOnDesktopHint')}>
            {t('mob_editOnDesktop')}
          </span>
        )}
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={L(66)}
          aria-label={L(66)}
          style={css(
            'width:200px;height:36px;padding:0 14px;border-radius:999px;border:1px solid rgb(var(--w) / .14);background:rgb(var(--d) / calc(.22 * var(--d-k)));color:var(--ink);font:inherit;font-size:13px;outline:none;',
          )}
        />
      </div>
      <div
        style={css(
          'flex:1;min-height:0;overflow:auto;margin:0 12px 12px;border-radius:22px;background:rgb(var(--d) / calc(.18 * var(--d-k)));border:1px solid rgb(var(--w) / .1);',
        )}
      >
        <div
          role="table"
          aria-label={L(19)}
          style={css(
            phone
              ? `min-width:${128 + SKL.length * 72}px;width:100%;`
              : `min-width:${260 + SKL.length * 92}px;width:100%;`,
          )}
        >
          <div
            role="row"
            style={css(
              `position:sticky;top:0;z-index:3;display:grid;grid-template-columns:${grid};align-items:stretch;height:52px;background:linear-gradient(180deg,rgb(var(--sf) / calc(.2 * var(--sf-k))),rgb(var(--sf) / calc(.1 * var(--sf-k))));backdrop-filter:blur(var(--glass-blur-user, 30px)) saturate(160%);border-bottom:1px solid rgb(var(--w) / .16);`,
            )}
          >
            <span
              role="columnheader"
              style={css(
                `position:sticky;left:0;align-self:stretch;display:flex;align-items:center;padding:0 14px;font-size:12px;font-weight:600;color:rgb(var(--t) / calc(.8 * var(--t-k)));${HEAD_BG}`,
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
                  'display:flex;align-items:center;justify-content:center;padding:0 6px;min-width:0;text-align:center;font-size:11.5px;font-weight:600;line-height:1.25;color:rgb(var(--t) / calc(.9 * var(--t-k)));overflow:hidden;',
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
                `display:grid;grid-template-columns:${grid};align-items:center;height:58px;border-bottom:1px solid rgb(var(--w) / .06);`,
              )}
            >
              <span
                role="rowheader"
                tabIndex={0}
                onClick={() => mg.nav('mg_people', { p: p.id })}
                onKeyDown={(e) => e.key === 'Enter' && mg.nav('mg_people', { p: p.id })}
                style={css(
                  phone
                    ? `position:sticky;left:0;z-index:1;height:100%;display:flex;align-items:center;gap:8px;padding:0 8px 0 10px;min-width:0;cursor:pointer;${HEAD_BG}`
                    : `position:sticky;left:0;z-index:1;height:100%;display:flex;align-items:center;gap:12px;padding:0 20px;min-width:0;cursor:pointer;${HEAD_BG}`,
                )}
              >
                <Av
                  p={p}
                  size={phone ? 26 : 34}
                  fs={9.5}
                  tc={mg.tOf(p).tc}
                  s="box-shadow:0 0 0 2px rgb(var(--w) / .12);"
                />
                <span
                  style={css(
                    'flex:1;min-width:0;font-size:14px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;',
                  )}
                >
                  {p.name}
                </span>
                <span style={css('font-size:10.5px;color:rgb(var(--t) / calc(.55 * var(--t-k)));')}>
                  {LVS[p.level]}
                </span>
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
                      onClick={phone ? undefined : () => cycle(p.id, k)}
                      aria-disabled={phone || undefined}
                      style={css(
                        `width:${phone ? 62 : 80}px;height:26px;border-radius:8px;border:1px solid ${l ? 'rgb(var(--w) / .18)' : 'rgb(var(--w) / .07)'};background:${LVC[l] ?? 'transparent'};color:var(--ink);font:inherit;font-size:11.5px;font-weight:600;cursor:pointer;padding:0 4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;`,
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
              `position:sticky;bottom:0;z-index:2;display:grid;grid-template-columns:${grid};align-items:center;height:38px;background:linear-gradient(180deg,rgb(var(--sf) / calc(.14 * var(--sf-k))),rgb(var(--sf) / calc(.08 * var(--sf-k))));backdrop-filter:blur(var(--glass-blur-user, 30px));border-top:1px solid rgb(var(--w) / .16);`,
            )}
          >
            <span
              role="rowheader"
              style={css(
                'position:sticky;left:0;padding:0 14px;font-size:11.5px;font-weight:600;color:rgb(var(--t) / calc(.8 * var(--t-k)));',
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
                    `text-align:center;font-family:'Geist Mono',monospace;font-size:12px;font-weight:600;color:${n === 0 ? 'oklch(0.82 0.14 30)' : n === 1 ? 'oklch(0.86 0.12 75)' : 'rgb(var(--t) / calc(.85 * var(--t-k)))'};`,
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
