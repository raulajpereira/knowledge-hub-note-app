'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { MG_COST, MG_RATE, MG_TCOL, mgAv, mgIni, type MgPerson, type MgTeam } from '@/lib/mg';
import { CHEV, OPT, css } from './css';
import { Av, Dialog, Glass, X, uid } from './ui';
import type { Mg } from './store';

const OCC = ['rgba(255,248,240,.55)', 'oklch(0.86 0.12 85)', 'oklch(0.86 0.12 150)', 'oklch(0.82 0.14 30)'];
const INP =
  'height:38px;padding:0 12px;border-radius:12px;border:1px solid rgba(255,255,255,.14);background-color:rgba(18,12,9,.22);color:#fbf8f5;font:inherit;font-size:13.5px;outline:none;box-sizing:border-box;width:100%;min-width:0;';
const LBL = 'font-size:12px;color:rgba(255,248,240,.72);';

// Equipas (prototype isTeams): team cards, team detail and the
// "Adicionar Membros" dialog (find existing people / create a new one).
export function MgTeams({ mg }: { mg: Mg }) {
  const sp = useSearchParams();
  const { tr, TEAMS, ALLP, SKN } = mg;
  const selT = mg.tById[sp.get('t') ?? ''];
  const open = (id?: string) => mg.nav('mg_teams', id ? { t: id } : undefined);

  if (!selT) {
    const noTeam = ALLP.filter((p) => !p.team).length;
    return (
      <Glass label={tr('Equipas')}>
        <div
          style={css(
            'flex-shrink:0;display:flex;flex-wrap:wrap;align-items:flex-end;gap:12px;padding:22px 24px 16px;',
          )}
        >
          <div style={css('display:flex;flex-direction:column;gap:4px;margin-right:auto;min-width:0;')}>
            <h1 style={css('margin:0;font-size:28px;font-weight:600;letter-spacing:-.02em;')}>
              {tr('Equipas')}
            </h1>
            <span style={css('font-size:13.5px;color:rgba(255,248,240,.72);')}>
              {tr(`${TEAMS.length} equipas · ${ALLP.length} pessoas`)}
              {noTeam ? tr(` · ${noTeam} sem equipa`) : ''}
            </span>
          </div>
          <button
            type="button"
            onClick={() => {
              const id = uid();
              mg.upd(
                (d) =>
                  void d.teams.push({
                    id,
                    name: tr('Nova Equipa'),
                    areas: [],
                    desc: '',
                    color: MG_TCOL[d.teams.length % MG_TCOL.length]!,
                    target: 90,
                    lead: '',
                  }),
              );
              open(id);
            }}
            style={css(
              'height:36px;padding:0 16px;border-radius:999px;border:0;background:#fbf8f5;color:#2a211c;font:inherit;font-size:13px;font-weight:600;cursor:pointer;white-space:nowrap;',
            )}
          >
            + {tr('Nova Equipa')}
          </button>
        </div>
        <div style={css('flex:1;min-height:0;overflow:auto;padding:0 24px 24px;')}>
          <div
            style={css(
              'display:grid;grid-template-columns:repeat(auto-fill,minmax(max(300px,calc((100% - 36px) / 3)),1fr));gap:18px;',
            )}
          >
            {TEAMS.map((t) => {
              const mem = ALLP.filter((p) => p.team === t.id);
              const lead = mg.pById[t.lead];
              const glow = `radial-gradient(130% 90% at 0% 0%, ${t.color.replace(')', ' / .26)')}, transparent 62%)`;
              return (
                <div
                  key={t.id}
                  role="button"
                  tabIndex={0}
                  className="mg-card mg-tcard"
                  onClick={() => open(t.id)}
                  onKeyDown={(e) => e.key === 'Enter' && open(t.id)}
                  style={{
                    ...css(
                      'display:flex;flex-direction:column;gap:18px;padding:26px;border-radius:28px;border:1px solid rgba(255,255,255,.12);cursor:pointer;min-width:0;min-height:260px;transition:transform .15s,background .15s;',
                    ),
                    ['--glow' as string]: glow,
                  }}
                >
                  <div style={css('display:flex;align-items:center;gap:16px;min-width:0;')}>
                    <span
                      style={css(
                        `width:54px;height:54px;flex:none;border-radius:18px;background:${t.color};color:#1f1a16;display:flex;align-items:center;justify-content:center;font-size:17px;font-weight:700;letter-spacing:.02em;box-shadow:inset 0 1px 0 rgba(255,255,255,.45),0 8px 22px rgba(0,0,0,.2);`,
                      )}
                    >
                      {mgIni(t.name)}
                    </span>
                    <span style={css('flex:1;min-width:0;display:flex;flex-direction:column;gap:4px;')}>
                      <span
                        style={css(
                          'font-size:20px;font-weight:600;letter-spacing:-.01em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;',
                        )}
                      >
                        {t.name}
                      </span>
                      <span style={css('font-size:13px;color:rgba(255,248,240,.66);')}>
                        {tr(`${mem.length} ${mem.length === 1 ? 'colaborador' : 'colaboradores'}`)}
                      </span>
                    </span>
                  </div>
                  {t.desc && (
                    <span
                      style={css(
                        'font-size:14px;line-height:1.55;color:rgba(255,248,240,.8);text-wrap:pretty;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;',
                      )}
                    >
                      {t.desc}
                    </span>
                  )}
                  {t.areas.length > 0 && (
                    <div style={css('display:flex;flex-wrap:wrap;gap:6px;')}>
                      {t.areas.map((k) => (
                        <span
                          key={k}
                          style={css(
                            'height:26px;padding:0 11px;border-radius:999px;display:flex;align-items:center;font-size:12.5px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.12);',
                          )}
                        >
                          {SKN[k] ?? k}
                        </span>
                      ))}
                    </div>
                  )}
                  <div
                    style={css(
                      'display:flex;align-items:center;gap:12px;margin-top:auto;padding-top:18px;border-top:1px solid rgba(255,255,255,.08);',
                    )}
                  >
                    <Av p={lead} size={36} fs={12} s="box-shadow:0 0 0 2px rgba(255,255,255,.12);" />
                    <span style={css('flex:1;min-width:0;display:flex;flex-direction:column;gap:2px;')}>
                      <span
                        style={css(
                          'font-size:14px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;',
                        )}
                      >
                        {lead ? lead.name : tr('Sem responsável')}
                      </span>
                      <span style={css('font-size:12px;color:rgba(255,248,240,.6);')}>
                        {tr('Responsável')}
                      </span>
                    </span>
                    <span style={css('display:flex;align-items:center;')}>
                      {mem.slice(0, 5).map((p) => (
                        <Av
                          key={p.id}
                          p={p}
                          size={28}
                          fs={10}
                          tc={t.color}
                          s="margin-left:-8px;box-shadow:0 0 0 2px rgba(45,36,31,.9);"
                        />
                      ))}
                      {mem.length > 5 && (
                        <span
                          style={css(
                            'height:28px;min-width:28px;margin-left:-8px;padding:0 7px;border-radius:999px;background:rgba(255,255,255,.16);box-shadow:0 0 0 2px rgba(45,36,31,.9);display:flex;align-items:center;justify-content:center;font-size:10.5px;font-weight:700;',
                          )}
                        >
                          +{mem.length - 5}
                        </span>
                      )}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </Glass>
    );
  }
  return <TeamDetail mg={mg} t={selT} onBack={() => open()} />;
}

function TeamDetail({ mg, t, onBack }: { mg: Mg; t: MgTeam; onBack: () => void }) {
  const { tr, ALLP, TEAMS, SKN, ROLE, LV } = mg;
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState(false);
  const upT = (fn: (x: MgTeam) => void) => mg.upd((d) => fn(d.teams.find((x) => x.id === t.id)!));
  const mem = ALLP.filter((p) => p.team === t.id);
  const match = (p: MgPerson, s: string) =>
    !s || `${p.name} ${p.role} ${SKN[p.area] ?? ''}`.toLowerCase().includes(s);
  const qq = q.trim().toLowerCase();
  const occOf = (p: MgPerson) => {
    const v = mg.avgLoad(p.id, 0, 3);
    return { t: `${Math.round((v / (+p.cap || 40)) * 100)}%`, c: OCC[mg.band(v, p.cap)]! };
  };
  const members = mem
    .filter((p) => match(p, qq))
    .sort((x, y) => +(y.id === t.lead) - +(x.id === t.lead) || x.name.localeCompare(y.name));
  const setPT = (pid: string, tid: string) =>
    mg.upd((d) => {
      d.people.find((x) => x.id === pid)!.team = tid;
      d.teams.forEach((x) => {
        if (x.lead === pid && x.id !== tid) x.lead = '';
      });
    });
  const card =
    'display:flex;flex-direction:column;gap:14px;padding:20px;border-radius:24px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.12);min-width:0;';
  const btnIcon =
    'width:30px;height:30px;flex:none;border-radius:50%;border:0;background:transparent;color:rgba(255,248,240,.5);cursor:pointer;padding:0;display:flex;align-items:center;justify-content:center;';

  return (
    <Glass label={t.name}>
      <div style={css('flex-shrink:0;display:flex;align-items:center;gap:14px;padding:20px 24px 16px;')}>
        <button
          type="button"
          className="mg-h14"
          onClick={onBack}
          style={css(
            'height:36px;padding:0 14px 0 10px;border-radius:999px;border:1px solid rgba(255,255,255,.16);background:rgba(255,255,255,.08);color:#fbf8f5;font:inherit;font-size:13px;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:6px;',
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
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M15 6l-6 6 6 6" />
          </svg>
          {tr('Equipas')}
        </button>
        <span
          style={css(
            `width:42px;height:42px;flex:none;border-radius:14px;background:${t.color};color:#1f1a16;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;`,
          )}
        >
          {mgIni(t.name)}
        </span>
        <span
          style={css(
            'flex:1;min-width:0;font-size:24px;font-weight:600;letter-spacing:-.02em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;',
          )}
        >
          {t.name}
        </span>
        {TEAMS.length > 1 && (
          <button
            type="button"
            onClick={() => {
              if (!mg.cf(`Remover a equipa ${t.name}? As ${mem.length} pessoas ficam sem equipa.`)) return;
              mg.upd((d) => {
                d.people.forEach((p) => {
                  if (p.team === t.id) p.team = '';
                });
                d.teams = d.teams.filter((x) => x.id !== t.id);
              });
              if (mg.team === t.id) mg.setTeam('all');
              onBack();
            }}
            style={css(
              'height:34px;padding:0 14px;border-radius:999px;border:1px solid rgba(255,200,180,.35);background:transparent;color:#ffc9b8;font:inherit;font-size:12.5px;font-weight:600;cursor:pointer;white-space:nowrap;',
            )}
          >
            {tr('Remover Equipa')}
          </button>
        )}
      </div>
      <div
        style={css(
          'flex:1;min-height:0;overflow:auto;padding:0 24px 24px;display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,340px),1fr));gap:16px;align-items:start;',
        )}
      >
        <div style={css(card)}>
          <span style={css('font-size:16px;font-weight:600;')}>{tr('Dados da Equipa')}</span>
          <label style={css('display:flex;flex-direction:column;gap:6px;')}>
            <span style={css(LBL)}>{tr('Nome')}</span>
            <input
              className="mg-in"
              value={t.name}
              maxLength={120}
              onChange={(e) => upT((x) => void (x.name = e.target.value))}
              style={css(INP)}
            />
          </label>
          <label style={css('display:flex;flex-direction:column;gap:6px;')}>
            <span style={css(LBL)}>{tr('Descrição')}</span>
            <textarea
              className="mg-in"
              value={t.desc}
              rows={3}
              maxLength={2000}
              onChange={(e) => upT((x) => void (x.desc = e.target.value))}
              style={css(
                `${INP}height:auto;min-height:80px;padding:10px 12px;resize:vertical;line-height:1.45;`,
              )}
            />
          </label>
          <label style={css('display:flex;flex-direction:column;gap:6px;')}>
            <span style={css(LBL)}>{tr('Responsável (team lead)')}</span>
            <select
              value={t.lead}
              onChange={(e) => upT((x) => void (x.lead = e.target.value))}
              style={{
                ...css(
                  `${INP}background-color:rgba(255,255,255,.06);padding-right:30px;cursor:pointer;appearance:none;-webkit-appearance:none;color-scheme:dark;`,
                ),
                backgroundImage: CHEV,
                backgroundRepeat: 'no-repeat',
                backgroundPosition: 'right 12px center',
                backgroundSize: '11px',
              }}
            >
              {[{ v: '', l: '—' }, ...mem.map((p) => ({ v: p.id, l: p.name }))].map((o) => (
                <option key={o.v} value={o.v} style={OPT}>
                  {o.l}
                </option>
              ))}
            </select>
          </label>
          <label style={css('display:flex;flex-direction:column;gap:6px;')}>
            <span style={css(LBL)}>{tr('Capacidade alvo (%)')}</span>
            <input
              className="mg-in"
              type="number"
              min={1}
              max={150}
              value={t.target}
              onChange={(e) => {
                const v = e.target.value;
                upT((x) => void (x.target = v === '' ? '' : Math.max(1, Math.min(150, +v))));
              }}
              style={css(`${INP}font-family:'Geist Mono',monospace;`)}
            />
          </label>
          <div style={css('display:flex;flex-direction:column;gap:8px;')}>
            <span style={css(LBL)}>{tr('Cor')}</span>
            <div role="radiogroup" aria-label={tr('Cor')} style={css('display:flex;flex-wrap:wrap;gap:8px;')}>
              {MG_TCOL.map((c) => (
                <button
                  key={c}
                  type="button"
                  role="radio"
                  aria-checked={c === t.color}
                  aria-label={c}
                  onClick={() => upT((x) => void (x.color = c))}
                  style={css(
                    `width:28px;height:28px;border-radius:50%;border:0;padding:0;cursor:pointer;background:${c};box-shadow:${c === t.color ? '0 0 0 2px #fbf8f5' : '0 0 0 1px rgba(255,255,255,.2)'};`,
                  )}
                />
              ))}
            </div>
          </div>
          <div style={css('display:flex;flex-direction:column;gap:8px;')}>
            <span style={css(LBL)}>{tr('Áreas Principais')}</span>
            <div style={css('display:flex;flex-wrap:wrap;gap:6px;')}>
              {Object.keys(ROLE).map((k) => {
                const on = t.areas.includes(k);
                return (
                  <button
                    key={k}
                    type="button"
                    aria-pressed={on}
                    onClick={() =>
                      upT((x) => void (x.areas = on ? x.areas.filter((y) => y !== k) : [...x.areas, k]))
                    }
                    style={css(
                      `height:28px;padding:0 11px;border-radius:999px;border:1px solid ${on ? '#fbf8f5' : 'rgba(255,255,255,.16)'};background:${on ? '#fbf8f5' : 'rgba(255,255,255,.06)'};color:${on ? '#2a211c' : '#fbf8f5'};font:inherit;font-size:12px;font-weight:600;cursor:pointer;`,
                    )}
                  >
                    {SKN[k] ?? k}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
        <div style={css('display:flex;flex-direction:column;gap:16px;min-width:0;')}>
          <div style={css(card)}>
            <div style={css('display:flex;align-items:center;gap:10px;')}>
              <span style={css('font-size:16px;font-weight:600;')}>{tr('Membros')}</span>
              <span
                style={css(
                  "height:22px;min-width:22px;padding:0 8px;border-radius:999px;display:flex;align-items:center;justify-content:center;font-family:'Geist Mono',monospace;font-size:12px;font-weight:700;background:rgba(255,255,255,.12);",
                )}
              >
                {mem.length}
              </span>
              <button
                type="button"
                onClick={() => setAdding(true)}
                style={css(
                  'margin-left:auto;height:34px;padding:0 14px;border-radius:999px;border:0;background:#fbf8f5;color:#2a211c;font:inherit;font-size:12.5px;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:6px;white-space:nowrap;',
                )}
              >
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.6"
                  strokeLinecap="round"
                  aria-hidden="true"
                >
                  <path d="M12 5v14M5 12h14" />
                </svg>
                {tr('Adicionar Membros')}
              </button>
            </div>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={tr('Pesquisar membros…')}
              aria-label={tr('Pesquisar membros…')}
              style={css(
                'height:36px;padding:0 14px;border-radius:999px;border:1px solid rgba(255,255,255,.14);background:rgba(18,12,9,.22);color:#fbf8f5;font:inherit;font-size:13px;outline:none;width:100%;box-sizing:border-box;',
              )}
            />
            <div style={css('display:flex;flex-direction:column;gap:2px;max-height:560px;overflow:auto;')}>
              {members.map((p) => {
                const o = occOf(p);
                const isLead = p.id === t.lead;
                const tm = mg.tOf(p);
                return (
                  <div
                    key={p.id}
                    className="mg-h6"
                    style={css(
                      'display:flex;align-items:center;gap:10px;min-height:54px;padding:6px 8px;border-radius:16px;',
                    )}
                  >
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={() => mg.nav('mg_people', { p: p.id })}
                      onKeyDown={(e) => e.key === 'Enter' && mg.nav('mg_people', { p: p.id })}
                      style={css(
                        'flex:1;min-width:0;display:flex;align-items:center;gap:10px;cursor:pointer;',
                      )}
                    >
                      <Av p={p} size={36} fs={12} tc={tm.tc} />
                      <span style={css('flex:1;min-width:0;display:flex;flex-direction:column;gap:2px;')}>
                        <span style={css('display:flex;align-items:center;gap:6px;min-width:0;')}>
                          <span
                            style={css(
                              'font-size:14px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;',
                            )}
                          >
                            {p.name}
                          </span>
                          {isLead && (
                            <span
                              style={css(
                                'flex:none;height:18px;padding:0 7px;border-radius:999px;display:flex;align-items:center;font-size:10px;font-weight:700;color:#2a211c;background:#fbf8f5;',
                              )}
                            >
                              {tr('Responsável')}
                            </span>
                          )}
                        </span>
                        <span
                          style={css(
                            'font-size:12px;color:rgba(255,248,240,.62);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;',
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
                    </span>
                    <span
                      style={css(
                        `font-family:'Geist Mono',monospace;font-size:12.5px;font-weight:700;color:${o.c};`,
                      )}
                    >
                      {o.t}
                    </span>
                    {!isLead && (
                      <button
                        type="button"
                        className="mg-hlead"
                        title={tr('Tornar responsável')}
                        aria-label={`${tr('Tornar responsável')}: ${p.name}`}
                        onClick={() => upT((x) => void (x.lead = p.id))}
                        style={css(btnIcon)}
                      >
                        <svg
                          width="15"
                          height="15"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.9"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden="true"
                        >
                          <path d="M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.4l-5.2 2.7 1-5.8L3.5 9.2l5.9-.9z" />
                        </svg>
                      </button>
                    )}
                    <button
                      type="button"
                      className="mg-hdel"
                      title={tr('Remover da equipa')}
                      aria-label={`${tr('Remover da equipa')}: ${p.name}`}
                      onClick={() => setPT(p.id, '')}
                      style={css(btnIcon)}
                    >
                      <svg
                        width="15"
                        height="15"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        aria-hidden="true"
                      >
                        <path d="M5 12h14" />
                      </svg>
                    </button>
                  </div>
                );
              })}
              {!mem.length && (
                <div style={css('padding:18px 6px;font-size:13px;color:rgba(255,248,240,.62);')}>
                  {tr('Ainda sem membros. Use "Adicionar membros".')}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      {adding && <AddMembers mg={mg} t={t} match={match} setPT={setPT} onClose={() => setAdding(false)} />}
    </Glass>
  );
}

type NewP = {
  name: string;
  role: string;
  area: string;
  level: number;
  cap: number | '';
  cost: number | '';
  rate: number | '';
  loc: string;
  email: string;
};

function AddMembers({
  mg,
  t,
  match,
  setPT,
  onClose,
}: {
  mg: Mg;
  t: MgTeam;
  match: (p: MgPerson, s: string) => boolean;
  setPT: (pid: string, tid: string) => void;
  onClose: () => void;
}) {
  const { tr, ALLP, ROLE, SKN, LV, lvIdx } = mg;
  const [tab, setTab] = useState<'find' | 'new'>('find');
  const [qa, setQa] = useState('');
  const firstArea = ROLE.abap ? 'abap' : (Object.keys(ROLE)[0] ?? 'abap');
  const [n, setN] = useState<NewP>({
    name: '',
    role: ROLE[firstArea] ?? '',
    area: firstArea,
    level: 2,
    cost: MG_COST[2]!,
    rate: MG_RATE[2]!,
    cap: 40,
    loc: 'Lisboa',
    email: '',
  });
  const [err, setErr] = useState('');
  const qq = qa.trim().toLowerCase();
  const cand = ALLP.filter((p) => p.team !== t.id && match(p, qq)).sort(
    (x, y) => +!!x.team - +!!y.team || x.name.localeCompare(y.name),
  );
  const setF = (k: keyof NewP, num?: boolean) => (raw: string) => {
    setErr('');
    setN((o) => {
      const v = num ? (raw === '' ? '' : +raw) : raw;
      const x = { ...o, [k]: v } as NewP;
      if (k === 'area') x.role = ROLE[raw] ?? x.role;
      if (k === 'level') {
        x.cost = MG_COST[+raw] ?? x.cost;
        x.rate = MG_RATE[+raw] ?? x.rate;
      }
      return x;
    });
  };
  const create = () => {
    const nm = n.name.trim();
    if (!nm) return setErr(tr('Indique o nome do colaborador.'));
    if (n.email && !/^\S+@\S+\.\S+$/.test(n.email.trim())) return setErr(tr('Email inválido.'));
    const lv = +n.level || 1;
    mg.upd(
      (d) =>
        void d.people.unshift({
          id: uid(),
          team: t.id,
          name: nm,
          area: n.area,
          role: n.role.trim() || ROLE[n.area] || '',
          level: lv,
          cost: +n.cost || 0,
          rate: +n.rate || 0,
          cap: +n.cap || 40,
          loc: n.loc,
          status: 'Ativo',
          statusNote: '',
          hired: new Date().toISOString().slice(0, 10),
          expYears: '',
          email: n.email.trim(),
          av: mgAv(d.people.length + 7),
          skills: { [n.area]: lv },
        }),
    );
    onClose();
  };
  type F = {
    label: string;
    k: keyof NewP;
    full?: boolean;
    type?: string;
    unit?: string;
    num?: boolean;
    opts?: Array<{ v: string; l: string }>;
  };
  const fields: F[] = [
    { label: 'Nome', k: 'name', full: true },
    { label: 'Função', k: 'role' },
    { label: 'Área principal', k: 'area', opts: Object.keys(ROLE).map((k) => ({ v: k, l: SKN[k] ?? k })) },
    { label: 'Senioridade', k: 'level', opts: lvIdx.map((l) => ({ v: String(l), l: LV[l]! })), num: true },
    { label: 'Capacidade', k: 'cap', type: 'number', unit: 'h/sem', num: true },
    { label: 'Custo interno', k: 'cost', type: 'number', unit: '€/h', num: true },
    { label: 'Preço de venda', k: 'rate', type: 'number', unit: '€/h', num: true },
    { label: 'Localização', k: 'loc' },
    { label: 'Email', k: 'email', type: 'email' },
  ];
  const IN2 =
    'height:38px;padding:0 12px;border-radius:12px;border:1px solid rgba(255,255,255,.16);color:#fbf8f5;font:inherit;font-size:13.5px;outline:none;box-sizing:border-box;width:100%;min-width:0;';

  return (
    <Dialog
      label={tr('Adicionar Membros')}
      onClose={onClose}
      s="width:min(620px,100%);height:min(680px,100%);display:flex;flex-direction:column;border-radius:30px;overflow:hidden;"
    >
      <div style={css('flex-shrink:0;display:flex;flex-direction:column;gap:14px;padding:22px 22px 14px;')}>
        <div style={css('display:flex;align-items:center;gap:12px;')}>
          <span style={css(`width:10px;height:10px;flex:none;border-radius:50%;background:${t.color};`)} />
          <span style={css('flex:1;min-width:0;display:flex;flex-direction:column;gap:2px;')}>
            <span style={css('font-size:20px;font-weight:600;letter-spacing:-.02em;')}>
              {tr('Adicionar Membros')}
            </span>
            <span style={css('font-size:12.5px;color:rgba(255,248,240,.7);')}>{t.name}</span>
          </span>
          <button
            type="button"
            className="mg-round"
            onClick={onClose}
            title={tr('Fechar')}
            aria-label={tr('Fechar')}
          >
            <X />
          </button>
        </div>
        <div
          role="tablist"
          style={css(
            'align-self:flex-start;display:flex;gap:2px;padding:3px;border-radius:999px;background:rgba(18,12,9,.22);border:1px solid rgba(255,255,255,.12);',
          )}
        >
          {(
            [
              ['find', 'Pesquisar Colaboradores'],
              ['new', 'Novo Colaborador'],
            ] as const
          ).map(([k, l]) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={tab === k}
              onClick={() => setTab(k)}
              style={css(
                `height:30px;padding:0 14px;border-radius:999px;border:0;font:inherit;font-size:12.5px;font-weight:600;cursor:pointer;background:${tab === k ? '#fbf8f5' : 'transparent'};color:${tab === k ? '#2a211c' : 'rgba(255,248,240,.8)'};`,
              )}
            >
              {tr(l)}
            </button>
          ))}
        </div>
      </div>
      {tab === 'find' ? (
        <div
          style={css('flex:1;min-height:0;display:flex;flex-direction:column;gap:10px;padding:0 22px 22px;')}
        >
          <input
            value={qa}
            autoFocus
            onChange={(e) => setQa(e.target.value)}
            placeholder={tr('Pesquisar por nome, função ou área…')}
            aria-label={tr('Pesquisar por nome, função ou área…')}
            style={css(
              'height:40px;padding:0 16px;border-radius:999px;border:1px solid rgba(255,255,255,.16);background:rgba(18,12,9,.25);color:#fbf8f5;font:inherit;font-size:13.5px;outline:none;width:100%;box-sizing:border-box;',
            )}
          />
          <span style={css('font-size:12px;color:rgba(255,248,240,.62);')}>
            {tr('Pessoas sem equipa aparecem primeiro. Cada pessoa pertence a uma só equipa.')}
          </span>
          <div
            style={css(
              'flex:1;min-height:0;overflow:auto;display:flex;flex-direction:column;gap:2px;margin:0 -6px;',
            )}
          >
            {cand.slice(0, 60).map((p) => {
              const ft = mg.tById[p.team];
              const tm = mg.tOf(p);
              return (
                <div
                  key={p.id}
                  className="mg-h8"
                  style={css(
                    'display:flex;align-items:center;gap:10px;min-height:56px;padding:6px 8px;border-radius:16px;',
                  )}
                >
                  <Av p={p} size={38} fs={12.5} tc={tm.tc} />
                  <span style={css('flex:1;min-width:0;display:flex;flex-direction:column;gap:2px;')}>
                    <span
                      style={css(
                        'font-size:14px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;',
                      )}
                    >
                      {p.name}
                    </span>
                    <span
                      style={css(
                        'display:flex;align-items:center;gap:6px;font-size:12px;color:rgba(255,248,240,.66);min-width:0;',
                      )}
                    >
                      <span
                        style={css(
                          `width:7px;height:7px;flex:none;border-radius:50%;background:${ft ? ft.color : 'rgba(255,248,240,.4)'};`,
                        )}
                      />
                      <span style={css('white-space:nowrap;overflow:hidden;text-overflow:ellipsis;')}>
                        {ft ? ft.name : tr('Sem equipa')} · {tr(p.role)} · {LV[p.level]}
                      </span>
                    </span>
                  </span>
                  <button
                    type="button"
                    title={tr(ft ? 'Mover para esta equipa' : 'Adicionar')}
                    aria-label={`${tr(ft ? 'Mover para esta equipa' : 'Adicionar')}: ${p.name}`}
                    onClick={() => setPT(p.id, t.id)}
                    style={css(
                      'height:32px;padding:0 14px;flex:none;border-radius:999px;border:0;background:#fbf8f5;color:#2a211c;font:inherit;font-size:12.5px;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:5px;',
                    )}
                  >
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.6"
                      strokeLinecap="round"
                      aria-hidden="true"
                    >
                      <path d="M12 5v14M5 12h14" />
                    </svg>
                    {tr(ft ? 'Mover' : 'Adicionar')}
                  </button>
                </div>
              );
            })}
            {!cand.length && (
              <div
                style={css('padding:24px 8px;text-align:center;font-size:13px;color:rgba(255,248,240,.62);')}
              >
                {tr('Ninguém encontrado.')}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div
          style={css(
            'flex:1;min-height:0;overflow:auto;padding:0 22px 22px;display:flex;flex-direction:column;gap:14px;',
          )}
        >
          <div style={css('display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;')}>
            {fields.map((f) => (
              <label
                key={f.k}
                style={css(
                  `display:flex;flex-direction:column;gap:6px;min-width:0;grid-column:${f.full ? '1 / -1' : 'auto'};`,
                )}
              >
                <span style={css('font-size:12px;color:rgba(255,248,240,.75);')}>{tr(f.label)}</span>
                <div style={css('display:flex;align-items:center;gap:8px;min-width:0;')}>
                  {f.opts ? (
                    <select
                      value={String(n[f.k])}
                      onChange={(e) => setF(f.k, f.num)(e.target.value)}
                      style={{
                        ...css(
                          `${IN2}background-color:rgba(255,255,255,.06);padding-right:30px;cursor:pointer;appearance:none;-webkit-appearance:none;color-scheme:dark;`,
                        ),
                        backgroundImage: CHEV,
                        backgroundRepeat: 'no-repeat',
                        backgroundPosition: 'right 12px center',
                        backgroundSize: '11px',
                      }}
                    >
                      {f.opts.map((o) => (
                        <option key={o.v} value={o.v} style={OPT}>
                          {o.l}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      className="mg-in"
                      value={String(n[f.k])}
                      type={f.type ?? 'text'}
                      maxLength={200}
                      onChange={(e) => setF(f.k, f.num)(e.target.value)}
                      style={css(`${IN2}background-color:rgba(18,12,9,.25);`)}
                    />
                  )}
                  {f.unit && (
                    <span style={css('flex:none;font-size:12px;color:rgba(255,248,240,.6);')}>
                      {tr(f.unit)}
                    </span>
                  )}
                </div>
              </label>
            ))}
          </div>
          {err && (
            <span role="alert" style={css('font-size:12.5px;color:#ffc9b8;')}>
              {err}
            </span>
          )}
          <div style={css('display:flex;justify-content:flex-end;gap:8px;margin-top:auto;')}>
            <button
              type="button"
              onClick={onClose}
              style={css(
                'height:38px;padding:0 16px;border-radius:999px;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.08);color:#fbf8f5;font:inherit;font-size:13px;cursor:pointer;',
              )}
            >
              {tr('Cancelar')}
            </button>
            <button
              type="button"
              onClick={create}
              style={css(
                'height:38px;padding:0 18px;border-radius:999px;border:0;background:#fbf8f5;color:#2a211c;font:inherit;font-size:13px;font-weight:600;cursor:pointer;',
              )}
            >
              {tr('Criar e Adicionar')}
            </button>
          </div>
        </div>
      )}
    </Dialog>
  );
}
