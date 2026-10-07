'use client';

import { useSearchParams } from 'next/navigation';
import { MG_PST, mgIni, mgK, wLblY, type MgClient } from '@/lib/mg';
import { mgL } from '@/lib/mgText';
import { css } from './css';
import { Av, Fields, Split, Trash, uid } from './ui';
import type { Mg } from './store';

// Clientes (prototype isClients): shared with SAP systems and transports.
export function MgClients({ mg }: { mg: Mg }) {
  const sp = useSearchParams();
  const { D, tr, lang } = mg;
  const L = (i: number) => mgL(i, lang);
  const sel = mg.cById[sp.get('c') ?? ''] ?? D.clients[0];
  const select = (id: string) => mg.nav('mg_clients', { c: id });
  const set = (k: keyof MgClient) => (v: string) =>
    mg.upd(
      (d) =>
        void Object.assign(
          d.clients.find((x) => x.id === sel!.id)!,
          { [k]: v },
        ),
    );

  const list = (
    <>
      <div style={css('flex-shrink:0;display:flex;align-items:center;gap:10px;padding:20px 16px 12px;')}>
        <h1 style={css('margin:0;font-size:24px;font-weight:600;letter-spacing:-.02em;margin-right:auto;')}>
          {L(54)}
        </h1>
        <button
          type="button"
          title={L(75)}
          aria-label={L(75)}
          onClick={() => {
            const id = uid();
            mg.upd(
              (d) =>
                void d.clients.unshift({
                  id,
                  name: tr('Novo Cliente'),
                  type: 'Externo',
                  sector: '',
                  contact: '',
                  email: '',
                }),
            );
            select(id);
          }}
          style={css(
            'width:32px;height:32px;border-radius:50%;border:0;background:#fbf8f5;color:#2a211c;cursor:pointer;font-size:18px;line-height:1;',
          )}
        >
          +
        </button>
      </div>
      <div
        style={css(
          'flex:1;min-height:0;overflow:auto;padding:0 8px 12px;display:flex;flex-direction:column;gap:4px;',
        )}
      >
        {D.clients.map((c) => {
          const on = sel && c.id === sel.id;
          const n = D.projects.filter((p) => p.client === c.id).length;
          return (
            <div
              key={c.id}
              role="button"
              tabIndex={0}
              aria-current={on || undefined}
              className="mg-h8"
              onClick={() => select(c.id)}
              onKeyDown={(e) => e.key === 'Enter' && select(c.id)}
              style={css(
                `flex-shrink:0;display:flex;align-items:center;gap:12px;min-height:58px;padding:0 12px;border-radius:18px;cursor:pointer;background:${on ? 'rgba(255,255,255,.14)' : 'transparent'};border:1px solid ${on ? 'rgba(255,255,255,.2)' : 'transparent'};`,
              )}
            >
              <span
                style={css(
                  'width:38px;height:38px;flex:none;border-radius:12px;background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.16);display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;',
                )}
              >
                {mgIni(c.name)}
              </span>
              <span style={css('flex:1;min-width:0;display:flex;flex-direction:column;gap:1px;')}>
                <span
                  style={css(
                    'font-size:14px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;',
                  )}
                >
                  {c.name}
                </span>
                <span style={css('font-size:12px;color:rgba(255,248,240,.64);')}>
                  {tr(c.type)} · {c.sector || '—'}
                </span>
              </span>
              <span
                style={css("font-family:'Geist Mono',monospace;font-size:12px;color:rgba(255,248,240,.75);")}
              >
                {n} proj.
              </span>
            </div>
          );
        })}
      </div>
    </>
  );

  if (!sel)
    return (
      <Split page="mg_clients" list={list}>
        {null}
      </Split>
    );
  const my = D.projects.filter((p) => p.client === sel.id);
  const bud = my.reduce((s, p) => s + (+p.budget || 0), 0);
  const used = my.reduce((s, p) => s + mg.tsHours(p.id).v, 0);
  const tm: Record<string, number> = {};
  for (const a of D.allocs)
    if (my.some((p) => p.id === a.project) && mg.wi(a.from) <= 0 && mg.wi(a.to) >= 0)
      tm[a.person] = (tm[a.person] ?? 0) + a.hours;
  const kpis = [
    ['Projetos ativos', String(my.filter((p) => p.status === 'Ativo' || p.status === 'Em risco').length)],
    ['Orçamento total', mgK(bud)],
    ['Consumido', mgK(used)],
    ['Pessoas esta semana', String(Object.keys(tm).length)],
  ];
  return (
    <Split page="mg_clients" list={list}>
      <div style={css('display:flex;flex-direction:column;gap:18px;padding:24px 26px 30px;')}>
        <div style={css('display:flex;align-items:center;gap:14px;')}>
          <span
            style={css(
              'width:52px;height:52px;flex:none;border-radius:16px;background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.18);display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:700;',
            )}
          >
            {mgIni(sel.name)}
          </span>
          <input
            value={sel.name}
            maxLength={200}
            aria-label={tr('Nome')}
            onChange={(e) => set('name')(e.target.value)}
            style={css(
              'flex:1;min-width:0;padding:0;border:0;background:transparent;color:#fbf8f5;font:inherit;font-size:26px;font-weight:600;letter-spacing:-.02em;outline:none;',
            )}
          />
          <button
            type="button"
            className="mg-round"
            title={L(76)}
            aria-label={L(76)}
            style={{ color: '#ffc9b8' }}
            onClick={() => {
              if (
                my.length &&
                !mg.cf(
                  `${sel.name} tem ${my.length} projeto(s). Remover mesmo assim? Os projetos ficam sem cliente.`,
                )
              )
                return;
              mg.upd((d) => {
                d.clients = d.clients.filter((x) => x.id !== sel.id);
                d.projects.forEach((p) => {
                  if (p.client === sel.id) p.client = '';
                });
              });
              mg.nav('mg_clients');
            }}
          >
            <Trash />
          </button>
        </div>
        <div style={css('display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;')}>
          {kpis.map(([l, v]) => (
            <div
              key={l}
              style={css(
                'display:flex;flex-direction:column;gap:4px;padding:12px 14px;border-radius:18px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);',
              )}
            >
              <span style={css('font-size:12px;color:rgba(255,248,240,.68);')}>{tr(l!)}</span>
              <span style={css("font-family:'Geist Mono',monospace;font-size:19px;font-weight:600;")}>
                {v}
              </span>
            </div>
          ))}
        </div>
        <Fields
          fields={[
            {
              label: tr('Tipo'),
              val: sel.type,
              opts: [
                { v: 'Externo', l: tr('Externo (consultoria)') },
                { v: 'Interno', l: tr('Interno (equipa da empresa)') },
              ],
              onChange: set('type'),
            },
            { label: tr('Setor'), val: sel.sector, onChange: set('sector') },
            { label: tr('Contacto'), val: sel.contact, onChange: set('contact') },
            { label: tr('Email'), val: sel.email, onChange: set('email') },
          ]}
        />
        <div style={css('display:flex;flex-direction:column;gap:8px;')}>
          <div style={css('display:flex;align-items:center;gap:10px;')}>
            <span style={css('font-size:16px;font-weight:600;margin-right:auto;')}>{L(28)}</span>
            <button
              type="button"
              onClick={() => {
                const id = uid();
                mg.upd(
                  (d) =>
                    void d.projects.unshift({
                      id,
                      team: '',
                      code: 'NOVO-01',
                      name: tr('Novo Projeto'),
                      client: sel.id,
                      budget: 50000,
                      from: mg.wk(0),
                      to: mg.wk(12),
                      color: `oklch(0.8 0.1 ${Math.floor(Math.random() * 360)})`,
                      status: 'Planeado',
                      manager: '',
                      phases: [
                        { name: tr('Preparação'), from: mg.wk(0), to: mg.wk(2) },
                        { name: tr('Execução'), from: mg.wk(3), to: mg.wk(12) },
                      ],
                    }),
                );
                mg.nav('mg_projects', { pj: id });
              }}
              style={css(
                'height:30px;padding:0 12px;border-radius:999px;border:1.5px dashed rgba(255,255,255,.28);background:transparent;color:rgba(255,248,240,.85);font:inherit;font-size:12px;font-weight:600;cursor:pointer;',
              )}
            >
              {L(55)}
            </button>
          </div>
          {my.map((p) => (
            <div
              key={p.id}
              role="button"
              tabIndex={0}
              className="mg-h10"
              onClick={() => mg.nav('mg_projects', { pj: p.id })}
              onKeyDown={(e) => e.key === 'Enter' && mg.nav('mg_projects', { pj: p.id })}
              style={css(
                'display:flex;align-items:center;gap:12px;min-height:52px;padding:0 14px;border-radius:16px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);cursor:pointer;',
              )}
            >
              <span
                style={css(`width:4px;height:26px;flex:none;border-radius:999px;background:${p.color};`)}
              />
              <span style={css('flex:1;min-width:0;display:flex;flex-direction:column;')}>
                <span
                  style={css(
                    'font-size:13.5px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;',
                  )}
                >
                  <span style={css("font-family:'Geist Mono',monospace;")}>{p.code}</span> · {p.name}
                </span>
                <span style={css('font-size:12px;color:rgba(255,248,240,.62);')}>
                  {wLblY(p.from)} → {wLblY(p.to)} · {mgK(p.budget)}
                </span>
              </span>
              <span
                style={css(
                  `height:20px;padding:0 8px;border-radius:999px;display:flex;align-items:center;font-size:10.5px;font-weight:700;background:${MG_PST[p.status]};`,
                )}
              >
                {tr(p.status)}
              </span>
            </div>
          ))}
        </div>
        <div style={css('display:flex;flex-direction:column;gap:8px;')}>
          <span style={css('font-size:16px;font-weight:600;')}>{L(56)}</span>
          <div style={css('display:flex;flex-wrap:wrap;gap:6px;')}>
            {Object.entries(tm).map(([pid, h]) => {
              const p = mg.pById[pid];
              return (
                <button
                  key={pid}
                  type="button"
                  className="mg-h12"
                  onClick={() => mg.nav('mg_people', { p: pid })}
                  style={css(
                    'height:34px;padding:0 12px 0 4px;border-radius:999px;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.06);color:#fbf8f5;font:inherit;font-size:12.5px;cursor:pointer;display:flex;align-items:center;gap:8px;',
                  )}
                >
                  <Av p={p} size={26} fs={10} tc={mg.tOf(p).tc} />
                  {p?.name ?? '?'}
                  <span style={css("font-family:'Geist Mono',monospace;color:rgba(255,248,240,.65);")}>
                    {h}h
                  </span>
                </button>
              );
            })}
          </div>
          {!Object.keys(tm).length && (
            <div style={css('font-size:13px;color:rgba(255,248,240,.62);')}>{L(57)}</div>
          )}
        </div>
      </div>
    </Split>
  );
}
