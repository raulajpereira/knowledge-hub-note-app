'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { adminApi, isApiFailure } from '@/lib/client/api';
import { useConfirm, useToast } from '@/components/ui';
import { SEC_TITLE, SectionHead, useConsole } from './AdminShell';
import { GROUPS } from './Clients';
import { Cell, Chips, DrawerHead, Field, PlanChip, Table, fmtStamp, useA } from './ui';

type Req = {
  id: string;
  kind: 'plan' | 'custom';
  plan: string;
  groups: string[];
  seats: number;
  cycle: 'monthly' | 'annual';
  notes: string;
  status: 'new' | 'approved' | 'rejected';
  createdAt: string;
  handledAt: string | null;
  client: { id: string; name: string; plan: string | null; seats: number; kind: 'pack' | 'individual' };
  user: { name: string; email: string } | null;
  handledBy: string | null;
};
const ST: Record<Req['status'], [string, string]> = {
  new: ['Novo', 'oklch(0.75 0.12 245 / .5)'],
  approved: ['Aprovado', 'oklch(0.75 0.13 150 / .45)'],
  rejected: ['Recusado', 'rgba(255,255,255,.14)'],
};

/** Pedidos (D43): plan and custom package requests from the app; approve applies them to the client. */
export function Requests() {
  const { A } = useA();
  const { can, drawer, go, has } = useConsole();
  const toast = useToast();
  const confirm = useConfirm();
  const sp = useSearchParams();
  const focus = sp.get('r');
  const w = can('requests', true);
  const [rows, setRows] = useState<Req[] | null>(null);
  const [f, setF] = useState<'new' | 'approved' | 'rejected' | 'all'>('new');
  const load = useCallback(() => {
    adminApi<{ requests: Req[] }>('/requests')
      .then((r) => {
        setRows(r.requests);
        window.dispatchEvent(new Event('kh-admin-requests'));
      })
      .catch(() => setRows([]));
  }, []);
  useEffect(load, [load]);
  const list = (rows ?? []).filter((r) => f === 'all' || r.status === f);
  const what = (r: Req) =>
    r.kind === 'custom'
      ? `${A('Pacote individual')}: ${r.groups.map((g) => A(GROUPS.find((x) => x[0] === g)?.[1] ?? g)).join(', ')}`
      : r.plan;
  const approve = async (r: Req) => {
    const ok = await confirm({
      title: A('Aprovar o pedido?'),
      body: `${r.client.name}: ${what(r)} · ${r.seats} ${A('lugares')} · ${r.cycle === 'annual' ? A('Anual') : A('Mensal')}. ${A('O pacote passa a valer já para o cliente.')}`,
      confirmLabel: A('Aprovar'),
      cancelLabel: A('Cancelar'),
    });
    if (!ok) return;
    try {
      await adminApi(`/requests/${r.id}/approve`, {});
      toast({ message: A('Pedido aprovado.'), tone: 'success' });
      load();
    } catch (e) {
      toast({
        message:
          isApiFailure(e) && e.code === 'already_handled'
            ? A('Este pedido já foi tratado.')
            : A('Não foi possível concluir a ação.'),
        tone: 'error',
      });
    }
  };
  const count = (s: Req['status']) => (rows ?? []).filter((r) => r.status === s).length;

  return (
    <>
      <SectionHead title={A(SEC_TITLE.requests[0])} sub={A(SEC_TITLE.requests[1])}>
        <Chips
          label={A('Estado')}
          value={f}
          onChange={setF}
          options={[
            { v: 'new', l: A('Novos'), n: count('new') },
            { v: 'approved', l: A('Aprovados'), n: count('approved') },
            { v: 'rejected', l: A('Recusados'), n: count('rejected') },
            { v: 'all', l: A('Todos') },
          ]}
        />
      </SectionHead>
      <div className="kh-ad-body">
        {rows && (
          <Table<Req>
            label={A('Pedidos')}
            grid="minmax(180px,1.4fr) minmax(150px,1fr) minmax(170px,1fr) 120px 150px 100px 196px"
            minW={1080}
            rows={list}
            rowKey={(r) => r.id}
            onRow={
              has('packs')
                ? (r) => go(r.client.kind === 'individual' ? 'inds' : 'packs', { c: r.client.id })
                : undefined
            }
            empty={f === 'new' ? A('Não há pedidos por tratar.') : undefined}
            cols={[
              {
                label: A('Pedido'),
                cell: (r) => (
                  <>
                    <span
                      style={{
                        display: 'flex',
                        gap: 8,
                        alignItems: 'center',
                        outline: r.id === focus ? '2px solid var(--accent)' : undefined,
                        borderRadius: 8,
                      }}
                    >
                      <PlanChip plan={{ code: r.plan, color: null }} />
                      {r.kind === 'plan' && r.status === 'new' && (
                        <span className="kh-ad-td__sub">← {r.client.plan ?? '—'}</span>
                      )}
                    </span>
                    <span className="kh-ad-td__sub" style={{ whiteSpace: 'normal' }}>
                      {r.kind === 'custom' ? what(r) : r.notes}
                    </span>
                  </>
                ),
              },
              {
                label: A('Cliente'),
                cell: (r) => (
                  <Cell
                    main={r.client.name}
                    sub={`${r.client.plan ?? '—'} · ${r.client.seats} ${A('lugares')}`}
                  />
                ),
              },
              {
                label: A('Quem pediu'),
                cell: (r) => <Cell main={r.user?.name ?? '—'} sub={r.user?.email} />,
              },
              {
                label: A('Lugares · ciclo'),
                cell: (r) => (
                  <Cell mono main={`${r.seats} · ${r.cycle === 'annual' ? A('Anual') : A('Mensal')}`} />
                ),
              },
              { label: A('Recebido'), cell: (r) => <Cell mono main={fmtStamp(r.createdAt)} /> },
              {
                label: A('Estado'),
                cell: (r) => (
                  <>
                    <span className="kh-ad-st" style={{ background: ST[r.status][1] }}>
                      {A(ST[r.status][0])}
                    </span>
                    {r.handledBy && <span className="kh-ad-td__sub">{r.handledBy}</span>}
                  </>
                ),
              },
              {
                label: '',
                row: true,
                cell: (r) =>
                  w && r.status === 'new' ? (
                    <>
                      <button
                        type="button"
                        className="kh-ad-btn kh-ad-btn--sm"
                        data-kind="p"
                        onClick={(e) => {
                          e.stopPropagation();
                          void approve(r);
                        }}
                      >
                        {A('Aprovar')}
                      </button>
                      <button
                        type="button"
                        className="kh-ad-btn kh-ad-btn--sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          drawer(<Reject r={r} label={what(r)} onDone={load} />);
                        }}
                      >
                        {A('Recusar')}
                      </button>
                    </>
                  ) : null,
              },
            ]}
          />
        )}
        <div className="kh-ad-note">
          {A(
            'Os pedidos chegam da janela de planos da app (Pedir este plano, Pedir mudança, pacote personalizado) e são enviados por email aos administradores. Aprovar aplica o pacote, os lugares e o ciclo ao cliente e avisa quem pediu; vindo de um plano grátis para um pacote com trial, começa o trial.',
          )}
        </div>
      </div>
    </>
  );
}

function Reject({ r, label, onDone }: { r: Req; label: string; onDone: () => void }) {
  const { A } = useA();
  const { drawer } = useConsole();
  const toast = useToast();
  const [reason, setReason] = useState('');
  return (
    <>
      <DrawerHead
        title={A('Recusar o pedido')}
        sub={`${r.client.name} · ${label}`}
        onClose={() => drawer(null)}
      />
      <Field label={A('Motivo (vai no email a quem pediu)')}>
        <textarea
          className="kh-ad-input"
          style={{ height: 120, padding: 12, resize: 'vertical' }}
          maxLength={500}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </Field>
      <div className="kh-ad-drawer__foot">
        <button
          type="button"
          className="kh-ad-btn"
          data-kind="d"
          onClick={async () => {
            try {
              await adminApi(`/requests/${r.id}/reject`, { reason });
              onDone();
              drawer(null);
            } catch {
              toast({ message: A('Não foi possível concluir a ação.'), tone: 'error' });
            }
          }}
        >
          {A('Recusar')}
        </button>
        <button type="button" className="kh-ad-btn" onClick={() => drawer(null)}>
          {A('Cancelar')}
        </button>
      </div>
    </>
  );
}
