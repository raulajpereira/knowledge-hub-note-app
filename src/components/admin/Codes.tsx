'use client';

import { useCallback, useEffect, useState } from 'react';
import { adminApi } from '@/lib/client/api';
import { useConfirm, useToast } from '@/components/ui';
import { SEC_TITLE, SectionHead, useConsole } from './AdminShell';
import {
  Bar,
  CODE_ST,
  CODE_TY,
  Cell,
  Chips,
  DrawerHead,
  Field,
  PlanChip,
  StatusChip,
  Table,
  daysTo,
  fmtDate,
  useA,
} from './ui';

export type CodeRow = {
  id: string;
  code: string;
  type: 'invite' | 'license';
  status: 'active' | 'paused' | 'revoked' | 'expired';
  plan: { code: string; color: string | null } | null;
  maxUses: number;
  uses: number;
  expiresAt: string | null;
  revokedAt: string | null;
  restoreUntil: string | null;
  createdAt: string;
  holder:
    | { kind: 'pack' | 'individual'; tenantId: string; name: string; seats: number }
    | { kind: 'user'; tenantId: string; name: string; email: string }
    | null;
};
type Client = { id: string; name: string; kind: 'pack' | 'individual'; seats: number };
type Plan = { id: string; code: string; color: string | null };

type F1 = 'all' | 'invite' | 'license' | 'active' | 'paused' | 'revoked';
type F2 = '' | 'ind' | 'pack';

const isPack = (r: CodeRow) => r.holder?.kind === 'pack';

/** Códigos (prototype `codes`; revoked codes listed while they can be restored, D45). */
export function Codes() {
  const { A } = useA();
  const { can, drawer } = useConsole();
  const [rows, setRows] = useState<CodeRow[] | null>(null);
  const [q, setQ] = useState('');
  const [f, setF] = useState<F1>('all');
  const [f2, setF2] = useState<F2>('');
  const [copied, setCopied] = useState<string | null>(null);
  const load = useCallback(() => {
    adminApi<{ codes: CodeRow[] }>('/codes')
      .then((r) => setRows(r.codes))
      .catch(() => setRows([]));
  }, []);
  useEffect(load, [load]);

  const s = q.trim().toLowerCase();
  const list = (rows ?? []).filter(
    (r) =>
      (f === 'all'
        ? r.status !== 'revoked'
        : f === 'invite' || f === 'license'
          ? r.type === f && r.status !== 'revoked'
          : r.status === f) &&
      (!f2 || (f2 === 'pack' ? isPack(r) : !isPack(r))) &&
      (!s || r.code.toLowerCase().includes(s) || (r.holder?.name ?? '').toLowerCase().includes(s)),
  );
  const copy = (code: string) => {
    void navigator.clipboard?.writeText(code).catch(() => {});
    setCopied(code);
    setTimeout(() => setCopied((c) => (c === code ? null : c)), 1400);
  };
  const openDetail = (r: CodeRow) => drawer(<CodeDetail key={r.code} row={r} onChanged={load} />);

  return (
    <>
      <SectionHead title={A(SEC_TITLE.codes[0])} sub={A(SEC_TITLE.codes[1])}>
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
            { v: 'invite', l: A('Convite') },
            { v: 'license', l: A('Licença') },
            { v: 'active', l: A('Ativos') },
            { v: 'paused', l: A('Pausados') },
            { v: 'revoked', l: A('Revogados') },
          ]}
        />
        <Chips
          label={A('Titular')}
          value={f2}
          onChange={setF2}
          options={[
            { v: '', l: A('Todos os titulares') },
            { v: 'ind', l: A('Individuais') },
            { v: 'pack', l: A('Packs') },
          ]}
        />
        {can('codes', true) && (
          <button
            type="button"
            className="kh-ad-btn"
            data-kind="p"
            style={{ marginLeft: 'auto' }}
            onClick={() => drawer(<NewCode onDone={load} />)}
          >
            {A('+ Gerar código')}
          </button>
        )}
      </SectionHead>
      <div className="kh-ad-body">
        {rows && (
          <Table<CodeRow>
            label={A('Códigos')}
            grid="210px minmax(220px,2fr) 130px minmax(170px,1.1fr) 130px 120px"
            minW={960}
            rows={list}
            rowKey={(r) => r.id}
            onRow={openDetail}
            cols={[
              {
                label: A('Código'),
                cell: (r) => (
                  <Cell
                    mono
                    main={
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          copy(r.code);
                        }}
                        title={A('Copiar')}
                        style={{ all: 'unset', cursor: 'copy' }}
                      >
                        {r.code}
                      </button>
                    }
                    sub={
                      copied === r.code
                        ? A('Copiado ✓')
                        : `${A(CODE_TY[r.type]![0])} · ${A('clique para copiar')}`
                    }
                  />
                ),
              },
              {
                label: A('Titular'),
                cell: (r) =>
                  !r.holder ? (
                    <Cell
                      main={<span style={{ opacity: 0.6 }}>{A('Por associar')}</span>}
                      sub={A('Individual · associado no registo')}
                    />
                  ) : r.holder.kind === 'user' ? (
                    <Cell main={r.holder.name} sub={`${A('Individual')} · ${r.holder.email}`} />
                  ) : (
                    <Cell
                      main={r.holder.name}
                      sub={
                        r.holder.kind === 'individual'
                          ? A('Individual')
                          : `Pack · ${r.holder.seats} ${A('lugares')}`
                      }
                    />
                  ),
              },
              { label: A('Pacote'), cell: (r) => <PlanChip plan={r.plan} /> },
              {
                label: A('Utilização'),
                cell: (r) => (
                  <Bar
                    value={r.uses}
                    max={r.maxUses}
                    label={`${r.uses} / ${r.maxUses} ${A(r.maxUses === 1 ? 'utilizador' : 'utilizadores')}`}
                  />
                ),
              },
              {
                label: A('Validade'),
                cell: (r) =>
                  r.status === 'revoked' ? (
                    <Cell main={fmtDate(r.restoreUntil)} sub={A('restaurável até')} />
                  ) : !r.expiresAt ? (
                    <Cell main={<span style={{ color: 'oklch(0.86 0.13 150)' }}>{A('Vitalício')}</span>} />
                  ) : r.status === 'expired' ? (
                    <Cell
                      main={<span style={{ color: 'oklch(0.84 0.13 60)' }}>{fmtDate(r.expiresAt)}</span>}
                      sub={A('expirado')}
                    />
                  ) : (
                    <Cell main={fmtDate(r.expiresAt)} sub={A(`${daysTo(r.expiresAt)} dias`)} />
                  ),
              },
              { label: A('Estado'), cell: (r) => <StatusChip map={CODE_ST} value={r.status} /> },
            ]}
          />
        )}
        <div className="kh-ad-note">
          {A(
            'Individual: o código fica associado a quem se registar com ele. Convite: junta pessoas a um cliente existente ou cria um utilizador individual. Licença: cria a subscrição do cliente ou utilizador ao ser usado. Pausar retira o acesso mas mantém os dados; Revogar corta o acesso e apaga os dados ao fim de 30 dias (pode restaurar até lá).',
          )}
        </div>
      </div>
    </>
  );
}

function CodeBox({ code }: { code: string }) {
  const { A } = useA();
  const [done, setDone] = useState(false);
  return (
    <div className="kh-ad-codebox">
      <span>{code}</span>
      <button
        type="button"
        className="kh-ad-btn kh-ad-btn--sm"
        data-kind="p"
        onClick={() => {
          void navigator.clipboard?.writeText(code).catch(() => {});
          setDone(true);
          setTimeout(() => setDone(false), 1400);
        }}
      >
        {done ? A('Copiado ✓') : A('Copiar')}
      </button>
    </div>
  );
}

/** "Código gerado": the new code to send to the client. */
export function CodeDone({ code }: { code: string }) {
  const { A } = useA();
  const { drawer } = useConsole();
  return (
    <>
      <DrawerHead
        title={A('Código gerado')}
        sub={A('Envie este código ao cliente. Também aparece na lista de Códigos.')}
        onClose={() => drawer(null)}
      />
      <CodeBox code={code} />
      <div className="kh-ad-drawer__foot">
        <button type="button" className="kh-ad-btn" data-kind="p" onClick={() => drawer(null)}>
          {A('Concluir')}
        </button>
      </div>
    </>
  );
}

/** "Gerar código": type, holder (a pack or whoever registers), plan, number of users, validity. */
function NewCode({ onDone }: { onDone: () => void }) {
  const { A } = useA();
  const { drawer } = useConsole();
  const toast = useToast();
  const [opts, setOpts] = useState<{ clients: Client[]; plans: Plan[] } | null>(null);
  const [v, setV] = useState({
    type: 'invite' as 'invite' | 'license',
    tenantId: '',
    plan: 'PRO',
    maxUses: '1',
    life: 'days' as 'days' | 'life',
    days: '30',
  });
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    adminApi<{ clients: Client[]; plans: Plan[] }>('/clients')
      .then(setOpts)
      .catch(() => setOpts({ clients: [], plans: [] }));
  }, []);
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setV((x) => ({ ...x, [k]: e.target.value }));
  const submit = async () => {
    setBusy(true);
    try {
      const r = await adminApi<{ code: string }>('/codes', {
        type: v.type,
        tenantId: v.tenantId || null,
        plan: v.plan,
        maxUses: Math.max(1, Math.min(10000, Number(v.maxUses) || 1)),
        lifetime: v.life === 'life',
        days: Math.max(1, Math.min(3650, Number(v.days) || 30)),
      });
      onDone();
      drawer(<CodeDone code={r.code} />);
    } catch {
      toast({ message: A('Não foi possível gerar o código.'), tone: 'error' });
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <DrawerHead
        title={A('Gerar código')}
        sub={A('Aceite no registo da app.')}
        onClose={() => drawer(null)}
      />
      <Field label={A('Tipo')}>
        <select className="kh-ad-input" value={v.type} onChange={set('type')}>
          <option value="invite">{A('Convite')}</option>
          <option value="license">{A('Licença')}</option>
        </select>
      </Field>
      <Field label={A('Associado a')}>
        <select className="kh-ad-input" value={v.tenantId} onChange={set('tenantId')}>
          <option value="">{A('Individual — associado a quem se registar')}</option>
          {(opts?.clients ?? [])
            .filter((c) => c.kind === 'pack')
            .map((c) => (
              <option key={c.id} value={c.id}>
                Pack · {c.name}
              </option>
            ))}
        </select>
      </Field>
      <Field label={A('Pacote')}>
        <select className="kh-ad-input" value={v.plan} onChange={set('plan')}>
          {(opts?.plans ?? [])
            .filter((p) => p.code !== 'CUSTOM')
            .map((p) => (
              <option key={p.id} value={p.code}>
                {p.code}
              </option>
            ))}
        </select>
      </Field>
      <Field label={A('Número de utilizadores')}>
        <input
          className="kh-ad-input"
          type="number"
          min={1}
          max={10000}
          value={v.maxUses}
          onChange={set('maxUses')}
        />
      </Field>
      <Field label={A('Validade')}>
        <select className="kh-ad-input" value={v.life} onChange={set('life')}>
          <option value="days">{A('Prazo em dias')}</option>
          <option value="life">{A('Vitalício (não expira)')}</option>
        </select>
      </Field>
      {v.life === 'days' && (
        <Field label={A('Válido por (dias)')}>
          <input
            className="kh-ad-input"
            type="number"
            min={1}
            max={3650}
            value={v.days}
            onChange={set('days')}
          />
        </Field>
      )}
      <div className="kh-ad-drawer__foot">
        <button
          type="button"
          className="kh-ad-btn"
          data-kind="p"
          disabled={busy}
          onClick={() => void submit()}
        >
          {A('Gerar')}
        </button>
        <button type="button" className="kh-ad-btn" onClick={() => drawer(null)}>
          {A('Cancelar')}
        </button>
      </div>
    </>
  );
}

type CodeUser = { id: string; name: string; email: string; status: string };

/** Detail of a code: users, number of users, validity; pause, resume, +30 days, revoke, restore. */
export function CodeDetail({ row, onChanged }: { row: CodeRow; onChanged: () => void }) {
  const { A } = useA();
  const { can, drawer } = useConsole();
  const toast = useToast();
  const confirm = useConfirm();
  const w = can('codes', true);
  const [users, setUsers] = useState<CodeUser[]>([]);
  const [r, setR] = useState(row);
  const [v, setV] = useState({
    maxUses: String(row.maxUses),
    life: row.expiresAt ? 'date' : 'life',
    exp: row.expiresAt?.slice(0, 10) ?? '',
  });
  useEffect(() => {
    adminApi<{ users: CodeUser[] }>(`/codes/${row.code}`)
      .then((x) => setUsers(x.users))
      .catch(() => setUsers([]));
  }, [row.code]);
  const refresh = async () => {
    onChanged();
    const all = await adminApi<{ codes: CodeRow[] }>('/codes').catch(() => null);
    const n = all?.codes.find((c) => c.code === row.code);
    if (n) setR(n);
    else drawer(null);
  };
  const run = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn();
      toast({ message: A(ok), tone: 'success' });
      await refresh();
    } catch {
      toast({ message: A('Não foi possível concluir a ação.'), tone: 'error' });
    }
  };
  const op = (o: string) => adminApi(`/codes/${row.code}/${o}`, {});
  const holder = r.holder ? r.holder.name : A('Por associar');
  const active = users.filter((u) => u.status === 'active').length;

  return (
    <>
      <DrawerHead
        title={r.code}
        sub={`${A(CODE_TY[r.type]![0])} · ${holder} · ${r.plan?.code ?? '—'} · ${A(CODE_ST[r.status]![0])}`}
        onClose={() => drawer(null)}
      />
      <CodeBox code={r.code} />
      {r.status !== 'revoked' && (
        <>
          <Field label={A('Número de utilizadores')}>
            <input
              className="kh-ad-input"
              type="number"
              min={Math.max(1, r.uses)}
              disabled={!w}
              value={v.maxUses}
              onChange={(e) => setV({ ...v, maxUses: e.target.value })}
            />
          </Field>
          <Field label={A('Validade')}>
            <select
              className="kh-ad-input"
              disabled={!w}
              value={v.life}
              onChange={(e) => setV({ ...v, life: e.target.value })}
            >
              <option value="date">{A('Até uma data')}</option>
              <option value="life">{A('Vitalício (não expira)')}</option>
            </select>
          </Field>
          {v.life === 'date' && (
            <Field label={A('Válido até')}>
              <input
                className="kh-ad-input"
                type="date"
                disabled={!w}
                value={v.exp}
                onChange={(e) => setV({ ...v, exp: e.target.value })}
              />
            </Field>
          )}
        </>
      )}
      <div>
        <div className="kh-ad-group" style={{ padding: '4px 0 8px' }}>
          {A(`Utilizado por (${users.length} de ${r.maxUses})`)}
        </div>
        <div className="kh-ad-list">
          {users.map((u) => (
            <div key={u.id} className="kh-ad-li">
              <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                <span className="kh-ad-td__main">{u.name}</span>
                <span className="kh-ad-td__sub">{u.email}</span>
              </span>
              <span className="kh-ad-td__sub">
                {A(
                  u.status === 'active'
                    ? 'Ativo'
                    : u.status === 'paused'
                      ? 'Pausado'
                      : u.status === 'disabled'
                        ? 'Desativado'
                        : 'Convidado',
                )}
              </span>
            </div>
          ))}
          {!users.length && (
            <div className="kh-ad-note">{A('Ainda ninguém se registou com este código.')}</div>
          )}
        </div>
      </div>
      {w && (
        <div className="kh-ad-drawer__foot">
          {r.status === 'revoked' ? (
            <button
              type="button"
              className="kh-ad-btn"
              data-kind="p"
              onClick={() => void run(() => op('restore'), 'Código restaurado.')}
            >
              {A('Restaurar')}
            </button>
          ) : (
            <>
              <button
                type="button"
                className="kh-ad-btn"
                data-kind="p"
                onClick={() =>
                  void run(
                    () =>
                      adminApi(
                        `/codes/${row.code}`,
                        {
                          maxUses: Math.max(r.uses, Number(v.maxUses) || 1),
                          expiresAt: v.life === 'life' ? null : v.exp || null,
                        },
                        'PATCH',
                      ),
                    'Guardado.',
                  )
                }
              >
                {A('Guardar')}
              </button>
              {r.expiresAt && (
                <button
                  type="button"
                  className="kh-ad-btn"
                  onClick={() => void run(() => op('extend'), 'Validade estendida.')}
                >
                  {A('+30 dias')}
                </button>
              )}
              {r.status === 'paused' ? (
                <button
                  type="button"
                  className="kh-ad-btn"
                  onClick={() => void run(() => op('resume'), 'Código retomado.')}
                >
                  {A('Retomar')}
                </button>
              ) : (
                <button
                  type="button"
                  className="kh-ad-btn"
                  onClick={async () => {
                    const ok = await confirm({
                      title: A(`Pausar ${r.code}?`),
                      body: A(`Os ${active} utilizadores associados ficam sem acesso; os dados mantêm-se.`),
                      confirmLabel: A('Pausar'),
                      cancelLabel: A('Cancelar'),
                    });
                    if (ok) void run(() => op('pause'), 'Código pausado.');
                  }}
                >
                  {A('Pausar')}
                </button>
              )}
              <button
                type="button"
                className="kh-ad-btn"
                data-kind="d"
                onClick={async () => {
                  const ok = await confirm({
                    title: A(`Revogar ${r.code}?`),
                    body: A(
                      `Os ${users.length} utilizadores associados${r.type === 'license' && r.holder && r.holder.kind !== 'user' ? ` e a licença de ${r.holder.name}` : ''} perdem o acesso já. Os dados ficam guardados 30 dias e pode restaurar até lá; depois são apagados.`,
                    ),
                    confirmLabel: A('Revogar'),
                    cancelLabel: A('Cancelar'),
                    danger: true,
                  });
                  if (ok) void run(() => op('revoke'), 'Código revogado.');
                }}
              >
                {A('Revogar')}
              </button>
            </>
          )}
        </div>
      )}
    </>
  );
}
