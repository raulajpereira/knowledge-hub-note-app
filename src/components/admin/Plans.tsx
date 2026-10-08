'use client';

import { useCallback, useEffect, useState } from 'react';
import { adminApi } from '@/lib/client/api';
import { useToast } from '@/components/ui';
import { SEC_TITLE, SectionHead, Svg, useConsole } from './AdminShell';
import { eur, useA } from './ui';

type Plan = {
  code: string;
  color: string | null;
  price: number;
  disc: number;
  trialEnabled: boolean;
  trialDays: number;
  modules: string[];
  limits: Record<string, number>;
  clients: number;
};
type Group = { grp: string; pt: string; en: string; modules: Array<{ id: string; pt: string; en: string }> };
type Data = {
  plans: Plan[];
  groups: Group[];
  addon: Record<string, number>;
  customDisc: number;
  customClients: number;
};

const LIMITS: Array<[string, string]> = [
  ['notes', 'Notas'],
  ['tasks', 'Tarefas'],
  ['artifacts', 'Artefactos'],
  ['whiteboards', 'Whiteboards'],
  ['snippets', 'Snippets'],
  ['voice', 'Notas de voz'],
];

/** Number input that saves on blur / Enter (prototype: the change applies at once). */
function NumberField({
  label,
  value,
  min,
  max,
  step,
  disabled,
  placeholder,
  onSave,
  width,
  ariaLabel,
}: {
  label: string;
  /** when the visible label is empty (the name is next to the field) */
  ariaLabel?: string;
  value: number | null;
  min: number;
  max: number;
  step?: number;
  disabled?: boolean;
  placeholder?: string;
  onSave: (v: number | null) => void;
  width?: number;
}) {
  const [v, setV] = useState(value === null ? '' : String(value));
  useEffect(() => setV(value === null ? '' : String(value)), [value]);
  const commit = () => {
    if (v.trim() === '') {
      if (value !== null && placeholder) onSave(null);
      else setV(value === null ? '' : String(value));
      return;
    }
    const n = Math.max(min, Math.min(max, Number(v.replace(',', '.'))));
    if (!Number.isFinite(n)) return setV(value === null ? '' : String(value));
    if (n !== value) onSave(n);
    setV(String(n));
  };
  return (
    <label className="kh-ad-field" style={width ? { width } : undefined}>
      <span>{label}</span>
      <input
        className="kh-ad-input kh-ad-mono"
        type="number"
        inputMode="decimal"
        min={min}
        max={max}
        step={step ?? 1}
        value={v}
        placeholder={placeholder}
        disabled={disabled}
        aria-label={ariaLabel}
        onChange={(e) => setV(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      />
    </label>
  );
}

function Toggle({
  on,
  onClick,
  disabled,
  label,
}: {
  on: boolean;
  onClick: () => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      style={{
        width: 42,
        height: 24,
        flex: 'none',
        borderRadius: 999,
        border: 0,
        padding: 3,
        cursor: disabled ? 'default' : 'pointer',
        background: on ? 'oklch(0.78 0.14 150)' : 'rgba(255,255,255,.2)',
        display: 'flex',
        justifyContent: on ? 'flex-end' : 'flex-start',
      }}
    >
      <span style={{ width: 18, height: 18, borderRadius: '50%', background: '#fbf8f5' }} />
    </button>
  );
}

/** Pacotes e Preços (plans can't be created or deleted, like the prototype). */
export function Plans() {
  const { A, lang } = useA();
  const { can } = useConsole();
  const toast = useToast();
  const w = can('plans', true);
  const [d, setD] = useState<Data | null>(null);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const load = useCallback(() => {
    adminApi<Data>('/plans')
      .then(setD)
      .catch(() => setD(null));
  }, []);
  useEffect(load, [load]);
  const save = async (path: string, body: unknown, method = 'PATCH') => {
    try {
      await adminApi(path, body, method);
      load();
    } catch {
      toast({ message: A('Não foi possível guardar.'), tone: 'error' });
    }
  };
  if (!d) return <SectionHead title={A(SEC_TITLE.plans[0])} sub={A(SEC_TITLE.plans[1])} />;
  const total = d.groups.reduce((s, g) => s + g.modules.length, 0);
  const label = (x: { pt: string; en: string }) => (lang === 'en' ? x.en : x.pt);

  return (
    <>
      <SectionHead title={A(SEC_TITLE.plans[0])} sub={A(SEC_TITLE.plans[1])} />
      <div className="kh-ad-body">
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 400px), 1fr))',
            gap: 16,
            alignItems: 'start',
          }}
        >
          {d.plans.map((p) => {
            const mods = new Set(p.modules);
            const setMods = (next: Set<string>) =>
              void save(`/plans/${p.code}/modules`, { modules: [...next] }, 'PUT');
            return (
              <div
                key={p.code}
                className="kh-ad-card"
                style={{
                  borderRadius: 26,
                  borderTop: `5px solid ${p.color ?? '#fff'}`,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 16,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span className="kh-ad-plan" style={{ background: p.color ?? '#fff' }}>
                    {p.code}
                  </span>
                  <span className="kh-ad-td__sub" style={{ marginLeft: 'auto' }}>
                    {p.clients} {A(p.clients === 1 ? 'cliente' : 'clientes')}
                  </span>
                </div>
                <div>
                  <div
                    className="kh-ad-mono"
                    style={{ fontSize: 40, fontWeight: 600, letterSpacing: '-.03em' }}
                  >
                    {p.price > 0 ? `${String(p.price).replace('.', ',')} €` : A('Grátis')}
                  </div>
                  <div className="kh-ad-td__sub">{A('por utilizador / mês')}</div>
                </div>
                {p.price > 0 && (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '10px 14px',
                      borderRadius: 14,
                      background: 'rgba(255,255,255,.05)',
                      border: '1px solid rgba(255,255,255,.1)',
                    }}
                  >
                    <span style={{ flex: 1, fontSize: 13 }}>{A('Plano anual')}</span>
                    <span className="kh-ad-mono" style={{ fontSize: 13.5, fontWeight: 600 }}>
                      {eur(p.price * 12 * (1 - p.disc / 100))} {A('/ utilizador / ano')}
                    </span>
                    {p.disc > 0 && (
                      <span className="kh-ad-st" style={{ background: 'oklch(0.75 0.13 150 / .45)' }}>
                        -{p.disc}%
                      </span>
                    )}
                  </div>
                )}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <NumberField
                    label={A('Preço mensal (€)')}
                    value={p.price}
                    min={0}
                    max={10000}
                    step={0.5}
                    disabled={!w}
                    onSave={(v) => void save(`/plans/${p.code}`, { price: v ?? 0 })}
                  />
                  <NumberField
                    label={A('Desconto anual (%)')}
                    value={p.disc}
                    min={0}
                    max={60}
                    disabled={!w}
                    onSave={(v) => void save(`/plans/${p.code}`, { disc: Math.round(v ?? 0) })}
                  />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <Toggle
                    on={p.trialEnabled}
                    disabled={!w}
                    label={A('Período de experiência')}
                    onClick={() => void save(`/plans/${p.code}`, { trialEnabled: !p.trialEnabled })}
                  />
                  <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 1 }}>
                    <span style={{ fontSize: 13.5, fontWeight: 600 }}>{A('Período de experiência')}</span>
                    <span className="kh-ad-td__sub" style={{ whiteSpace: 'normal' }}>
                      {A('Novos clientes deste pacote começam em trial')}
                    </span>
                  </span>
                  <span
                    style={{
                      opacity: p.trialEnabled ? 1 : 0.45,
                      display: 'flex',
                      alignItems: 'flex-end',
                      gap: 6,
                    }}
                  >
                    <NumberField
                      label=""
                      ariaLabel={`${p.code} · ${A('Período de experiência')} (${A('dias')})`}
                      value={p.trialDays}
                      min={1}
                      max={90}
                      width={70}
                      disabled={!w || !p.trialEnabled}
                      onSave={(v) => void save(`/plans/${p.code}`, { trialDays: Math.round(v ?? 14) })}
                    />
                    <span className="kh-ad-td__sub" style={{ paddingBottom: 10 }}>
                      {A('dias')}
                    </span>
                  </span>
                </div>
                {p.code === 'FREE' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                      <span style={{ fontSize: 13.5, fontWeight: 600 }}>{A('Limites de criação')}</span>
                      <span className="kh-ad-td__sub">{A('vazio = sem limite')}</span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                      {LIMITS.map(([k, l]) => (
                        <NumberField
                          key={k}
                          label={A(l)}
                          value={p.limits[k] ?? null}
                          min={0}
                          max={1_000_000}
                          placeholder="∞"
                          disabled={!w}
                          onSave={(v) => void save(`/plans/${p.code}/limits`, { [k]: v }, 'PUT')}
                        />
                      ))}
                    </div>
                  </div>
                )}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                    <span style={{ fontSize: 13.5, fontWeight: 600 }}>{A('Módulos incluídos')}</span>
                    <span className="kh-ad-mono kh-ad-td__sub">
                      {p.modules.length} / {total}
                    </span>
                  </div>
                  {d.groups.map((g) => {
                    const n = g.modules.filter((m) => mods.has(m.id)).length;
                    const all = n === g.modules.length;
                    const key = `${p.code}:${g.grp}`;
                    const isOpen = !!open[key];
                    return (
                      <div
                        key={g.grp}
                        style={{
                          borderRadius: 14,
                          background: 'rgba(255,255,255,.04)',
                          border: '1px solid rgba(255,255,255,.08)',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px' }}>
                          <button
                            type="button"
                            role="checkbox"
                            aria-checked={all ? true : n ? 'mixed' : false}
                            aria-label={`${A('Selecionar o grupo todo')} · ${label(g)}`}
                            title={A('Selecionar o grupo todo')}
                            disabled={!w}
                            onClick={() => {
                              const next = new Set(mods);
                              for (const m of g.modules) {
                                if (all) next.delete(m.id);
                                else next.add(m.id);
                              }
                              setMods(next);
                            }}
                            style={{
                              width: 20,
                              height: 20,
                              flex: 'none',
                              borderRadius: 6,
                              border: `1.5px solid ${n ? (p.color ?? '#fff') : 'rgba(255,255,255,.35)'}`,
                              background: n ? (p.color ?? '#fff') : 'transparent',
                              color: '#16131f',
                              fontSize: 12,
                              fontWeight: 800,
                              cursor: w ? 'pointer' : 'default',
                              padding: 0,
                              lineHeight: 1,
                            }}
                          >
                            {all ? '✓' : n ? '–' : ''}
                          </button>
                          <button
                            type="button"
                            aria-expanded={isOpen}
                            onClick={() => setOpen((o) => ({ ...o, [key]: !isOpen }))}
                            style={{
                              flex: 1,
                              display: 'flex',
                              alignItems: 'center',
                              gap: 8,
                              background: 'transparent',
                              border: 0,
                              color: '#fbf8f5',
                              cursor: 'pointer',
                              padding: 0,
                              fontSize: 13.5,
                            }}
                          >
                            <span style={{ flex: 1, textAlign: 'left' }}>{label(g)}</span>
                            <span className="kh-ad-mono kh-ad-td__sub">
                              {n} / {g.modules.length}
                            </span>
                            <Svg
                              d={isOpen ? '<path d="M6 15l6-6 6 6"/>' : '<path d="M6 9l6 6 6-6"/>'}
                              s={14}
                              sw={2}
                            />
                          </button>
                        </div>
                        {isOpen && (
                          <div
                            style={{
                              display: 'grid',
                              gridTemplateColumns: '1fr 1fr',
                              gap: '4px 12px',
                              padding: '0 12px 10px 40px',
                            }}
                          >
                            {g.modules.map((m) => (
                              <label
                                key={m.id}
                                style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5 }}
                              >
                                <input
                                  type="checkbox"
                                  disabled={!w}
                                  checked={mods.has(m.id)}
                                  onChange={() => {
                                    const next = new Set(mods);
                                    if (next.has(m.id)) next.delete(m.id);
                                    else next.add(m.id);
                                    setMods(next);
                                  }}
                                />
                                {label(m)}
                              </label>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
          <div
            className="kh-ad-card"
            style={{
              borderRadius: 26,
              borderTop: '5px solid #c8d2ff',
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span className="kh-ad-plan" style={{ background: 'linear-gradient(135deg,#b8e0ff,#d8c4ff)' }}>
                {A('INDIVIDUAL')}
              </span>
              <span className="kh-ad-td__sub" style={{ marginLeft: 'auto' }}>
                {d.customClients} {A(d.customClients === 1 ? 'cliente' : 'clientes')}
              </span>
            </div>
            <div className="kh-ad-td__sub">{A('€ / utilizador / mês')}</div>
            {d.groups.map((g) => (
              <div key={g.grp} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                  <span
                    style={{ fontSize: 13.5, fontWeight: 600, display: 'flex', gap: 8, alignItems: 'center' }}
                  >
                    {label(g)}
                    {g.grp === 'base' && (
                      <span className="kh-ad-st" style={{ background: 'rgba(255,255,255,.16)' }}>
                        {A('incluído')}
                      </span>
                    )}
                  </span>
                  <span className="kh-ad-td__sub">
                    {g.modules.length} {A('módulos')}
                  </span>
                </span>
                <NumberField
                  label=""
                  ariaLabel={`${A(g.pt)} · € / ${A('utilizador')} / ${A('mês')}`}
                  value={Number(d.addon[g.grp] ?? 0)}
                  min={0}
                  max={10000}
                  step={0.5}
                  width={84}
                  disabled={!w}
                  onSave={(v) => void save('/plans/custom', { addon: { [g.grp]: v ?? 0 } })}
                />
              </div>
            ))}
            <NumberField
              label={A('Desconto anual (%)')}
              value={d.customDisc}
              min={0}
              max={60}
              disabled={!w}
              onSave={(v) => void save('/plans/custom', { customDisc: Math.round(v ?? 0) })}
            />
          </div>
        </div>
        <div className="kh-ad-note">
          {A(
            'Marque um grupo para o incluir todo, ou abra-o para escolher módulos individuais. Cada pacote define se tem período de experiência e quantos dias.',
          )}
        </div>
      </div>
    </>
  );
}
