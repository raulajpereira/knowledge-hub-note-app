'use client';

import { useCallback, useEffect, useState } from 'react';
import { adminApi } from '@/lib/client/api';
import { onActivateKey, useToast } from '@/components/ui';
import { SEC_TITLE, SectionHead, useConsole } from './AdminShell';
import { Avatar, Chips, eur, useA } from './ui';

type Item = {
  cat: 'late' | 'requests' | 'trial' | 'seats' | 'renew';
  clientId: string;
  name: string;
  plan: string | null;
  value: number;
  cycle: 'monthly' | 'annual';
  used: number;
  seats: number;
  contact: string;
  days: number | null;
  requestId?: string;
  requestPlan?: string;
};
type Data = {
  mrr: number;
  arr: number;
  paying: number;
  trials: number;
  canceled: number;
  seats: number;
  used: number;
  activeUsers: number;
  users: number;
  attention: Item[];
};

// prototype "Precisa de atenção" categories (+ plan requests, D43), in this order
const CATS: Record<Item['cat'], [string, string]> = {
  late: ['Pagamentos em atraso', 'oklch(0.78 0.15 50)'],
  requests: ['Pedidos de plano', 'oklch(0.72 0.17 25)'],
  trial: ['Trials a terminar', 'oklch(0.76 0.13 245)'],
  seats: ['Lugares esgotados', 'oklch(0.78 0.14 150)'],
  renew: ['Renovações próximas', 'rgba(255,248,240,.7)'],
};

/** Visão Geral (D44: MRR and ARR as they are today, no invented history). */
export function Overview() {
  const { A } = useA();
  const toast = useToast();
  const { go, has, can } = useConsole();
  const [d, setD] = useState<Data | null>(null);
  const [cat, setCat] = useState<'all' | Item['cat']>('all');
  const load = useCallback(() => {
    adminApi<Data>('/overview')
      .then(setD)
      .catch(() => setD(null));
  }, []);
  useEffect(load, [load]);

  const act = async (it: Item, action: 'reminder' | 'convert' | 'seats5' | 'invoice') => {
    try {
      await adminApi(`/tenants/${it.clientId}/action`, { action });
      toast({ message: A('Feito.'), tone: 'success' });
      load();
    } catch {
      toast({ message: A('Não foi possível concluir a ação.'), tone: 'error' });
    }
  };
  const openClient = (it: Item) => {
    if (has('packs')) go(it.seats === 1 ? 'inds' : 'packs', { c: it.clientId });
  };

  const detail = (it: Item) => {
    const per = it.cycle === 'annual' ? `${eur(it.value * 12)}/${A('ano')}` : `${eur(it.value)}/${A('mês')}`;
    if (it.cat === 'late') return `${per} · ${it.contact}`;
    if (it.cat === 'requests')
      return `${A('Pedido de')} ${it.requestPlan === 'CUSTOM' ? A('pacote personalizado') : it.requestPlan} · ${it.plan ?? ''}`;
    if (it.cat === 'trial') return `${it.plan} · ${it.used} / ${it.seats} ${A('lugares em uso')}`;
    if (it.cat === 'seats') return `${it.plan} · ${it.used} / ${it.seats} ${A('lugares ocupados')}`;
    return `${it.cycle === 'annual' ? A('Anual') : A('Mensal')} · ${per}`;
  };
  const when = (it: Item) => {
    if (it.cat === 'seats') return 'upgrade';
    const n = it.days ?? 0;
    if (it.cat === 'late') return A(`há ${Math.max(0, -n)} dias`);
    if (it.cat === 'requests') return n === 0 ? A('hoje') : A(`há ${Math.abs(n)} dias`);
    return n < 0 ? A(`há ${-n} dias`) : A(`em ${n} dias`);
  };
  const action = (it: Item): [string, () => void] | null => {
    const w = can('clients', true);
    if (it.cat === 'late') return w ? [A('Enviar lembrete'), () => void act(it, 'reminder')] : null;
    if (it.cat === 'requests')
      return has('requests') ? [A('Ver pedido'), () => go('requests', { r: it.requestId! })] : null;
    if (it.cat === 'trial') return w ? [A('Converter em pago'), () => void act(it, 'convert')] : null;
    if (it.cat === 'seats') return w ? [A('+5 lugares'), () => void act(it, 'seats5')] : null;
    if (it.plan !== 'FREE' && w) return [A('Emitir fatura'), () => void act(it, 'invoice')];
    return has('packs') ? [A('Ver cliente'), () => openClient(it)] : null;
  };

  const items = d?.attention ?? [];
  const shown = items.filter((x) => cat === 'all' || x.cat === cat);
  const cats = (Object.keys(CATS) as Item['cat'][]).filter((c) => items.some((x) => x.cat === c));
  const kpis = d
    ? [
        {
          l: A('Clientes pagantes'),
          v: String(d.paying),
          s: A(`${d.trials} em trial · ${d.canceled} cancelados`),
        },
        {
          l: A('Lugares ocupados'),
          v: `${d.seats ? Math.round((d.used / d.seats) * 100) : 0}%`,
          s: A(`${d.used} de ${d.seats} lugares vendidos`),
        },
        {
          l: A('Utilizadores ativos'),
          v: String(d.activeUsers),
          s: A(`nos últimos 7 dias, de ${d.users} registados`),
        },
      ]
    : [];

  return (
    <>
      <SectionHead title={A(SEC_TITLE.overview[0])} sub={A(SEC_TITLE.overview[1])} />
      <div className="kh-ad-body">
        {d && (
          <>
            <div className="kh-ad-ov">
              <div className="kh-ad-card">
                <div className="kh-ad-kpi__l">{A('Receita recorrente mensal (MRR)')}</div>
                <div className="kh-ad-mrr__v">{eur(d.mrr)}</div>
                <div className="kh-ad-kpi__s">
                  ARR <span className="kh-ad-mono">{eur(d.arr)}</span>
                </div>
              </div>
              <div className="kh-ad-kpis">
                {kpis.map((k) => (
                  <button
                    key={k.l}
                    type="button"
                    className="kh-ad-card kh-ad-kpi"
                    disabled={!has('packs')}
                    onClick={() => go('packs')}
                  >
                    <span className="kh-ad-kpi__l">{k.l}</span>
                    <span className="kh-ad-kpi__v">{k.v}</span>
                    <span className="kh-ad-kpi__s">{k.s}</span>
                    {has('packs') && <span className="kh-ad-kpi__cta">{A('Ver clientes')} →</span>}
                  </button>
                ))}
              </div>
            </div>
            <div className="kh-ad-card">
              <div
                style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 6 }}
              >
                <div style={{ fontSize: 18, fontWeight: 600, marginRight: 'auto' }}>
                  {A('Precisa de atenção')}
                </div>
                {items.length > 0 && (
                  <Chips
                    label={A('Precisa de atenção')}
                    value={cat}
                    onChange={setCat}
                    options={[
                      { v: 'all' as const, l: A('Todos'), n: items.length },
                      ...cats.map((c) => ({
                        v: c,
                        l: A(CATS[c][0]),
                        n: items.filter((x) => x.cat === c).length,
                        dot: CATS[c][1],
                      })),
                    ]}
                  />
                )}
              </div>
              {!items.length && (
                <div style={{ padding: '26px 0', textAlign: 'center' }}>
                  <div style={{ fontSize: 15, fontWeight: 600 }}>{A('Está tudo em ordem.')}</div>
                  <div className="kh-ad-note">{A('Nenhum cliente precisa de ação.')}</div>
                </div>
              )}
              {cats
                .filter((c) => cat === 'all' || c === cat)
                .map((c) => {
                  const rows = shown.filter((x) => x.cat === c);
                  return (
                    <div key={c}>
                      <div className="kh-ad-att__group" style={{ color: CATS[c][1] }}>
                        <span className="kh-ad-dot" style={{ background: CATS[c][1] }} />
                        {A(CATS[c][0])}
                        <span className="kh-ad-mono" style={{ opacity: 0.7 }}>
                          {rows.length}
                        </span>
                      </div>
                      {rows.map((it) => {
                        const a = action(it);
                        return (
                          <div
                            key={`${c}-${it.clientId}-${it.requestId ?? ''}`}
                            className="kh-ad-att"
                            style={{ ['--c' as string]: CATS[c][1] }}
                            role="button"
                            tabIndex={0}
                            onClick={() => openClient(it)}
                            onKeyDown={onActivateKey(() => openClient(it))}
                          >
                            <Avatar name={it.name} square />
                            <span style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                              <button
                                type="button"
                                className="kh-rowbtn kh-ad-td__main"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openClient(it);
                                }}
                              >
                                {it.name}
                              </button>
                              <span className="kh-ad-td__sub">{detail(it)}</span>
                            </span>
                            <span className="kh-ad-when">{when(it)}</span>
                            {a ? (
                              <button
                                type="button"
                                className="kh-ad-btn kh-ad-btn--sm"
                                data-kind="p"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  a[1]();
                                }}
                              >
                                {a[0]}
                              </button>
                            ) : (
                              <span />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
            </div>
          </>
        )}
      </div>
    </>
  );
}
