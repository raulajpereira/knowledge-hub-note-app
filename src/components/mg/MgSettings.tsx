'use client';

import { useState } from 'react';
import { MG_LV, MG_ROLE, MG_SKN, type MgData } from '@/lib/mg';
import { mgL } from '@/lib/mgText';
import { api } from '@/lib/client/api';
import { useToast } from '@/components/ui';
import { css } from './css';
import { MgProvider, useMg } from './store';
import './mg.css';

const IN =
  'height:34px;padding:0 10px;border-radius:10px;border:1px solid rgba(255,255,255,.1);background:rgba(18,12,9,.16);color:#fbf8f5;font:inherit;font-size:13px;outline:none;min-width:0;box-sizing:border-box;';
const BOX =
  'display:flex;flex-direction:column;border-radius:16px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.04);';
const DEL =
  'width:28px;height:28px;flex:none;border-radius:50%;border:0;background:transparent;color:rgba(255,248,240,.55);cursor:pointer;padding:0;font-size:15px;';
const ADD =
  'height:34px;padding:0 14px;border-radius:999px;border:0;background:#fbf8f5;color:#2a211c;font:inherit;font-size:12.5px;font-weight:600;cursor:pointer;white-space:nowrap;';

/** Definições › Management (prototype page mg_settings). */
export function MgSettingsTab() {
  return (
    <div className="kh-set__card mg-page" style={{ flex: 'none' }}>
      <MgProvider>
        <MgSettings />
      </MgProvider>
    </div>
  );
}

function MgSettings() {
  const mg = useMg();
  const toast = useToast();
  const { tr, lang, ROLE, SKN, LV, LVR, NL, lvIdx, P } = mg;
  const L = (i: number) => mgL(i, lang);
  const [nA, setNA] = useState('');
  const [nR, setNR] = useState('');
  const [nL, setNL] = useState('');
  const used = (k: string) => P.filter((p) => p.area === k).length;
  const areas = Object.keys(ROLE).map((k) => ({ k, name: SKN[k] ?? k, role: ROLE[k]! }));
  const setA = (k: string, f: 'name' | 'role') => (v: string) =>
    mg.upd((d) => {
      if (f === 'role') d.settings.xrole = { ...(d.settings.xrole ?? {}), [k]: v };
      else d.settings.xskn = { ...(d.settings.xskn ?? {}), [k]: v };
    });
  const delArea = (k: string, name: string) => {
    const n = used(k);
    const rest = Object.keys(ROLE).filter((x) => x !== k);
    if (n && !mg.cf(`${n} pessoa(s) têm a área ${name}. Passam para ${SKN[rest[0]!] ?? rest[0]}. Continuar?`))
      return;
    mg.upd((d) => {
      d.people.forEach((p) => {
        if (p.area === k) {
          p.area = rest[0]!;
          p.role = ROLE[rest[0]!] ?? p.role;
        }
        delete p.skills[k];
      });
      d.reqs.forEach((r) => {
        r.skills = r.skills.map((s) => (s.k === k ? { ...s, k: rest[0]! } : s));
      });
      d.teams.forEach((t) => {
        t.areas = t.areas.filter((x) => x !== k);
      });
      const s = d.settings;
      s.xsk = (s.xsk ?? []).filter((x) => x[0] !== k);
      const r = { ...(s.xrole ?? {}) };
      delete r[k];
      s.xrole = r;
      if (MG_ROLE[k] || MG_SKN[k]) s.hiddenAreas = [...(s.hiddenAreas ?? []), k];
    });
  };
  const addArea = () => {
    const n = nA.trim();
    if (!n) return;
    const id = `x${Date.now().toString(36)}`;
    mg.upd((d) => {
      d.settings.xsk = [...(d.settings.xsk ?? []), [id, n]];
      d.settings.xrole = { ...(d.settings.xrole ?? {}), [id]: nR.trim() || `Consultor ${n}` };
    });
    setNA('');
    setNR('');
  };
  const delLevel = (l: number) => {
    const n = P.filter((p) => p.level === l).length;
    const to = l > 1 ? l - 1 : 1;
    if (n && !mg.cf(`${n} pessoa(s) estão em ${LV[l]}. Passam para ${l > 1 ? LV[l - 1] : LV[2]}. Continuar?`))
      return;
    const mv = (v: number) => (v === l ? to : v > l ? v - 1 : v);
    mg.upd((d) => {
      const lv = [...(d.settings.levels ?? MG_LV)];
      lv.splice(l, 1);
      d.settings.levels = lv;
      d.people.forEach((p) => {
        p.level = mv(p.level);
        for (const k of Object.keys(p.skills)) p.skills[k] = mv(p.skills[k]!);
      });
      d.reqs.forEach((r) => {
        r.skills = r.skills.map((s) => ({ ...s, l: mv(s.l) }));
      });
    });
  };
  const addLevel = () => {
    const n = nL.trim();
    if (!n) return;
    mg.upd((d) => void (d.settings.levels = [...(d.settings.levels ?? MG_LV), n]));
    setNL('');
  };
  const reset = async () => {
    if (
      !mg.cf(
        'Repor todos os dados do Management (pessoas, projetos, alocações, timesheets) para os dados de exemplo?',
      )
    )
      return;
    try {
      mg.setAll(await api<MgData>('/mg/sample', {}));
    } catch {
      toast({ message: tr('Não foi possível repor os dados.'), tone: 'error' });
    }
  };

  return (
    <div style={css('display:flex;flex-direction:column;gap:18px;')}>
      <div style={css('display:flex;flex-direction:column;gap:8px;')}>
        <div style={css('font-size:14px;font-weight:600;')}>{L(0)}</div>
        <div style={css('font-size:12.5px;color:rgba(255,248,240,.65);')}>{L(1)}</div>
        <div style={css(BOX)}>
          {areas.map((a, i) => (
            <div
              key={a.k}
              style={css(
                `display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.2fr) 80px 28px;align-items:center;gap:8px;min-height:44px;padding:5px 8px 5px 10px;border-top:1px solid ${i ? 'rgba(255,255,255,.07)' : 'transparent'};`,
              )}
            >
              <input
                className="mg-in"
                value={a.name}
                maxLength={80}
                aria-label={L(0)}
                onChange={(e) => setA(a.k, 'name')(e.target.value)}
                style={css(IN)}
              />
              <input
                className="mg-in"
                value={a.role}
                maxLength={80}
                placeholder={L(58)}
                aria-label={L(58)}
                onChange={(e) => setA(a.k, 'role')(e.target.value)}
                style={css(IN)}
              />
              <span
                style={css(
                  'font-size:11.5px;color:rgba(255,248,240,.6);text-align:right;white-space:nowrap;',
                )}
              >
                {tr(`${used(a.k)} pessoas`)}
              </span>
              {areas.length > 1 ? (
                <button
                  type="button"
                  className="mg-hx"
                  title={L(38)}
                  aria-label={`${L(38)}: ${a.name}`}
                  onClick={() => delArea(a.k, a.name)}
                  style={css(DEL)}
                >
                  ×
                </button>
              ) : (
                <span />
              )}
            </div>
          ))}
        </div>
        <div style={css('display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.2fr) auto;gap:8px;')}>
          <input
            className="mg-in"
            value={nA}
            maxLength={80}
            placeholder={L(59)}
            aria-label={L(59)}
            onChange={(e) => setNA(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addArea()}
            style={css(IN)}
          />
          <input
            className="mg-in"
            value={nR}
            maxLength={80}
            placeholder={L(60)}
            aria-label={L(60)}
            onChange={(e) => setNR(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addArea()}
            style={css(IN)}
          />
          <button type="button" onClick={addArea} style={css(ADD)}>
            {L(2)}
          </button>
        </div>
      </div>
      <div style={css('display:flex;flex-direction:column;gap:8px;')}>
        <div style={css('font-size:14px;font-weight:600;')}>{L(3)}</div>
        <div style={css('font-size:12.5px;color:rgba(255,248,240,.65);')}>{L(4)}</div>
        <div style={css(BOX)}>
          {lvIdx.map((l, i) => (
            <div
              key={l}
              style={css(
                `display:grid;grid-template-columns:28px minmax(0,1fr) 80px 28px;align-items:center;gap:8px;min-height:44px;padding:5px 8px 5px 10px;border-top:1px solid ${i ? 'rgba(255,255,255,.07)' : 'transparent'};`,
              )}
            >
              <span
                style={css("font-family:'Geist Mono',monospace;font-size:12px;color:rgba(255,248,240,.6);")}
              >
                {l}
              </span>
              <input
                className="mg-in"
                value={LVR[l]}
                maxLength={40}
                aria-label={`${L(3)} ${l}`}
                onChange={(e) => {
                  const v = e.target.value;
                  mg.upd((d) => {
                    const lv = [...(d.settings.levels ?? MG_LV)];
                    lv[l] = v;
                    d.settings.levels = lv;
                  });
                }}
                style={css(IN)}
              />
              <span
                style={css(
                  'font-size:11.5px;color:rgba(255,248,240,.6);text-align:right;white-space:nowrap;',
                )}
              >
                {tr(`${P.filter((p) => p.level === l).length} pessoas`)}
              </span>
              {NL > 1 ? (
                <button
                  type="button"
                  className="mg-hx"
                  title={L(38)}
                  aria-label={`${L(38)}: ${LV[l]}`}
                  onClick={() => delLevel(l)}
                  style={css(DEL)}
                >
                  ×
                </button>
              ) : (
                <span />
              )}
            </div>
          ))}
        </div>
        <div style={css('display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;')}>
          <input
            className="mg-in"
            value={nL}
            maxLength={40}
            placeholder={L(61)}
            aria-label={L(61)}
            onChange={(e) => setNL(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addLevel()}
            style={css(IN)}
          />
          <button type="button" onClick={addLevel} style={css(ADD)}>
            {L(2)}
          </button>
        </div>
      </div>
      <div style={css('display:flex;align-items:center;gap:12px;padding-top:4px;')}>
        <span style={css('flex:1;font-size:12.5px;color:rgba(255,248,240,.65);')}>{L(5)}</span>
        <button
          type="button"
          onClick={() => void reset()}
          style={css(
            'height:34px;padding:0 14px;border-radius:999px;border:1px solid rgba(255,200,180,.35);background:transparent;color:#ffc9b8;font:inherit;font-size:12.5px;font-weight:600;cursor:pointer;',
          )}
        >
          {L(6)}
        </button>
      </div>
    </div>
  );
}
