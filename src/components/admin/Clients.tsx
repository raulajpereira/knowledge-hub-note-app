'use client';

import { useCallback, useEffect, useState } from 'react';
import { adminApi, isApiFailure } from '@/lib/client/api';
import { actionLabel } from '@/lib/adminLabels';
import { FILES_MAX_MB, FILES_MAX_MB_CAP, FILES_QUOTA_MB, FILES_QUOTA_MB_CAP, fmtBytes } from '@/lib/drive';
import { useConfirm, useToast } from '@/components/ui';
import { SEC_TITLE, SectionHead, Svg, useConsole } from './AdminShell';
import { CodeDetail, CodeDone, type CodeRow } from './Codes';
import {
  Avatar,
  Bar,
  CLIENT_ST,
  CODE_ST,
  CODE_TY,
  Cell,
  Chips,
  DrawerHead,
  Field,
  PlanChip,
  StatusChip,
  Table,
  USER_ST,
  daysTo,
  eur,
  fmtDate,
  fmtStamp,
  useA,
} from './ui';

export type Client = {
  id: string;
  name: string;
  kind: 'pack' | 'individual';
  status: 'trial' | 'active' | 'past_due' | 'suspended' | 'canceled';
  plan: { code: string; color: string | null } | null;
  addonGroups: string[];
  cycle: 'monthly' | 'annual';
  seats: number;
  used: number;
  renewAt: string | null;
  trialEndsAt: string | null;
  since: string;
  contactName: string;
  contactEmail: string;
  value: number;
  licenseCode: string | null;
};
export type CUser = {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'member';
  status: 'active' | 'invited' | 'paused' | 'disabled';
  verified: boolean;
  lastSeenAt: string | null;
  createdAt: string;
  code: string | null;
  tenantId: string;
  filesQuotaMb: number | null;
  filesMaxMb: number | null;
  filesUsed: number;
};
type Plan = { id: string; code: string; color: string | null; price: number; disc: number };
type Prices = { addon: Record<string, number>; customDisc: number };

// module groups of the "pacote individual" (prototype AGRP)
export const GROUPS: Array<[string, string]> = [
  ['base', 'Base'],
  ['pro', 'Pro'],
  ['mgmt', 'Management'],
  ['dev', 'Developer'],
  ['sap', 'SAP'],
  ['feat', 'Funcionalidades'],
  ['custom', 'Personalização'],
];

const isInd = (c: Client) => c.seats === 1;

/** "há 3h" / "há 2d" / "agora" (prototype `rel`). */
function useRel() {
  const { A } = useA();
  return (iso: string | null) => {
    if (!iso) return '—';
    const h = Math.floor((Date.now() - Date.parse(iso)) / 3_600_000);
    return h < 1 ? A('agora') : h < 24 ? A(`há ${h}h`) : A(`há ${Math.round(h / 24)}d`);
  };
}

function BillCell({ c }: { c: Client }) {
  const { A } = useA();
  const days = daysTo(c.status === 'trial' ? (c.trialEndsAt ?? c.renewAt) : c.renewAt);
  const main =
    c.status === 'trial'
      ? A('Trial')
      : c.status === 'canceled'
        ? '—'
        : c.plan?.code === 'FREE'
          ? A('Grátis')
          : c.cycle === 'annual'
            ? `${eur(c.value * 12)}/${A('ano')}`
            : `${eur(c.value)}/${A('mês')}`;
  const when = c.status === 'trial' ? (c.trialEndsAt ?? c.renewAt) : c.renewAt;
  const sub =
    c.status === 'canceled'
      ? A('Cancelado')
      : when
        ? `${c.status === 'past_due' ? A('Em atraso') + ' · ' : c.status === 'trial' ? A('Termina') + ' ' : A('Renova') + ' '}${fmtDate(when)}${days !== null && days >= 0 && days <= 7 && c.status !== 'past_due' ? ` · ${days}d` : ''}`
        : '';
  return (
    <Cell
      mono
      main={
        <span style={c.status === 'past_due' ? { color: 'oklch(0.84 0.13 40)' } : undefined}>{main}</span>
      }
      sub={sub}
    />
  );
}

// ── Packs de Utilizadores / Utilizadores Individuais ────────────────────────

type ListData = { clients: Client[]; plans: Plan[]; prices: Prices; users: CUser[] };
type Row =
  | { kind: 'pack'; c: Client }
  | { kind: 'member'; c: Client; u: CUser }
  | { kind: 'ind'; c: Client; u: CUser | undefined };

export function ClientList({ mode }: { mode: 'packs' | 'inds' }) {
  const { A } = useA();
  const { go, can, drawer } = useConsole();
  const rel = useRel();
  const [d, setD] = useState<ListData | null>(null);
  const [q, setQ] = useState('');
  const [f, setF] = useState<'all' | 'active' | 'trial' | 'renew' | 'past_due' | 'suspended' | 'canceled'>(
    'all',
  );
  const [closed, setClosed] = useState<Record<string, boolean>>({});
  const load = useCallback(() => {
    adminApi<ListData>('/clients?users=1')
      .then(setD)
      .catch(() => setD(null));
  }, []);
  useEffect(load, [load]);

  const s = q.trim().toLowerCase();
  const usersOf = (c: Client) => (d?.users ?? []).filter((u) => u.tenantId === c.id);
  const matches = (c: Client) =>
    !s ||
    [c.name, c.contactEmail].some((x) => x.toLowerCase().includes(s)) ||
    usersOf(c).some((u) => [u.name, u.email, u.code ?? ''].some((x) => x.toLowerCase().includes(s)));
  const passes = (c: Client) => {
    if (f === 'all') return true;
    if (f === 'renew') {
      const n = daysTo(c.renewAt);
      return c.status === 'active' && n !== null && n >= 0 && n <= 30;
    }
    return c.status === f;
  };
  const list = (d?.clients ?? []).filter(
    (c) => (mode === 'inds' ? isInd(c) : !isInd(c)) && passes(c) && matches(c),
  );
  const rows: Row[] =
    mode === 'inds'
      ? list.map((c) => ({ kind: 'ind' as const, c, u: usersOf(c)[0] }))
      : list.flatMap((c) => [
          { kind: 'pack' as const, c },
          ...(!closed[c.id] || s ? usersOf(c).map((u) => ({ kind: 'member' as const, c, u })) : []),
        ]);

  const openRow = (r: Row) => {
    if (r.kind === 'pack') go('packs', { c: r.c.id });
    else if (r.kind === 'member') go('packs', { c: r.c.id, u: r.u.id });
    else if (r.u) go('inds', { c: r.c.id, u: r.u.id });
    else go('inds', { c: r.c.id });
  };
  const userAct = (u: CUser) =>
    u.status === 'invited' || !u.lastSeenAt ? (
      <Cell main="—" sub={`${A('Registo')} ${fmtDate(u.createdAt)}`} />
    ) : (
      <Cell main={rel(u.lastSeenAt)} sub={`${A('Registo')} ${fmtDate(u.createdAt)}`} />
    );

  return (
    <>
      <SectionHead title={A(SEC_TITLE[mode][0])} sub={A(SEC_TITLE[mode][1])}>
        <input
          className="kh-ad-search"
          value={q}
          placeholder={A('Pesquisar…')}
          aria-label={A('Pesquisar…')}
          onChange={(e) => setQ(e.target.value)}
        />
        <Chips
          label={A('Estado')}
          value={f}
          onChange={setF}
          options={[
            { v: 'all', l: A('Todos') },
            { v: 'active', l: A('Ativos') },
            { v: 'trial', l: A('Trial') },
            { v: 'renew', l: A('Renova em 30 dias') },
            { v: 'past_due', l: A('Em atraso') },
            { v: 'suspended', l: A('Suspensos') },
            { v: 'canceled', l: A('Cancelados') },
          ]}
        />
        {can('clients', true) && d && (
          <button
            type="button"
            className="kh-ad-btn"
            data-kind="p"
            style={{ marginLeft: 'auto' }}
            onClick={() =>
              drawer(<NewClient plans={d.plans} seats={mode === 'packs' ? 5 : 1} onDone={load} />)
            }
          >
            {mode === 'packs' ? A('+ Novo pack') : A('+ Novo utilizador')}
          </button>
        )}
      </SectionHead>
      <div className="kh-ad-body">
        {d && (
          <Table<Row>
            label={A(SEC_TITLE[mode][0])}
            grid="minmax(280px,2.4fr) 120px minmax(150px,1fr) minmax(180px,1.2fr) minmax(130px,.9fr) 120px"
            minW={1000}
            rows={rows}
            rowKey={(r) => (r.kind === 'member' ? `${r.c.id}-${r.u.id}` : r.c.id)}
            onRow={openRow}
            cols={[
              {
                label: mode === 'packs' ? A('Pack / utilizador') : A('Utilizador'),
                row: true,
                cell: (r) =>
                  r.kind === 'pack' ? (
                    <>
                      <button
                        type="button"
                        className="kh-ad-btn kh-ad-btn--sm"
                        style={{ width: 26, padding: 0 }}
                        aria-expanded={!closed[r.c.id]}
                        aria-label={r.c.name}
                        onClick={(e) => {
                          e.stopPropagation();
                          setClosed((x) => ({ ...x, [r.c.id]: !x[r.c.id] }));
                        }}
                      >
                        <Svg
                          d={closed[r.c.id] ? '<path d="M9 6l6 6-6 6"/>' : '<path d="M6 9l6 6 6-6"/>'}
                          s={14}
                          sw={2}
                        />
                      </button>
                      <Avatar name={r.c.name} square />
                      <span style={{ minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                        <Cell
                          main={r.c.name}
                          sub={`Pack · ${r.c.used}/${r.c.seats} ${A('lugares')}${r.c.contactName ? ` · admin ${r.c.contactName}` : ''}`}
                        />
                      </span>
                    </>
                  ) : r.kind === 'member' ? (
                    <span
                      style={{ paddingLeft: 44, display: 'flex', gap: 10, alignItems: 'center', minWidth: 0 }}
                    >
                      <Avatar name={r.u.name} />
                      <span style={{ minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                        <Cell main={r.u.name} sub={`${r.u.email}${r.u.role === 'admin' ? ' · admin' : ''}`} />
                      </span>
                    </span>
                  ) : (
                    <>
                      <Avatar name={r.u?.name ?? r.c.name} />
                      <span style={{ minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                        <Cell
                          main={r.u?.name ?? r.c.contactName ?? r.c.name}
                          sub={r.u?.email ?? r.c.contactEmail}
                        />
                      </span>
                    </>
                  ),
              },
              {
                label: A('Pacote'),
                cell: (r) => (r.kind === 'member' ? null : <PlanChip plan={r.c.plan} />),
              },
              {
                label: A('Código'),
                cell: (r) =>
                  r.kind === 'pack' ? (
                    <Cell mono main={r.c.licenseCode ?? '—'} sub={A('Licença do pack')} />
                  ) : r.kind === 'member' ? (
                    r.u.code && r.u.code !== r.c.licenseCode ? (
                      <Cell mono main={r.u.code} />
                    ) : null
                  ) : (
                    <Cell mono main={r.u?.code ?? r.c.licenseCode ?? '—'} sub={A('Individual')} />
                  ),
              },
              { label: A('Faturação'), cell: (r) => (r.kind === 'member' ? null : <BillCell c={r.c} />) },
              {
                label: A('Atividade'),
                cell: (r) =>
                  r.kind === 'pack' ? (
                    <Cell main={fmtDate(r.c.since)} sub={A('Cliente desde')} />
                  ) : r.u ? (
                    userAct(r.u)
                  ) : (
                    <Cell main="—" />
                  ),
              },
              {
                label: A('Estado'),
                cell: (r) =>
                  r.kind === 'pack' ? (
                    <StatusChip map={CLIENT_ST} value={r.c.status} />
                  ) : r.kind === 'member' ? (
                    <StatusChip map={USER_ST} value={r.u.status} />
                  ) : (
                    <StatusChip
                      map={r.c.status === 'active' && r.u ? USER_ST : CLIENT_ST}
                      value={r.c.status === 'active' && r.u ? r.u.status : r.c.status}
                    />
                  ),
              },
            ]}
          />
        )}
      </div>
    </>
  );
}

// ── Novo cliente ────────────────────────────────────────────────────────────

function NewClient({ plans, seats, onDone }: { plans: Plan[]; seats: number; onDone: () => void }) {
  const { A } = useA();
  const { drawer } = useConsole();
  const toast = useToast();
  const [v, setV] = useState({
    name: '',
    contactName: '',
    contactEmail: '',
    plan: 'PRO',
    cycle: 'monthly',
    seats: String(seats),
    start: 'trial',
  });
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setV((x) => ({ ...x, [k]: e.target.value }));
  const ok = v.name.trim() && /\S+@\S+\.\S+/.test(v.contactEmail);
  const submit = async () => {
    if (!ok) return;
    setBusy(true);
    try {
      const r = await adminApi<{ id: string; code: string }>('/clients', {
        ...v,
        name: v.name.trim(),
        contactName: v.contactName.trim(),
        contactEmail: v.contactEmail.trim(),
        seats: Math.max(1, Math.min(10000, Number(v.seats) || 1)),
      });
      onDone();
      drawer(<CodeDone code={r.code} />);
    } catch {
      toast({ message: A('Não foi possível criar o cliente.'), tone: 'error' });
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <DrawerHead
        title={A('Novo cliente')}
        sub={A('Cria a conta e um código de licença para o admin do cliente.')}
        onClose={() => drawer(null)}
      />
      <Field label={A('Nome da empresa (ou da pessoa)')}>
        <input className="kh-ad-input" value={v.name} maxLength={120} onChange={set('name')} />
      </Field>
      <Field label={A('Admin do cliente')}>
        <input className="kh-ad-input" value={v.contactName} maxLength={120} onChange={set('contactName')} />
      </Field>
      <Field label={A('Email do admin')}>
        <input
          className="kh-ad-input"
          type="email"
          value={v.contactEmail}
          maxLength={254}
          onChange={set('contactEmail')}
        />
      </Field>
      <Field label={A('Pacote')}>
        <select className="kh-ad-input" value={v.plan} onChange={set('plan')}>
          {plans
            .filter((p) => p.code !== 'CUSTOM')
            .map((p) => (
              <option key={p.id} value={p.code}>
                {p.code}
              </option>
            ))}
        </select>
      </Field>
      <Field label={A('Ciclo de faturação')}>
        <select className="kh-ad-input" value={v.cycle} onChange={set('cycle')}>
          <option value="monthly">{A('Mensal')}</option>
          <option value="annual">{A('Anual (com desconto)')}</option>
        </select>
      </Field>
      <Field label={A('Lugares')}>
        <input
          className="kh-ad-input"
          type="number"
          min={1}
          max={10000}
          value={v.seats}
          onChange={set('seats')}
        />
      </Field>
      <Field label={A('Início')}>
        <select className="kh-ad-input" value={v.start} onChange={set('start')}>
          <option value="trial">{A('Trial do pacote')}</option>
          <option value="active">{A('Ativo já (pago)')}</option>
        </select>
      </Field>
      <div className="kh-ad-drawer__foot">
        <button
          type="button"
          className="kh-ad-btn"
          data-kind="p"
          disabled={!ok || busy}
          onClick={() => void submit()}
        >
          {A('Criar e gerar licença')}
        </button>
        <button type="button" className="kh-ad-btn" onClick={() => drawer(null)}>
          {A('Cancelar')}
        </button>
      </div>
    </>
  );
}

// ── Subscrição (client page, and an individual's user page) ─────────────────

function Subscription({
  c,
  plans,
  prices,
  onSaved,
  individual,
}: {
  c: Client;
  plans: Plan[];
  prices: Prices;
  onSaved: () => void;
  individual?: boolean;
}) {
  const { A } = useA();
  const { can } = useConsole();
  const toast = useToast();
  const w = can('clients', true);
  const [v, setV] = useState({
    name: c.name,
    contactName: c.contactName,
    contactEmail: c.contactEmail,
    seats: String(c.seats),
  });
  const save = async (patch: Record<string, unknown>) => {
    try {
      await adminApi(`/clients/${c.id}`, patch, 'PATCH');
      onSaved();
    } catch (e) {
      toast({
        message:
          isApiFailure(e) && e.code === 'invalid_input'
            ? A('Valor inválido.')
            : A('Não foi possível guardar.'),
        tone: 'error',
      });
    }
  };
  const custom = c.plan?.code === 'CUSTOM';
  const groups = c.addonGroups.length ? c.addonGroups : ['base'];
  const perUser = GROUPS.filter(([g]) => groups.includes(g) || g === 'base').reduce(
    (s, [g]) => s + (Number(prices.addon[g]) || 0),
    0,
  );
  return (
    <div
      className="kh-ad-card"
      style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14 }}
    >
      {!individual && (
        <Field label={A('Nome')}>
          <input
            className="kh-ad-input"
            disabled={!w}
            value={v.name}
            maxLength={120}
            onChange={(e) => setV({ ...v, name: e.target.value })}
            onBlur={() => v.name.trim() && v.name !== c.name && void save({ name: v.name.trim() })}
          />
        </Field>
      )}
      <Field label={A('Pacote')}>
        <select
          className="kh-ad-input"
          disabled={!w}
          value={c.plan?.code ?? ''}
          onChange={(e) => void save({ plan: e.target.value })}
        >
          {plans.map((p) => (
            <option key={p.id} value={p.code}>
              {p.code === 'CUSTOM'
                ? A('Pacote individual (por grupos)')
                : p.price > 0
                  ? `${p.code} · ${p.price} €/${A('utilizador')}`
                  : `${p.code} · ${A('grátis')}`}
            </option>
          ))}
        </select>
      </Field>
      {custom && (
        <div style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span className="kh-ad-field">{A('Grupos de módulos')}</span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {GROUPS.map(([g, l]) => {
              const on = g === 'base' || groups.includes(g);
              return (
                <button
                  key={g}
                  type="button"
                  className="kh-ad-chip"
                  aria-pressed={on}
                  disabled={!w || g === 'base'}
                  onClick={() =>
                    void save({ addonGroups: on ? groups.filter((x) => x !== g) : [...groups, g] })
                  }
                >
                  {A(l)} · {Number(prices.addon[g]) || 0} €
                </button>
              );
            })}
          </div>
          <span className="kh-ad-note">
            {A('Total')}: {perUser} € {A('por utilizador/mês')}
          </span>
        </div>
      )}
      <Field label={A('Ciclo de faturação')}>
        <select
          className="kh-ad-input"
          disabled={!w}
          value={c.cycle}
          onChange={(e) => void save({ cycle: e.target.value })}
        >
          <option value="monthly">{A('Mensal')}</option>
          <option value="annual">{A('Anual (com desconto)')}</option>
        </select>
      </Field>
      {!individual && (
        <Field label={`${A('Lugares')} · ${c.used} ${A('em uso')}`}>
          <input
            className="kh-ad-input"
            type="number"
            min={1}
            disabled={!w}
            value={v.seats}
            onChange={(e) => setV({ ...v, seats: e.target.value })}
            onBlur={() => {
              const n = Math.max(1, Math.min(10000, Number(v.seats) || 1));
              if (n !== c.seats) void save({ seats: n });
            }}
          />
        </Field>
      )}
      <Field label={A('Próxima renovação')}>
        <input
          className="kh-ad-input"
          type="date"
          disabled={!w}
          value={c.renewAt?.slice(0, 10) ?? ''}
          onChange={(e) => void save({ renewAt: e.target.value || null })}
        />
      </Field>
      <Field label={A('Estado')}>
        <select
          className="kh-ad-input"
          disabled={!w}
          value={c.status}
          onChange={(e) => void save({ status: e.target.value })}
        >
          {Object.entries(CLIENT_ST).map(([k, [l]]) => (
            <option key={k} value={k}>
              {A(l)}
            </option>
          ))}
        </select>
      </Field>
      {!individual && (
        <>
          <Field label={A('Admin do cliente')}>
            <input
              className="kh-ad-input"
              disabled={!w}
              value={v.contactName}
              maxLength={120}
              onChange={(e) => setV({ ...v, contactName: e.target.value })}
              onBlur={() =>
                v.contactName !== c.contactName && void save({ contactName: v.contactName.trim() })
              }
            />
          </Field>
          <Field label={A('Email do admin')}>
            <input
              className="kh-ad-input"
              type="email"
              disabled={!w}
              value={v.contactEmail}
              maxLength={254}
              onChange={(e) => setV({ ...v, contactEmail: e.target.value })}
              onBlur={() =>
                v.contactEmail !== c.contactEmail && void save({ contactEmail: v.contactEmail.trim() })
              }
            />
          </Field>
        </>
      )}
    </div>
  );
}

function DangerZone({
  title,
  text,
  button,
  onClick,
}: {
  title: string;
  text: string;
  button: string;
  onClick: () => void;
}) {
  return (
    <div
      className="kh-ad-card"
      style={{
        borderColor: 'rgba(255,170,150,.28)',
        background: 'oklch(0.6 0.12 30 / .08)',
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        flexWrap: 'wrap',
      }}
    >
      <div style={{ flex: '1 1 260px' }}>
        <div style={{ fontSize: 15, fontWeight: 600 }}>{title}</div>
        <div className="kh-ad-note">{text}</div>
      </div>
      <button type="button" className="kh-ad-btn" data-kind="d" onClick={onClick}>
        {button}
      </button>
    </div>
  );
}

type AuditRow = {
  id: number;
  at: string;
  actor: { name: string; email: string } | null;
  action: string;
  details: Record<string, unknown> | null;
};
function Activity({ query }: { query: string }) {
  const { lang } = useA();
  const [rows, setRows] = useState<AuditRow[] | null>(null);
  useEffect(() => {
    adminApi<{ rows: AuditRow[] }>(`/audit?period=range&from=2000-01-01&${query}&lang=${lang}`)
      .then((r) => setRows(r.rows))
      .catch(() => setRows([]));
  }, [query, lang]);
  return <ActivityTable rows={rows} />;
}
function ActivityTable({ rows }: { rows: AuditRow[] | null }) {
  const { A, lang } = useA();
  if (!rows) return null;
  return (
    <Table<AuditRow>
      label={A('Atividade')}
      grid="140px minmax(180px,1.2fr) minmax(180px,1.2fr) minmax(200px,2fr)"
      minW={760}
      rows={rows}
      rowKey={(r) => String(r.id)}
      cols={[
        { label: A('Quando'), cell: (r) => <Cell mono main={fmtStamp(r.at)} /> },
        { label: A('Quem'), cell: (r) => <Cell main={r.actor?.name || A('Sistema')} sub={r.actor?.email} /> },
        { label: A('Ação'), cell: (r) => <Cell main={actionLabel(r.action, lang)} /> },
        {
          label: A('Detalhe'),
          cell: (r) => (
            <Cell
              main={
                <span style={{ fontWeight: 400 }}>
                  {Object.entries(r.details ?? {})
                    .filter(([, x]) => x !== null && typeof x !== 'object')
                    .map(([k, x]) => (k === 'name' || k === 'email' ? String(x) : `${k} ${String(x)}`))
                    .join(' · ') || '—'}
                </span>
              }
            />
          ),
        },
      ]}
    />
  );
}

// ── Client page ─────────────────────────────────────────────────────────────

type ClientData = { client: Client; plans: Plan[]; prices: Prices; users: CUser[]; codes: CodeRow[] };

export function ClientPage({ id, mode }: { id: string; mode: 'packs' | 'inds' }) {
  const { A } = useA();
  const { go, can, drawer } = useConsole();
  const toast = useToast();
  const confirm = useConfirm();
  const rel = useRel();
  const [d, setD] = useState<ClientData | null>(null);
  const [tab, setTab] = useState<'sub' | 'users' | 'codes' | 'activity'>('sub');
  const load = useCallback(() => {
    adminApi<ClientData>(`/clients/${id}`)
      .then(setD)
      .catch(() => go(mode));
  }, [id, go, mode]);
  useEffect(load, [load]);
  if (!d) return <SectionHead title="…" />;
  const c = d.client;
  const w = can('clients', true);
  const uw = can('users', true);
  const suspended = c.status === 'suspended';
  const userStatus = async (u: CUser, status: 'active' | 'disabled') => {
    try {
      await adminApi(`/users/${u.id}`, { status }, 'PATCH');
      load();
    } catch {
      toast({ message: A('Não foi possível concluir a ação.'), tone: 'error' });
    }
  };
  return (
    <>
      <SectionHead
        title={c.name}
        sub={`${isInd(c) ? A('Cliente individual') : A('Empresa')} · ${A('cliente desde')} ${fmtDate(c.since)}`}
        back={{ label: mode === 'packs' ? 'Packs' : A('Individuais'), onClick: () => go(mode) }}
      >
        {w && !suspended && c.used < c.seats && (
          <button
            type="button"
            className="kh-ad-btn"
            data-kind="p"
            style={{ marginLeft: 'auto' }}
            onClick={async () => {
              try {
                const r = await adminApi<{ code: string }>(`/clients/${id}/invite`, {});
                load();
                drawer(<CodeDone code={r.code} />);
              } catch {
                toast({ message: A('Não foi possível gerar o código.'), tone: 'error' });
              }
            }}
          >
            {A('+ Convidar utilizador')}
          </button>
        )}
      </SectionHead>
      <div className="kh-ad-body">
        <div
          className="kh-ad-card"
          style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}
        >
          <span
            className="kh-ad-av"
            style={{ width: 52, height: 52, borderRadius: 16, fontSize: 17, background: 'var(--accent)' }}
          >
            {c.name.slice(0, 2).toUpperCase()}
          </span>
          <div style={{ flex: '1 1 260px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ fontSize: 22, fontWeight: 600 }}>{c.name}</div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', fontSize: 12.5 }}>
              <PlanChip plan={c.plan} />
              <StatusChip map={CLIENT_ST} value={c.status} />
              <span className="kh-ad-td__sub">
                {c.contactName && `· admin ${c.contactName}`} {c.contactEmail && `· ${c.contactEmail}`}
              </span>
            </div>
          </div>
          {[
            [A('Valor'), c.value ? `${eur(c.value)}/${A('mês')}` : '—'],
            [A('Lugares'), `${c.used} / ${c.seats}`],
            [
              c.status === 'trial' ? A('Termina') : A('Renova'),
              fmtDate(c.status === 'trial' ? (c.trialEndsAt ?? c.renewAt) : c.renewAt),
            ],
          ].map(([l, v]) => (
            <div key={l} style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 110 }}>
              <span className="kh-ad-td__sub">{l}</span>
              <span className="kh-ad-mono" style={{ fontSize: 17, fontWeight: 600 }}>
                {v}
              </span>
            </div>
          ))}
        </div>
        <Chips
          label={A('Separadores')}
          value={tab}
          onChange={setTab}
          options={[
            { v: 'sub', l: A('Subscrição') },
            { v: 'users', l: A('Utilizadores'), n: d.users.length },
            { v: 'codes', l: A('Códigos'), n: d.codes.length },
            ...(can('audit') ? [{ v: 'activity' as const, l: A('Atividade') }] : []),
          ]}
        />
        {tab === 'sub' && (
          <>
            <Subscription key={JSON.stringify(c)} c={c} plans={d.plans} prices={d.prices} onSaved={load} />
            {w && (
              <DangerZone
                title={A('Zona de risco')}
                text={A(
                  'Suspender deixa todos os utilizadores deste cliente só em leitura até ser reativado.',
                )}
                button={suspended ? A('Reativar cliente') : A('Suspender cliente')}
                onClick={async () => {
                  if (!suspended) {
                    const ok = await confirm({
                      title: A(`Suspender ${c.name}?`),
                      body: A(`Os ${c.used} utilizadores passam a só leitura até ser reativado.`),
                      confirmLabel: A('Suspender'),
                      cancelLabel: A('Cancelar'),
                      danger: true,
                    });
                    if (!ok) return;
                  }
                  try {
                    await adminApi(`/clients/${id}`, { status: suspended ? 'active' : 'suspended' }, 'PATCH');
                    load();
                  } catch {
                    toast({ message: A('Não foi possível concluir a ação.'), tone: 'error' });
                  }
                }}
              />
            )}
          </>
        )}
        {tab === 'users' && (
          <Table<CUser>
            label={A('Utilizadores')}
            grid="minmax(240px,2fr) 130px 130px 120px 140px"
            minW={800}
            rows={d.users}
            rowKey={(u) => u.id}
            onRow={(u) => go(mode, { c: id, u: u.id })}
            cols={[
              { label: A('Utilizador'), cell: (u) => <Cell main={u.name} sub={u.email} /> },
              {
                label: A('Papel'),
                cell: (u) => <Cell main={u.role === 'admin' ? A('Admin cliente') : A('Membro')} />,
              },
              {
                label: A('Último acesso'),
                cell: (u) => <Cell main={u.status === 'invited' ? '—' : rel(u.lastSeenAt)} />,
              },
              { label: A('Estado'), cell: (u) => <StatusChip map={USER_ST} value={u.status} /> },
              {
                label: '',
                cell: (u) =>
                  uw ? (
                    <button
                      type="button"
                      className="kh-ad-btn kh-ad-btn--sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        void userStatus(u, u.status === 'disabled' ? 'active' : 'disabled');
                      }}
                    >
                      {u.status === 'disabled' ? A('Reativar') : A('Desativar')}
                    </button>
                  ) : null,
              },
            ]}
          />
        )}
        {tab === 'codes' && (
          <Table<CodeRow>
            label={A('Códigos')}
            grid="190px 110px minmax(160px,1fr) 130px 120px"
            minW={720}
            rows={d.codes}
            rowKey={(r) => r.id}
            onRow={(r) => drawer(<CodeDetail key={r.code} row={r} onChanged={load} />)}
            cols={[
              { label: A('Código'), cell: (r) => <Cell mono main={r.code} /> },
              { label: A('Tipo'), cell: (r) => <StatusChip map={CODE_TY} value={r.type} /> },
              {
                label: A('Utilizações'),
                cell: (r) => <Bar value={r.uses} max={r.maxUses} label={`${r.uses} / ${r.maxUses}`} />,
              },
              {
                label: A('Validade'),
                cell: (r) => <Cell main={r.expiresAt ? fmtDate(r.expiresAt) : A('Vitalício')} />,
              },
              { label: A('Estado'), cell: (r) => <StatusChip map={CODE_ST} value={r.status} /> },
            ]}
          />
        )}
        {tab === 'activity' && <Activity query={`tenant=${id}`} />}
      </div>
    </>
  );
}

// ── User page ───────────────────────────────────────────────────────────────

/** Ficheiros: quota and largest file for this person (empty = the defaults). */
function FileLimits({ u, onSaved }: { u: CUser; onSaved: () => void }) {
  const { A } = useA();
  const { can } = useConsole();
  const toast = useToast();
  const w = can('clients', true);
  const [q, setQ] = useState(u.filesQuotaMb?.toString() ?? '');
  const [m, setM] = useState(u.filesMaxMb?.toString() ?? '');
  const num = (s: string) => (s.trim() ? Math.round(Number(s)) : null);
  const save = async () => {
    const filesQuotaMb = num(q);
    const filesMaxMb = num(m);
    if (filesQuotaMb === u.filesQuotaMb && filesMaxMb === u.filesMaxMb) return;
    const bad = (n: number | null, cap: number) => n !== null && !(Number.isFinite(n) && n >= 1 && n <= cap);
    if (bad(filesQuotaMb, FILES_QUOTA_MB_CAP) || bad(filesMaxMb, FILES_MAX_MB_CAP)) {
      toast({ message: A('Valor inválido.'), tone: 'error' });
      return;
    }
    try {
      await adminApi(`/users/${u.id}/files`, { filesQuotaMb, filesMaxMb }, 'PATCH');
      toast({ message: A('Limites de ficheiros guardados.'), tone: 'success' });
      onSaved();
    } catch {
      toast({ message: A('Não foi possível concluir a ação.'), tone: 'error' });
    }
  };
  const quota = (u.filesQuotaMb ?? FILES_QUOTA_MB) * 1024 * 1024;
  return (
    <div className="kh-ad-card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>{A('Ficheiros')}</h3>
        <span className="kh-ad-td__sub">
          {A('Vazio = valor base')} ({fmtBytes(FILES_QUOTA_MB * 1024 * 1024)} · {FILES_MAX_MB} MB{' '}
          {A('por ficheiro')})
        </span>
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 14,
          alignItems: 'end',
        }}
      >
        <Field label={A('Espaço (MB)')}>
          <input
            className="kh-ad-input"
            type="number"
            min={1}
            max={FILES_QUOTA_MB_CAP}
            disabled={!w}
            value={q}
            placeholder={String(FILES_QUOTA_MB)}
            onChange={(e) => setQ(e.target.value)}
            onBlur={() => void save()}
          />
        </Field>
        <Field label={A('Tamanho máximo por ficheiro (MB)')}>
          <input
            className="kh-ad-input"
            type="number"
            min={1}
            max={FILES_MAX_MB_CAP}
            disabled={!w}
            value={m}
            placeholder={String(FILES_MAX_MB)}
            onChange={(e) => setM(e.target.value)}
            onBlur={() => void save()}
          />
        </Field>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <Bar
            value={u.filesUsed}
            max={quota}
            label={`${A('Em uso')}: ${fmtBytes(u.filesUsed)} / ${fmtBytes(quota)}`}
          />
        </div>
      </div>
    </div>
  );
}

export function UserPage({
  clientId,
  userId,
  mode,
}: {
  clientId: string;
  userId: string;
  mode: 'packs' | 'inds';
}) {
  const { A } = useA();
  const { go, can } = useConsole();
  const toast = useToast();
  const confirm = useConfirm();
  const rel = useRel();
  const [d, setD] = useState<ClientData | null>(null);
  const [tab, setTab] = useState<'account' | 'activity'>('account');
  const [v, setV] = useState<{ name: string; email: string } | null>(null);
  const load = useCallback(() => {
    adminApi<ClientData>(`/clients/${clientId}`)
      .then((x) => {
        setD(x);
        const u = x.users.find((y) => y.id === userId);
        if (!u) go(mode, { c: clientId });
        else setV({ name: u.name, email: u.email });
      })
      .catch(() => go(mode));
  }, [clientId, userId, go, mode]);
  useEffect(load, [load]);
  const u = d?.users.find((x) => x.id === userId);
  if (!d || !u || !v) return <SectionHead title="…" />;
  const c = d.client;
  const ind = isInd(c);
  const uw = can('users', true);
  const run = async (fn: () => Promise<unknown>, ok?: string) => {
    try {
      await fn();
      if (ok) toast({ message: A(ok), tone: 'success' });
      load();
    } catch (e) {
      toast({
        message:
          isApiFailure(e) && e.code === 'email_taken'
            ? A('Esse email já tem conta.')
            : A('Não foi possível concluir a ação.'),
        tone: 'error',
      });
    }
  };
  const patch = (p: Record<string, unknown>) => run(() => adminApi(`/users/${userId}`, p, 'PATCH'));
  return (
    <>
      <SectionHead
        title={u.name}
        sub={ind ? A('Utilizador individual') : `${A('Membro de')} ${c.name}`}
        back={
          ind
            ? { label: A('Individuais'), onClick: () => go('inds') }
            : { label: c.name, onClick: () => go(mode, { c: clientId }) }
        }
      >
        {uw && (
          <div style={{ display: 'flex', gap: 8, marginLeft: 'auto', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="kh-ad-btn"
              onClick={() =>
                void run(() => adminApi(`/users/${userId}/reset`, {}), 'Email de reposição enviado.')
              }
            >
              {A('Repor password')}
            </button>
            {!u.verified ? (
              <button
                type="button"
                className="kh-ad-btn"
                onClick={() => void run(() => adminApi(`/users/${userId}/resend`, {}), 'Convite reenviado.')}
              >
                {A('Reenviar convite')}
              </button>
            ) : (
              <button
                type="button"
                className="kh-ad-btn"
                onClick={() => void patch({ status: u.status === 'disabled' ? 'active' : 'disabled' })}
              >
                {u.status === 'disabled' ? A('Reativar') : A('Desativar')}
              </button>
            )}
          </div>
        )}
      </SectionHead>
      <div className="kh-ad-body">
        <div
          className="kh-ad-card"
          style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}
        >
          <Avatar name={u.name} />
          <div style={{ flex: '1 1 240px', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <PlanChip plan={c.plan} />
            <StatusChip map={USER_ST} value={u.status} />
            <span className="kh-ad-td__sub">· {u.email}</span>
          </div>
          {[
            [A('Código'), u.code ?? '—'],
            [A('Último acesso'), rel(u.lastSeenAt)],
            [A('Registo'), fmtDate(u.createdAt)],
            ...(ind ? [[A('Renova'), fmtDate(c.renewAt)]] : []),
          ].map(([l, x]) => (
            <div key={l} style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 110 }}>
              <span className="kh-ad-td__sub">{l}</span>
              <span className="kh-ad-mono" style={{ fontSize: 14.5, fontWeight: 600 }}>
                {x}
              </span>
            </div>
          ))}
        </div>
        <Chips
          label={A('Separadores')}
          value={tab}
          onChange={setTab}
          options={[
            { v: 'account', l: A('Conta') },
            ...(can('audit') ? [{ v: 'activity' as const, l: A('Atividade') }] : []),
          ]}
        />
        {tab === 'account' && (
          <>
            <div
              className="kh-ad-card"
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                gap: 14,
              }}
            >
              <Field label={A('Nome')}>
                <input
                  className="kh-ad-input"
                  disabled={!uw}
                  value={v.name}
                  maxLength={120}
                  onChange={(e) => setV({ ...v, name: e.target.value })}
                  onBlur={() => v.name.trim() && v.name !== u.name && void patch({ name: v.name.trim() })}
                />
              </Field>
              <Field label={A('Email')}>
                <input
                  className="kh-ad-input"
                  type="email"
                  disabled={!uw}
                  value={v.email}
                  maxLength={254}
                  onChange={(e) => setV({ ...v, email: e.target.value })}
                  onBlur={() =>
                    /\S+@\S+\.\S+/.test(v.email) &&
                    v.email !== u.email &&
                    void patch({ email: v.email.trim() })
                  }
                />
              </Field>
              {!ind && (
                <Field label={A('Papel no pack')}>
                  <select
                    className="kh-ad-input"
                    disabled={!uw}
                    value={u.role}
                    onChange={(e) => void patch({ role: e.target.value })}
                  >
                    <option value="admin">{A('Admin do cliente')}</option>
                    <option value="member">{A('Membro')}</option>
                  </select>
                </Field>
              )}
              <Field label={A('Estado')}>
                <select
                  className="kh-ad-input"
                  disabled={!uw || u.status === 'invited'}
                  value={u.status}
                  onChange={(e) => void patch({ status: e.target.value })}
                >
                  {Object.entries(USER_ST)
                    .filter(([k]) => k !== 'invited' || u.status === 'invited')
                    .map(([k, [l]]) => (
                      <option key={k} value={k}>
                        {A(l)}
                      </option>
                    ))}
                </select>
              </Field>
            </div>
            <FileLimits u={u} onSaved={load} />
            {ind && (
              <Subscription
                key={JSON.stringify(c)}
                c={c}
                plans={d.plans}
                prices={d.prices}
                onSaved={load}
                individual
              />
            )}
            {can('clients', true) && (
              <DangerZone
                title={A('Eliminar utilizador')}
                text={A('Remove a conta e todos os dados deste utilizador. Não pode ser desfeito.')}
                button={A('Eliminar utilizador')}
                onClick={async () => {
                  const ok = await confirm({
                    title: A(`Eliminar ${u.name} e todos os seus dados?`),
                    body: A('Não pode ser desfeito.'),
                    confirmLabel: A('Eliminar'),
                    cancelLabel: A('Cancelar'),
                    danger: true,
                  });
                  if (!ok) return;
                  try {
                    await adminApi(`/users/${userId}`, undefined, 'DELETE');
                    go(ind ? 'inds' : mode, ind ? {} : { c: clientId });
                  } catch {
                    toast({ message: A('Não foi possível concluir a ação.'), tone: 'error' });
                  }
                }}
              />
            )}
          </>
        )}
        {tab === 'activity' && <Activity query={`q=${encodeURIComponent(u.email)}`} />}
      </div>
    </>
  );
}
