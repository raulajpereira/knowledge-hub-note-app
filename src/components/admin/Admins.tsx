'use client';

import { useCallback, useEffect, useState } from 'react';
import { adminApi, isApiFailure } from '@/lib/client/api';
import { useConfirm, useToast } from '@/components/ui';
import { ROLES, SEC_TITLE, SectionHead, useConsole, type AdminRole } from './AdminShell';
import { Avatar, Cell, DrawerHead, Field, Table, fmtDate, useA } from './ui';

type Row = {
  userId: string;
  name: string;
  email: string;
  role: AdminRole;
  status: 'active' | 'paused';
  totp: boolean;
  since: string;
};
const ASSIGNABLE: AdminRole[] = ['admin', 'billing', 'support', 'readonly'];

function RoleChip({ role }: { role: AdminRole }) {
  const { A } = useA();
  return (
    <span className="kh-ad-plan" style={{ background: ROLES[role][2] }}>
      {A(ROLES[role][0])}
    </span>
  );
}

/** Administradores (Manager only): grant console access, change role, pause, remove. */
export function Admins() {
  const { A } = useA();
  const { me, drawer } = useConsole();
  const toast = useToast();
  const confirm = useConfirm();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [q, setQ] = useState('');
  const load = useCallback(() => {
    adminApi<{ admins: Row[] }>('/admins')
      .then((r) => setRows(r.admins))
      .catch(() => setRows([]));
  }, []);
  useEffect(load, [load]);
  const run = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      load();
    } catch {
      toast({ message: A('Não foi possível concluir a ação.'), tone: 'error' });
    }
  };
  const s = q.trim().toLowerCase();
  const list = (rows ?? []).filter(
    (r) => !s || r.name.toLowerCase().includes(s) || r.email.toLowerCase().includes(s),
  );
  return (
    <>
      <SectionHead title={A(SEC_TITLE.admins[0])} sub={A(SEC_TITLE.admins[1])}>
        <input
          className="kh-ad-search"
          value={q}
          placeholder={A('Pesquisar…')}
          aria-label={A('Pesquisar…')}
          onChange={(e) => setQ(e.target.value)}
        />
        <button
          type="button"
          className="kh-ad-btn"
          data-kind="p"
          style={{ marginLeft: 'auto' }}
          onClick={() => drawer(<AdminForm onDone={load} />)}
        >
          {A('+ Dar acesso')}
        </button>
      </SectionHead>
      <div className="kh-ad-body">
        {rows && (
          <Table<Row>
            label={A('Administradores')}
            grid="minmax(240px,1.6fr) 150px minmax(240px,2fr) 110px 110px 280px"
            minW={1120}
            rows={list}
            rowKey={(r) => r.userId}
            cols={[
              {
                label: A('Administrador'),
                row: true,
                cell: (r) => (
                  <>
                    <Avatar name={r.name} />
                    <span style={{ minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                      <Cell
                        main={r.name}
                        sub={`${r.email}${r.userId === me.id ? ` · ${A('eu')}` : ''}${r.totp ? '' : ` · ${A('sem 2FA')}`}`}
                      />
                    </span>
                  </>
                ),
              },
              { label: A('Papel'), cell: (r) => <RoleChip role={r.role} /> },
              {
                label: A('Permissões'),
                cell: (r) => <Cell main={<span style={{ fontWeight: 400 }}>{A(ROLES[r.role][1])}</span>} />,
              },
              { label: A('Desde'), cell: (r) => <Cell mono main={fmtDate(r.since)} /> },
              {
                label: A('Estado'),
                cell: (r) => (
                  <span
                    className="kh-ad-st"
                    style={{
                      background:
                        r.status === 'active' ? 'oklch(0.75 0.13 150 / .45)' : 'rgba(255,255,255,.14)',
                    }}
                  >
                    {r.status === 'active' ? A('Ativo') : A('Pausado')}
                  </span>
                ),
              },
              {
                label: '',
                row: true,
                cell: (r) =>
                  r.role === 'owner' || r.userId === me.id ? null : (
                    <>
                      <button
                        type="button"
                        className="kh-ad-btn kh-ad-btn--sm"
                        onClick={() => drawer(<AdminForm row={r} onDone={load} />)}
                      >
                        {A('Mudar papel')}
                      </button>
                      <button
                        type="button"
                        className="kh-ad-btn kh-ad-btn--sm"
                        onClick={() =>
                          void run(() =>
                            adminApi(
                              `/admins/${r.userId}`,
                              { status: r.status === 'active' ? 'paused' : 'active' },
                              'PATCH',
                            ),
                          )
                        }
                      >
                        {r.status === 'active' ? A('Pausar') : A('Retomar')}
                      </button>
                      <button
                        type="button"
                        className="kh-ad-btn kh-ad-btn--sm"
                        data-kind="d"
                        onClick={async () => {
                          const ok = await confirm({
                            title: A(`Remover o acesso de ${r.name} à consola?`),
                            body: A('A conta na app mantém-se.'),
                            confirmLabel: A('Remover'),
                            cancelLabel: A('Cancelar'),
                            danger: true,
                          });
                          if (ok) void run(() => adminApi(`/admins/${r.userId}`, undefined, 'DELETE'));
                        }}
                      >
                        {A('Remover')}
                      </button>
                    </>
                  ),
              },
            ]}
          />
        )}
        <div className="kh-ad-note">
          {A(
            'Só o Manager pode gerir administradores. A pessoa precisa de ter conta no KnowledgeHub com o mesmo email e de ativar a autenticação de dois fatores; o cartão "Consola de Administração" aparece-lhe no perfil.',
          )}
        </div>
      </div>
    </>
  );
}

/** "Dar acesso à consola" / "Mudar papel". */
function AdminForm({ row, onDone }: { row?: Row; onDone: () => void }) {
  const { A } = useA();
  const { drawer } = useConsole();
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<AdminRole>(row?.role ?? 'support');
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    try {
      if (row) await adminApi(`/admins/${row.userId}`, { role }, 'PATCH');
      else await adminApi('/admins', { email: email.trim(), role });
      onDone();
      drawer(null);
    } catch (e) {
      const code = isApiFailure(e) ? e.code : '';
      toast({
        message:
          code === 'no_account'
            ? A('Não há nenhuma conta com esse email.')
            : code === 'already_admin'
              ? A('Essa pessoa já tem acesso à consola.')
              : A('Não foi possível concluir a ação.'),
        tone: 'error',
      });
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <DrawerHead
        title={row ? A('Mudar papel') : A('Dar acesso à consola')}
        sub={row ? `${row.name} · ${row.email}` : A('Escolha a pessoa e o que pode fazer.')}
        onClose={() => drawer(null)}
      />
      {!row && (
        <Field label={A('Email')}>
          <input
            className="kh-ad-input"
            type="email"
            value={email}
            maxLength={254}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
      )}
      <Field label={A('Papel')}>
        <select className="kh-ad-input" value={role} onChange={(e) => setRole(e.target.value as AdminRole)}>
          {ASSIGNABLE.map((r) => (
            <option key={r} value={r}>
              {A(ROLES[r][0])} — {A(ROLES[r][1])}
            </option>
          ))}
        </select>
      </Field>
      <div>
        <div className="kh-ad-group" style={{ padding: '4px 0 8px' }}>
          {A('O que cada papel pode ver')}
        </div>
        <div className="kh-ad-list">
          {(Object.keys(ROLES) as AdminRole[]).map((r) => (
            <div key={r} className="kh-ad-li">
              <RoleChip role={r} />
              <span className="kh-ad-td__sub" style={{ whiteSpace: 'normal' }}>
                {A(ROLES[r][1])}
              </span>
            </div>
          ))}
        </div>
      </div>
      <div className="kh-ad-drawer__foot">
        <button
          type="button"
          className="kh-ad-btn"
          data-kind="p"
          disabled={busy || (!row && !/\S+@\S+\.\S+/.test(email))}
          onClick={() => void submit()}
        >
          {row ? A('Guardar') : A('Dar acesso')}
        </button>
        <button type="button" className="kh-ad-btn" onClick={() => drawer(null)}>
          {A('Cancelar')}
        </button>
      </div>
    </>
  );
}
