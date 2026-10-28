'use client';

import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { MG_PST, MG_RST, mgEur, mgModSkill, wLbl, type MgProject } from '@/lib/mg';
import { modColor } from '@/lib/sap';
import { mgL } from '@/lib/mgText';
import { dnOf, effortLabel, fmtDay, isIsoDay } from '@/lib/alloc';
import { CHEV, OPT, css } from './css';
import { Av, Chip, Dialog, Fields, Split, Trash, uid } from './ui';
import type { Mg } from './store';
import { Popover, useConfirm } from '@/components/ui';
import { ModChips, modChip, ModulePicker, moduleOptions } from './ModulePicker';
import { useI18n } from '@/i18n/client';
import { SaveTemplateButton, TemplateButton } from '@/components/templates/Templates';
import type { ProjectTpl } from '@/lib/templates';

const PHC = [
  'oklch(0.72 0.1 240 / .55)',
  'oklch(0.72 0.1 190 / .55)',
  'oklch(0.74 0.12 150 / .55)',
  'oklch(0.78 0.12 85 / .6)',
  'oklch(0.74 0.14 40 / .6)',
  'oklch(0.7 0.1 300 / .55)',
];
const WSEL =
  'min-width:0;height:32px;padding:0 8px;border-radius:9px;border:1px solid rgb(var(--w) / .1);background-color:rgb(var(--w) / .06);color:var(--ink);font:inherit;font-size:12.5px;outline:none;appearance:none;-webkit-appearance:none;color-scheme: var(--scheme);cursor:pointer;';

/** A new project as the prototype creates it (two phases over 13 weeks). */
export function mgNewProject(mg: Mg, p: Partial<MgProject>): MgProject {
  const { wk, tr } = mg;
  return {
    id: uid(),
    team: mg.gTeam !== 'all' ? mg.gTeam : '',
    code: 'NOVO-01',
    name: tr('Novo Projeto'),
    client: '',
    budget: 50000,
    from: wk(0),
    to: wk(12),
    color: `oklch(0.8 0.1 ${Math.floor(Math.random() * 360)})`,
    status: 'Planeado',
    manager: '',
    phases: [
      { name: tr('Preparação'), from: wk(0), to: wk(2) },
      { name: tr('Execução'), from: wk(3), to: wk(12) },
    ],
    modules: [],
    ...p,
  };
}

// Projetos (prototype isProjects): list with status filter, budget KPIs,
// phases on a timeline, the allocated team and the resource requests.
export function MgProjects({ mg }: { mg: Mg }) {
  const sp = useSearchParams();
  const confirm = useConfirm();
  const { t: tx } = useI18n();
  const { D, tr, lang, LV, SKN, wi, wk } = mg;
  const L = (i: number) => mgL(i, lang);
  const [q, setQ] = useState('');
  const [stF, setStF] = useState('all');
  /** module filter ('' = all) */
  const [modF, setModF] = useState('');
  const [adding, setAdding] = useState(false);
  const qq = q.trim().toLowerCase();
  const modOpts = moduleOptions(D.projects.flatMap((p) => p.modules ?? []));
  const list = mg.PJ.filter(
    (p) =>
      (stF === 'all' || p.status === stF) &&
      (!modF || (p.modules ?? []).includes(modF)) &&
      (!qq || [p.code, p.name, mg.cById[p.client]?.name ?? ''].join(' ').toLowerCase().includes(qq)) &&
      mg.inTeamProj(p.id),
  );
  const sel = list.find((p) => p.id === sp.get('pj')) ?? list[0];
  const select = (id: string) => mg.nav('mg_projects', { pj: id });
  // the forecast needs the project's allocations up to its end
  const ensure = mg.AL.ensure;
  const [pf, pt] = [sel?.from ?? '', sel?.to ?? ''];
  useEffect(() => {
    if (isIsoDay(pf) && isIsoDay(pt) && pf <= pt) ensure(dnOf(pf), dnOf(pt) + 6);
  }, [ensure, pf, pt]);
  const cOpts = D.clients.map((c) => ({
    v: c.id,
    l: c.name + (c.type === 'Interno' ? tr(' (interno)') : ''),
  }));

  const side = (
    <>
      <div style={css('flex-shrink:0;display:flex;flex-direction:column;gap:10px;padding:20px 16px 12px;')}>
        <div style={css('display:flex;align-items:center;gap:10px;')}>
          <h1 style={css('margin:0;font-size:24px;font-weight:600;letter-spacing:-.02em;margin-right:auto;')}>
            {L(28)}
          </h1>
          <button
            type="button"
            title={L(67)}
            aria-label={L(67)}
            onClick={() => setAdding(true)}
            style={css(
              'width:32px;height:32px;border-radius:50%;border:0;background:var(--ink);color:var(--ink-inv);cursor:pointer;font-size:18px;line-height:1;',
            )}
          >
            +
          </button>
        </div>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={L(68)}
          aria-label={L(68)}
          style={css(
            'height:38px;padding:0 14px;border-radius:999px;border:1px solid rgb(var(--w) / .14);background:rgb(var(--d) / calc(.22 * var(--d-k)));color:var(--ink);font:inherit;font-size:13.5px;outline:none;',
          )}
        />
        <div style={css('display:flex;flex-wrap:wrap;gap:4px;')}>
          {['all', 'Ativo', 'Planeado', 'Em risco', 'Concluído'].map((s) => (
            <Chip key={s} on={stF === s} label={tr(s === 'all' ? 'Todos' : s)} onClick={() => setStF(s)} />
          ))}
          <ModFilter mg={mg} value={modF} onChange={setModF} />
        </div>
      </div>
      <div
        style={css(
          'flex:1;min-height:0;overflow:auto;padding:0 8px 12px;display:flex;flex-direction:column;gap:4px;',
        )}
      >
        {list.map((p) => {
          const u = mg.pct(mg.tsHours(p.id).v, p.budget);
          const on = sel && p.id === sel.id;
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
                `flex-shrink:0;display:flex;flex-direction:column;gap:8px;padding:12px 14px;border-radius:18px;cursor:pointer;background:${on ? 'rgb(var(--w) / .14)' : 'rgb(var(--w) / .03)'};border:1px solid ${on ? 'rgb(var(--w) / .22)' : 'rgb(var(--w) / .08)'};`,
              )}
            >
              <div style={css('display:flex;align-items:center;gap:8px;min-width:0;')}>
                <span
                  style={css(`width:8px;height:8px;flex:none;border-radius:50%;background:${p.color};`)}
                />
                <span
                  style={css(
                    "font-family:'Geist Mono',monospace;font-size:12px;font-weight:600;white-space:nowrap;",
                  )}
                >
                  {p.code}
                </span>
                <span
                  style={css(
                    `margin-left:auto;flex:none;height:20px;padding:0 8px;border-radius:999px;display:flex;align-items:center;font-size:10.5px;font-weight:700;background:${MG_PST[p.status]};`,
                  )}
                >
                  {tr(p.status)}
                </span>
              </div>
              <span style={css('font-size:14px;font-weight:600;line-height:1.3;')}>{p.name}</span>
              <ModChips mods={p.modules ?? []} first={modF} />
              <div
                style={css(
                  'display:flex;align-items:center;gap:8px;font-size:12px;color:rgb(var(--t) / calc(.64 * var(--t-k)));',
                )}
              >
                <span
                  style={css('flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;')}
                >
                  {mg.cById[p.client]?.name ?? '—'}
                </span>
                <span style={css("font-family:'Geist Mono',monospace;")}>{tr(`${u}% orç.`)}</span>
              </div>
              <div
                style={css('height:4px;border-radius:999px;background:rgb(var(--w) / .1);overflow:hidden;')}
              >
                <div
                  style={css(
                    `height:100%;width:${Math.min(100, u)}%;background:${u > 90 ? 'oklch(0.72 0.15 30)' : p.color};border-radius:999px;`,
                  )}
                />
              </div>
            </div>
          );
        })}
      </div>
    </>
  );

  const dialog = adding && (
    <NewProject
      mg={mg}
      cOpts={cOpts}
      modOpts={modOpts}
      onClose={() => setAdding(false)}
      onCreated={(id) => {
        setAdding(false);
        setStF('all');
        setModF('');
        setQ('');
        select(id);
      }}
    />
  );
  if (!sel)
    return (
      <>
        <Split page="mg_projects" list={side} param="pj">
          {null}
        </Split>
        {dialog}
      </>
    );

  const set = (k: keyof MgProject, num?: boolean) => (v: string) =>
    mg.upd(
      (d) =>
        void Object.assign(
          d.projects.find((x) => x.id === sel.id)!,
          { [k]: num ? +v || 0 : v },
        ),
    );
  const used = mg.tsHours(sel.id);
  const tot = used.v + mg.forecast(sel.id);
  const over = tot > sel.budget;
  const good = over ? 'oklch(0.84 0.13 30)' : 'oklch(0.86 0.12 150)';
  const s0 = wi(sel.from);
  const e0 = wi(sel.to);
  const span = Math.max(1, e0 - s0 + 1);
  /** Modelos: replace the phases, one after the other from the project's first week (the end follows). */
  const applyPhases = async (tpl: ProjectTpl) => {
    if (
      sel.phases.length &&
      !(await confirm({
        title: tx('tp_phasesT'),
        body: tx('tp_phasesB'),
        confirmLabel: tx('tp_apply'),
        cancelLabel: tx('tr_cancel'),
      }))
    )
      return;
    mg.upd((d) => {
      const pr = d.projects.find((x) => x.id === sel.id)!;
      let w = s0;
      pr.phases = tpl.phases.map((ph) => {
        const from = w;
        w += ph.weeks;
        return { name: ph.name, from: wk(from), to: wk(w - 1) };
      });
      pr.to = wk(Math.max(e0, w - 1));
    });
  };
  const team = mg.BK.filter(
    (a) =>
      a.project === sel.id &&
      a.to >= wk(-2) &&
      (mg.gTeam === 'all' || !a.person || mg.pById[a.person]?.team === mg.gTeam),
  );
  const reqs = D.reqs.filter((r) => r.project === sel.id);
  /** a new resource request asks for the skills of the project's modules (ABAP when none matches) */
  const reqSkills = [
    ...new Set((sel.modules ?? []).map((m) => mgModSkill(m, SKN)).filter((k): k is string => !!k)),
  ]
    .slice(0, 3)
    .map((k) => ({ k, l: 2 }));
  if (!reqSkills.length) reqSkills.push({ k: 'abap', l: 2 });
  const updPh = (i: number, k: 'name' | 'from' | 'to') => (v: string) =>
    mg.upd((d) => {
      d.projects.find((x) => x.id === sel.id)!.phases[i]![k] = v;
    });
  const kpis: Array<[string, string, string]> = [
    [tr('Orçamento'), mgEur(sel.budget), 'var(--ink)'],
    [`${tr('Consumido')} · ${Math.round(used.h)}h`, mgEur(used.v), 'var(--ink)'],
    [tr('Previsão final'), mgEur(tot), good],
    [tr('Desvio'), (over ? '+' : '') + mgEur(tot - sel.budget), good],
  ];
  const weekSel = (v: string, on: (v: string) => void, label: string) => (
    <select value={v} aria-label={label} onChange={(e) => on(e.target.value)} style={css(WSEL)}>
      {mg.weekOpts.map((o) => (
        <option key={o.v} value={o.v} style={OPT}>
          {o.l}
        </option>
      ))}
    </select>
  );

  const split = (
    <Split page="mg_projects" list={side} param="pj" backTitle={`${sel.code} · ${sel.name}`}>
      <div style={css('display:flex;flex-direction:column;gap:18px;padding:24px 26px 30px;')}>
        <div style={css('display:flex;align-items:flex-start;gap:14px;min-width:0;')}>
          <div style={css('flex:1;min-width:0;display:flex;flex-direction:column;gap:6px;')}>
            <div style={css('display:flex;align-items:center;gap:8px;')}>
              <span style={css(`width:10px;height:10px;border-radius:50%;background:${sel.color};`)} />
              <input
                value={sel.code}
                maxLength={40}
                aria-label={tr('Código')}
                spellCheck={false}
                onChange={(e) => set('code')(e.target.value.toUpperCase())}
                style={css(
                  "width:160px;padding:0;border:0;background:transparent;color:rgb(var(--t) / calc(.8 * var(--t-k)));font-family:'Geist Mono',monospace;font-size:13px;font-weight:600;outline:none;",
                )}
              />
            </div>
            <input
              value={sel.name}
              maxLength={200}
              aria-label={tr('Nome')}
              onChange={(e) => set('name')(e.target.value)}
              style={css(
                'width:100%;padding:0;border:0;background:transparent;color:var(--ink);font:inherit;font-size:26px;font-weight:600;letter-spacing:-.02em;outline:none;',
              )}
            />
            <button
              type="button"
              onClick={() => sel.client && mg.nav('mg_clients', { c: sel.client })}
              style={css(
                'align-self:flex-start;padding:0;border:0;background:transparent;color:oklch(calc(.84 * var(--lk)) .12 240);font:inherit;font-size:13.5px;cursor:pointer;',
              )}
            >
              {mg.cById[sel.client]?.name ?? tr('Sem cliente')} →
            </button>
          </div>
          <button
            type="button"
            className="mg-round"
            title={L(69)}
            aria-label={L(69)}
            style={{ color: 'var(--kh-error-text)' }}
            onClick={() => {
              if (!mg.cf(`Remover o projeto ${sel.code} e as suas alocações?`)) return;
              mg.upd((d) => {
                d.projects = d.projects.filter((x) => x.id !== sel.id);
                d.reqs = d.reqs.filter((r) => r.project !== sel.id);
                d.ts.forEach((t) => delete t.rows[sel.id]);
              });
              mg.AL.forget({ project: sel.id });
              mg.nav('mg_projects');
            }}
          >
            <Trash />
          </button>
        </div>
        <div style={css('display:flex;flex-direction:column;gap:6px;')}>
          <span style={css('font-size:12px;color:rgb(var(--t) / calc(.68 * var(--t-k)));')}>
            {tx('mgm_mods')}
          </span>
          <ModulePicker
            label={tx('mgm_mods')}
            value={sel.modules ?? []}
            options={modOpts}
            onChange={(m) => mg.upd((d) => void (d.projects.find((x) => x.id === sel.id)!.modules = m))}
          />
        </div>
        <div style={css('display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;')}>
          {kpis.map(([l, v, c]) => (
            <div
              key={l}
              style={css(
                'display:flex;flex-direction:column;gap:4px;padding:12px 14px;border-radius:18px;background:rgb(var(--w) / .06);border:1px solid rgb(var(--w) / .12);',
              )}
            >
              <span style={css('font-size:12px;color:rgb(var(--t) / calc(.68 * var(--t-k)));')}>{l}</span>
              <span
                style={css(`font-family:'Geist Mono',monospace;font-size:19px;font-weight:600;color:${c};`)}
              >
                {v}
              </span>
            </div>
          ))}
        </div>
        <div style={css('display:flex;flex-direction:column;gap:6px;')}>
          <div
            style={css(
              'position:relative;height:10px;border-radius:999px;background:rgb(var(--w) / .1);overflow:hidden;',
            )}
          >
            <div
              style={css(
                `position:absolute;left:0;top:0;bottom:0;width:${Math.min(100, mg.pct(tot, sel.budget))}%;background:rgb(var(--w) / .2);border-radius:999px;`,
              )}
            />
            <div
              style={css(
                `position:absolute;left:0;top:0;bottom:0;width:${Math.min(100, mg.pct(used.v, sel.budget))}%;background:${over ? 'oklch(0.72 0.15 30)' : sel.color};border-radius:999px;`,
              )}
            />
          </div>
          <div
            style={css('display:flex;gap:16px;font-size:12px;color:rgb(var(--t) / calc(.68 * var(--t-k)));')}
          >
            <span>{L(29)}</span>
            <span style={css('color:rgb(var(--t) / calc(.5 * var(--t-k)));')}>{L(30)}</span>
          </div>
        </div>
        <Fields
          fields={[
            {
              label: tr('Cliente'),
              val: sel.client,
              opts: sel.client ? cOpts : [{ v: '', l: '—' }, ...cOpts],
              onChange: set('client'),
            },
            {
              label: tr('Estado'),
              val: sel.status,
              opts: Object.keys(MG_PST).map((s) => ({ v: s, l: tr(s) })),
              onChange: set('status'),
            },
            {
              label: tr('Gestor'),
              val: sel.manager,
              opts: [
                { v: '', l: '—' },
                ...mg.P.filter((p) => (p.skills.pm ?? 0) >= 2 || p.id === sel.manager).map((p) => ({
                  v: p.id,
                  l: p.name,
                })),
              ],
              onChange: set('manager'),
            },
            {
              label: tr('Orçamento'),
              val: sel.budget,
              type: 'number',
              unit: '€',
              onChange: set('budget', true),
            },
            { label: tr('Início'), val: sel.from, opts: mg.weekOpts, onChange: set('from') },
            { label: tr('Fim'), val: sel.to, opts: mg.weekOpts, onChange: set('to') },
          ]}
        />
        <div style={css('display:flex;flex-direction:column;gap:10px;')}>
          <div style={css('display:flex;align-items:center;gap:10px;')}>
            <span style={css('font-size:16px;font-weight:600;margin-right:auto;')}>{L(31)}</span>
            <TemplateButton kind="project" onPick={(tpl) => void applyPhases(tpl.body as ProjectTpl)} />
            {sel.phases.length > 0 && (
              <SaveTemplateButton
                kind="project"
                compact
                defaultName={sel.name}
                body={() => ({
                  phases: sel.phases.map((ph) => ({
                    name: ph.name,
                    weeks: Math.max(1, Math.min(104, wi(ph.to) - wi(ph.from) + 1)),
                  })),
                })}
              />
            )}
            <button
              type="button"
              onClick={() =>
                mg.upd((d) => {
                  const pr = d.projects.find((x) => x.id === sel.id)!;
                  const last = pr.phases.at(-1);
                  const f = last ? wi(last.to) + 1 : s0;
                  pr.phases.push({
                    name: tr('Nova Fase'),
                    from: wk(Math.min(f, e0)),
                    to: wk(Math.min(f + 3, e0)),
                  });
                })
              }
              style={css(
                'height:30px;padding:0 12px;border-radius:999px;border:1.5px dashed rgb(var(--w) / .28);background:transparent;color:rgb(var(--t) / calc(.85 * var(--t-k)));font:inherit;font-size:12px;font-weight:600;cursor:pointer;',
              )}
            >
              {L(32)}
            </button>
          </div>
          <div
            style={css(
              'position:relative;height:30px;border-radius:10px;background:rgb(var(--w) / .06);overflow:hidden;',
            )}
          >
            {sel.phases.map((ph, i) => {
              const f = Math.max(s0, wi(ph.from));
              const t = Math.min(e0, wi(ph.to));
              return (
                <div
                  key={i}
                  title={ph.name}
                  style={css(
                    `position:absolute;top:3px;bottom:3px;left:${((f - s0) / span) * 100}%;width:${(Math.max(0, t - f + 1) / span) * 100}%;border-radius:7px;background:${PHC[i % PHC.length]};border:1px solid rgb(var(--w) / .2);display:flex;align-items:center;padding:0 8px;font-size:11px;font-weight:600;white-space:nowrap;overflow:hidden;box-sizing:border-box;`,
                  )}
                >
                  {ph.name}
                </div>
              );
            })}
            <div
              style={css(
                `position:absolute;top:0;bottom:0;left:${Math.max(0, Math.min(100, ((0 - s0) / span) * 100))}%;width:2px;background:var(--ink);box-shadow:0 0 8px rgb(var(--w) / .6);`,
              )}
            />
          </div>
          <div style={css('display:flex;flex-direction:column;gap:4px;')}>
            {sel.phases.map((ph, i) => (
              <div
                key={i}
                className="mg-phrow"
                style={css(
                  'display:grid;grid-template-columns:10px minmax(120px,1fr) minmax(110px,150px) minmax(110px,150px) 28px;align-items:center;gap:8px;',
                )}
              >
                <span
                  style={css(`width:10px;height:10px;border-radius:3px;background:${PHC[i % PHC.length]};`)}
                />
                <input
                  className="mg-in"
                  value={ph.name}
                  maxLength={120}
                  aria-label={`${L(31)} ${i + 1}`}
                  onChange={(e) => updPh(i, 'name')(e.target.value)}
                  style={css(
                    'min-width:0;height:32px;padding:0 10px;border-radius:9px;border:1px solid rgb(var(--w) / .1);background:rgb(var(--d) / calc(.16 * var(--d-k)));color:var(--ink);font:inherit;font-size:13px;outline:none;',
                  )}
                />
                {weekSel(ph.from, updPh(i, 'from'), `${ph.name} · ${tr('Início')}`)}
                {weekSel(ph.to, updPh(i, 'to'), `${ph.name} · ${tr('Fim')}`)}
                <button
                  type="button"
                  className="mg-hdel"
                  title={L(70)}
                  aria-label={`${L(70)}: ${ph.name}`}
                  onClick={() =>
                    mg.upd((d) => void d.projects.find((x) => x.id === sel.id)!.phases.splice(i, 1))
                  }
                  style={css(
                    'width:28px;height:28px;border-radius:50%;border:0;background:transparent;color:rgb(var(--t) / calc(.55 * var(--t-k)));cursor:pointer;padding:0;font-size:14px;',
                  )}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>
        <div style={css('display:flex;flex-direction:column;gap:8px;')}>
          <div style={css('display:flex;align-items:center;gap:10px;')}>
            <span style={css('font-size:16px;font-weight:600;margin-right:auto;')}>{L(17)}</span>
            <button
              type="button"
              onClick={() => {
                const id = uid();
                mg.upd(
                  (d) =>
                    void d.reqs.unshift({
                      id,
                      team: sel.team,
                      project: sel.id,
                      skills: reqSkills,
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
                'height:30px;padding:0 12px;border-radius:999px;border:0;background:var(--ink);color:var(--ink-inv);font:inherit;font-size:12px;font-weight:600;cursor:pointer;',
              )}
            >
              {L(33)}
            </button>
          </div>
          {team.map((a) => {
            const p = mg.pById[a.person];
            const tm = mg.tOf(p);
            return (
              <div
                key={a.id}
                role="button"
                tabIndex={0}
                className="mg-h10"
                onClick={() =>
                  a.person
                    ? mg.nav('mg_people', { p: a.person })
                    : mg.nav('mg_alloc', { v: 'proj', pj: sel.id })
                }
                onKeyDown={(e) =>
                  e.key === 'Enter' &&
                  (a.person
                    ? mg.nav('mg_people', { p: a.person })
                    : mg.nav('mg_alloc', { v: 'proj', pj: sel.id }))
                }
                style={css(
                  'display:flex;align-items:center;gap:10px;min-height:46px;padding:0 12px;border-radius:14px;background:rgb(var(--w) / .04);cursor:pointer;',
                )}
              >
                {p ? <Av p={p} size={30} fs={11} tc={tm.tc} /> : <span className="al-ph-av sm">?</span>}
                <span style={css('flex:1;min-width:0;display:flex;flex-direction:column;')}>
                  <span style={css('font-size:13.5px;font-weight:600;')}>
                    {p?.name ?? `${a.role || tr('Função')} · ${tr('Por atribuir')}`}
                    {a.status === 'tentative' && (
                      <span style={css('font-weight:500;opacity:.7;')}> · {tr('tentativo')}</span>
                    )}
                  </span>
                  <span style={css('font-size:11.5px;color:rgb(var(--t) / calc(.62 * var(--t-k)));')}>
                    {a.person && a.role ? `${a.role} · ` : ''}
                    {tr(p?.role ?? '')}
                    {tm.tn && (
                      <>
                        {' · '}
                        <span style={css(`color:${tm.tc};font-weight:600;`)}>{tm.tn}</span>
                      </>
                    )}{' '}
                    · {p ? LV[p.level] : ''}
                  </span>
                </span>
                <span
                  style={css(
                    'font-size:12px;color:rgb(var(--t) / calc(.62 * var(--t-k)));white-space:nowrap;',
                  )}
                >
                  {fmtDay(a.from)} → {fmtDay(a.to)}
                </span>
                <span
                  style={css(
                    "min-width:72px;text-align:right;font-family:'Geist Mono',monospace;font-size:13px;font-weight:600;",
                  )}
                >
                  {effortLabel(a, lang)}
                </span>
              </div>
            );
          })}
          {reqs.length > 0 && (
            <div style={css('display:flex;flex-direction:column;gap:6px;margin-top:6px;')}>
              <span
                style={css(
                  'font-size:12px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:rgb(var(--t) / calc(.7 * var(--t-k)));',
                )}
              >
                {L(34)}
              </span>
              {reqs.map((r) => (
                <div
                  key={r.id}
                  role="button"
                  tabIndex={0}
                  className="mg-h6"
                  onClick={() => mg.nav('mg_staff', { r: r.id, rf: 'all' })}
                  onKeyDown={(e) => e.key === 'Enter' && mg.nav('mg_staff', { r: r.id, rf: 'all' })}
                  style={css(
                    'display:flex;align-items:center;gap:10px;min-height:40px;padding:0 12px;border-radius:14px;border:1px dashed rgb(var(--w) / .2);cursor:pointer;',
                  )}
                >
                  <span style={css('flex:1;min-width:0;font-size:13px;')}>
                    {r.skills.map((s) => `${SKN[s.k] ?? s.k} · ${LV[s.l] ?? ''}`).join(' + ')} ·{' '}
                    {r.hours || 0}h
                  </span>
                  <span style={css('font-size:12px;color:rgb(var(--t) / calc(.62 * var(--t-k)));')}>
                    {wLbl(r.from)} → {wLbl(r.to)}
                  </span>
                  <span
                    style={css(
                      `height:20px;padding:0 8px;border-radius:999px;display:flex;align-items:center;font-size:10.5px;font-weight:700;background:${MG_RST[r.status]};`,
                    )}
                  >
                    {tr(r.status)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Split>
  );
  // the new-project dialog is a portal: outside the Split, so it opens over the list on phones too
  return (
    <>
      {split}
      {dialog}
    </>
  );
}

const IN =
  'height:38px;padding:0 12px;border-radius:12px;border:1px solid rgb(var(--w) / .16);background-color:rgb(var(--d) / calc(.25 * var(--d-k)));color:var(--ink);font:inherit;font-size:13.5px;outline:none;box-sizing:border-box;width:100%;';
const LB = 'display:flex;flex-direction:column;gap:6px;min-width:0;';
const LT = 'font-size:12px;color:rgb(var(--t) / calc(.75 * var(--t-k)));';

function NewProject({
  mg,
  cOpts,
  modOpts,
  onClose,
  onCreated,
}: {
  mg: Mg;
  cOpts: Array<{ v: string; l: string }>;
  modOpts: string[];
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const { tr, lang, D } = mg;
  const { t: tx } = useI18n();
  const [mods, setMods] = useState<string[]>([]);
  const [n, setN] = useState({
    code: '',
    name: '',
    mode: D.clients.length ? 'exist' : 'new',
    client: D.clients[0]?.id ?? '',
    newClient: '',
    newType: 'Externo' as 'Externo' | 'Interno',
    newSector: '',
    newContact: '',
    newEmail: '',
  });
  const [err, setErr] = useState('');
  const setF = (k: keyof typeof n) => (v: string) => {
    setErr('');
    setN((o) => ({ ...o, [k]: v }));
  };
  const save = () => {
    const nm = n.name.trim();
    const nc = n.newClient.trim();
    if (!nm) return setErr(tr('Indique o nome do projeto.'));
    if (n.mode === 'new' && !nc) return setErr(tr('Indique o nome do novo cliente.'));
    if (n.mode === 'new' && n.newEmail && !/^\S+@\S+\.\S+$/.test(n.newEmail.trim()))
      return setErr(tr('Email do cliente inválido.'));
    if (n.mode === 'exist' && !n.client) return setErr(tr('Escolha um cliente.'));
    const cid = n.mode === 'new' ? uid() : n.client;
    const pr = mgNewProject(mg, { code: n.code.trim() || 'NOVO-01', name: nm, client: cid, modules: mods });
    mg.upd((d) => {
      if (n.mode === 'new')
        d.clients.unshift({
          id: cid,
          name: nc,
          type: n.newType,
          sector: n.newSector.trim(),
          contact: n.newContact.trim(),
          email: n.newEmail.trim(),
        });
      d.projects.unshift(pr);
    });
    onCreated(pr.id);
  };
  const selS = {
    ...css(
      `${IN}background-color:rgb(var(--w) / .06);padding-right:30px;cursor:pointer;appearance:none;-webkit-appearance:none;color-scheme: var(--scheme);`,
    ),
    backgroundImage: CHEV,
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'right 12px center',
    backgroundSize: '11px',
  };
  const txt = (k: keyof typeof n, label: string, type = 'text') => (
    <label style={css(LB)}>
      <span style={css(LT)}>{label}</span>
      <input
        className="mg-in"
        value={n[k]}
        type={type}
        maxLength={200}
        onChange={(e) => setF(k)(e.target.value)}
        style={css(IN)}
      />
    </label>
  );
  return (
    <Dialog
      label={mgL(67, lang)}
      onClose={onClose}
      s="width:100%;max-width:460px;display:flex;flex-direction:column;gap:16px;padding:22px;border-radius:28px;"
    >
      <span style={css('font-size:18px;font-weight:600;')}>{mgL(67, lang)}</span>
      <div style={css('display:grid;grid-template-columns:140px minmax(0,1fr);gap:10px;')}>
        <label style={css(LB)}>
          <span style={css(LT)}>{tr('Código')}</span>
          <input
            className="mg-in"
            value={n.code}
            placeholder="NOVO-01"
            spellCheck={false}
            maxLength={40}
            autoFocus
            onChange={(e) => setF('code')(e.target.value.toUpperCase())}
            style={css(`${IN}font-family:'Geist Mono',monospace;`)}
          />
        </label>
        {txt('name', tr('Nome'))}
      </div>
      <div style={css(LB)}>
        <span style={css('display:flex;align-items:baseline;gap:8px;')}>
          <span style={css(LT)}>{tx('mgm_mods')}</span>
          <span style={css('font-size:11.5px;color:rgb(var(--t) / calc(.5 * var(--t-k)));')}>
            {tx('mgm_modsHint')}
          </span>
        </span>
        <ModulePicker label={tx('mgm_mods')} value={mods} options={modOpts} onChange={setMods} />
      </div>
      <div style={css('display:flex;flex-direction:column;gap:8px;')}>
        <span style={css(LT)}>{tr('Cliente')}</span>
        <div
          role="tablist"
          style={css(
            'align-self:flex-start;display:flex;gap:2px;padding:3px;border-radius:999px;background:rgb(var(--d) / calc(.22 * var(--d-k)));border:1px solid rgb(var(--w) / .12);',
          )}
        >
          {(
            [
              ['exist', 'Cliente Existente'],
              ['new', 'Novo Cliente'],
            ] as const
          ).map(([m, l]) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={n.mode === m}
              onClick={() => setF('mode')(m)}
              style={css(
                `height:28px;padding:0 14px;border-radius:999px;border:0;font:inherit;font-size:12.5px;font-weight:600;cursor:pointer;background:${n.mode === m ? 'var(--ink)' : 'transparent'};color:${n.mode === m ? 'var(--ink-inv)' : 'rgb(var(--t) / calc(.8 * var(--t-k)))'};`,
              )}
            >
              {tr(l)}
            </button>
          ))}
        </div>
        {n.mode === 'exist' ? (
          <select
            value={n.client}
            aria-label={tr('Cliente')}
            onChange={(e) => setF('client')(e.target.value)}
            style={selS}
          >
            {cOpts.map((o) => (
              <option key={o.v} value={o.v} style={OPT}>
                {o.l}
              </option>
            ))}
          </select>
        ) : (
          <div
            style={css(
              'display:flex;flex-direction:column;gap:10px;padding:14px;border-radius:18px;background:rgb(var(--d) / calc(.16 * var(--d-k)));border:1px solid rgb(var(--w) / .1);',
            )}
          >
            <div style={css('display:grid;grid-template-columns:minmax(0,1fr) 140px;gap:10px;')}>
              {txt('newClient', tr('Nome do cliente'))}
              <label style={css(LB)}>
                <span style={css(LT)}>{tr('Tipo')}</span>
                <select value={n.newType} onChange={(e) => setF('newType')(e.target.value)} style={selS}>
                  {['Externo', 'Interno'].map((v) => (
                    <option key={v} value={v} style={OPT}>
                      {tr(v)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {txt('newSector', tr('Setor'))}
            <div style={css('display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:10px;')}>
              {txt('newContact', tr('Contacto'))}
              {txt('newEmail', tr('Email'), 'email')}
            </div>
          </div>
        )}
      </div>
      {err && (
        <span role="alert" style={css('font-size:12.5px;color:var(--kh-error-text);')}>
          {err}
        </span>
      )}
      <div style={css('display:flex;align-items:center;justify-content:flex-end;gap:8px;margin-top:2px;')}>
        <button
          type="button"
          onClick={onClose}
          style={css(
            'height:36px;padding:0 14px;border-radius:999px;border:1px solid rgb(var(--w) / .18);background:rgb(var(--w) / .08);color:var(--ink);font:inherit;font-size:13px;cursor:pointer;',
          )}
        >
          {tr('Cancelar')}
        </button>
        <button
          type="button"
          onClick={save}
          style={css(
            'height:36px;padding:0 16px;border-radius:999px;border:0;background:var(--ink);color:var(--ink-inv);font:inherit;font-size:13px;font-weight:600;cursor:pointer;',
          )}
        >
          {tr('Criar Projeto')}
        </button>
      </div>
    </Dialog>
  );
}

/** Projetos › filter by module: the modules the projects use, with how many projects have each. */
function ModFilter({ mg, value, onChange }: { mg: Mg; value: string; onChange: (m: string) => void }) {
  const { t } = useI18n();
  const ref = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const n = new Map<string, number>();
  for (const p of mg.PJ)
    if (mg.inTeamProj(p.id)) for (const m of p.modules ?? []) n.set(m, (n.get(m) ?? 0) + 1);
  const used = moduleOptions(n.keys()).filter((m) => n.has(m));
  if (!used.length && !value) return null;
  const pickRow = (m: string, label: React.ReactNode, count?: number) => (
    <button
      key={m || '*'}
      type="button"
      role="option"
      aria-selected={value === m}
      onClick={() => {
        onChange(m);
        setOpen(false);
      }}
    >
      {m ? (
        <span className="mg-modlist__sq" style={{ background: modColor(m) }} aria-hidden />
      ) : (
        <span className="mg-modlist__sq" aria-hidden />
      )}
      <span className={m ? 'mg-modlist__id' : undefined} style={css('flex:1;')}>
        {label}
      </span>
      {count !== undefined && (
        <span className="mg-modlist__desc" style={css('flex:none;')}>
          {count}
        </span>
      )}
      {value === m && (
        <span className="mg-modlist__tick" aria-hidden>
          ✓
        </span>
      )}
    </button>
  );
  return (
    <>
      <button
        ref={ref}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={value ? `${t('mgm_modFilter')}: ${value}` : t('mgm_modFilter')}
        onClick={() => setOpen((o) => !o)}
        style={
          value
            ? {
                ...modChip(value),
                height: 28,
                padding: '0 10px',
                cursor: 'pointer',
                font: 'inherit',
                fontSize: 12,
                fontWeight: 600,
              }
            : css(
                'height:28px;padding:0 10px;display:inline-flex;align-items:center;gap:5px;border-radius:999px;border:1px dashed rgb(var(--w) / .28);background:transparent;color:var(--ink);font:inherit;font-size:12px;font-weight:600;cursor:pointer;',
              )
        }
      >
        {value || t('mgm_modFilter')}
        <span aria-hidden style={css('font-size:9px;opacity:.7;')}>
          ▾
        </span>
      </button>
      {open && (
        <Popover
          anchor={ref}
          align="left"
          onClose={() => setOpen(false)}
          className="kh-taglist mg-modlist"
          width={240}
          maxHeight={320}
          role="listbox"
          aria-label={t('mgm_modFilter')}
        >
          {pickRow('', t('mgm_modAll'))}
          {used.map((m) => pickRow(m, m, n.get(m)))}
        </Popover>
      )}
    </>
  );
}
