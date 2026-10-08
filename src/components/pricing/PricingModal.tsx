'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useI18n } from '@/i18n/client';
import { api } from '@/lib/client/api';
import { useToast } from '@/components/ui';
import './pricing.css';

type Plan = {
  code: string;
  color: string | null;
  price: number;
  disc: number;
  trialEnabled: boolean;
  trialDays: number;
  modules: string[];
  limits: Record<string, number>;
};
type Group = { grp: string; pt: string; en: string; modules: Array<{ id: string; pt: string; en: string }> };
type Data = {
  plans: Plan[];
  groups: Group[];
  addon: Record<string, number>;
  customDisc: number;
  current: string | null;
  seats: number;
  pending: Array<{ kind: 'plan' | 'custom'; plan: string | null }>;
};

const WHY_ICONS = ['⚡', '🔒', '🤝', '↺'];
const LIMIT_KEYS = ['notes', 'tasks', 'artifacts', 'whiteboards', 'snippets', 'voice'];

const Check = ({ s = 10 }: { s?: number }) => (
  <svg
    width={s}
    height={s}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="3.6"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </svg>
);
const Close = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.2"
    strokeLinecap="round"
    aria-hidden="true"
  >
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);

/**
 * Pricing.dc.html: the plans (monthly / annual), what each includes, "Porquê
 * o KnowledgeHub?", a custom package and the comparison table. No checkout:
 * the buttons create a plan request for the Admin Console (D43).
 */
export function PricingModal({ onClose }: { onClose: () => void }) {
  const { t, lang } = useI18n();
  const toast = useToast();
  const [d, setD] = useState<Data | null>(null);
  const [annual, setAnnual] = useState(true);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [sent, setSent] = useState<Set<string>>(new Set());
  const [msg, setMsg] = useState('');
  const [cuOpen, setCuOpen] = useState(false);
  const [cust, setCust] = useState<string[]>(['base', 'pro']);
  const [seats, setSeats] = useState(5);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    api<Data>('/plans')
      .then((r) => {
        setD(r);
        setSeats(Math.max(1, r.seats));
        setSent(new Set(r.pending.map((p) => p.plan ?? '')));
      })
      .catch(() => setD(null));
  }, []);
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      if (cuOpen) setCuOpen(false);
      else onClose();
    };
    document.addEventListener('keydown', k, true);
    return () => document.removeEventListener('keydown', k, true);
  }, [cuOpen, onClose]);

  const tr = (x: { pt: string; en: string }) => (lang === 'en' ? x.en : x.pt);
  const fmt = (n: number) =>
    `${(Math.round(n * 100) / 100).toString().replace('.', lang === 'en' ? '.' : ',')} €`;
  const request = async (body: Record<string, unknown>, key: string, thanks: string) => {
    try {
      await api('/plan-requests', { ...body, cycle: annual ? 'annual' : 'monthly' });
      setSent((s) => new Set(s).add(key));
      setMsg(t('pr_thanks').replace('{p}', thanks));
    } catch {
      toast({ message: t('pr_fail'), tone: 'error' });
    }
  };
  if (!mounted) return null;
  const P = d?.plans ?? [];
  const cur = d?.current ?? 'FREE';
  const curFree = !(P.find((p) => p.code === cur)?.price ?? 0);
  const maxDisc = Math.max(0, ...P.map((p) => p.disc));
  const cycles = (
    <>
      {[false, true].map((a) => (
        <button key={String(a)} type="button" aria-pressed={annual === a} onClick={() => setAnnual(a)}>
          {a ? t('pr_annual') : t('pr_monthly')}
          {a && maxDisc > 0 && <span className="kh-pr-save">-{maxDisc}%</span>}
        </button>
      ))}
    </>
  );
  const sum = cust.reduce((s, g) => s + (Number(d?.addon[g]) || 0), 0);
  const cEff = annual ? sum * (1 - (d?.customDisc ?? 0) / 100) : sum;

  return createPortal(
    <div className="kh-pr-dim" onClick={onClose}>
      <div
        className="kh-pr"
        role="dialog"
        aria-modal="true"
        aria-label={t('pr_title')}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="kh-pr__head">
          <div style={{ flex: '1 1 320px', display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
            <span className="kh-pr__title">{t('pr_title')}</span>
            <span className="kh-pr__sub">{t('pr_sub')}</span>
          </div>
          <div className="kh-pr-cycles" role="group" aria-label={t('pr_annual')}>
            {cycles}
          </div>
          <button
            type="button"
            className="kh-pr-x"
            onClick={onClose}
            title={t('ui_close')}
            aria-label={t('ui_close')}
          >
            <Close />
          </button>
        </div>
        <div className="kh-pr__scroll">
          {msg && (
            <div className="kh-pr-msg" role="status">
              <span style={{ flex: 1 }}>{msg}</span>
              <button type="button" onClick={() => setMsg('')} aria-label={t('ui_close')}>
                ×
              </button>
            </div>
          )}
          <div className="kh-pr-cards">
            {P.map((p) => {
              const mods = new Set(p.modules);
              const isCur = p.code === cur;
              const ultra = p.code === 'ULTRA';
              const eff = annual ? p.price * (1 - p.disc / 100) : p.price;
              const ribbon = isCur
                ? t('pr_yours')
                : ultra
                  ? t('pr_all')
                  : p.code === 'PRO'
                    ? t('pr_popular')
                    : '';
              const isSent = sent.has(p.code);
              const lims = LIMIT_KEYS.filter((k) => p.limits[k] !== undefined).map(
                (k) => `${p.limits[k]} ${t(`pr_lim_${k}`)}`,
              );
              const c = p.color ?? '#fbf8f5';
              return (
                <div
                  key={p.code}
                  className="kh-pr-card"
                  data-cur={isCur || undefined}
                  data-ultra={ultra || undefined}
                  style={{ ['--c' as string]: c }}
                >
                  {ribbon && <span className="kh-pr-ribbon">{ribbon}</span>}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <span className="kh-pr-chip">{p.code}</span>
                    <span className="kh-pr-tag">{t(`pr_tag_${p.code}`)}</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span className="kh-pr-price">{p.price ? fmt(eff) : t('pr_free')}</span>
                    <span className="kh-pr-per">{p.price ? t('pr_perUserMo') : t('pr_forever')}</span>
                    <span className="kh-pr-note">
                      {p.price && annual
                        ? t('pr_billedYr').replace('{x}', fmt(eff * 12))
                        : p.price && p.trialEnabled
                          ? t('pr_trialDays').replace('{n}', String(p.trialDays))
                          : ''}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="kh-pr-cta"
                    disabled={isCur || isSent}
                    data-cur={isCur || undefined}
                    onClick={() =>
                      void request({ kind: 'plan', plan: p.code, seats: d?.seats ?? 1 }, p.code, p.code)
                    }
                  >
                    <span>
                      {isCur
                        ? t('pr_current')
                        : isSent
                          ? t('pr_reqSent')
                          : curFree
                            ? t('pr_subscribe')
                            : t('pr_switchTo').replace('{p}', p.code)}
                    </span>
                    {!isCur && !isSent && curFree && p.price > 0 && p.trialEnabled && (
                      <small>{t('pr_trialInc').replace('{n}', String(p.trialDays))}</small>
                    )}
                  </button>
                  <div className="kh-pr-feats">
                    {(d?.groups ?? []).map((g) => {
                      const n = g.modules.filter((m) => mods.has(m.id)).length;
                      const all = n === g.modules.length;
                      return (
                        <span key={g.grp} className="kh-pr-feat" data-off={!n || undefined}>
                          <span className="kh-pr-feat__i">{n ? <Check /> : '–'}</span>
                          <span style={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 }}>
                            <span>{tr(g)}</span>
                            {n > 0 && (
                              <span className="kh-pr-feat__s">
                                {all
                                  ? g.modules.slice(0, 4).map(tr).join(', ') +
                                    (g.modules.length > 4 ? '…' : '')
                                  : g.modules
                                      .filter((m) => mods.has(m.id))
                                      .map(tr)
                                      .join(', ')}
                              </span>
                            )}
                          </span>
                        </span>
                      );
                    })}
                    {lims.length > 0 && (
                      <span className="kh-pr-feat" data-off="">
                        <span className="kh-pr-feat__i">–</span>
                        <span>
                          {t('pr_limit')}
                          {lims.join(' · ')}
                        </span>
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="kh-pr-why">
            <span className="kh-pr-why__blob" aria-hidden="true" />
            <span className="kh-pr-why__t">
              {t('pr_whyKicker')} Knowledge<span style={{ color: 'var(--accent)' }}>Hub</span>?
            </span>
            <div className="kh-pr-why__grid">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="kh-pr-why__tile">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span className="kh-pr-why__ico" aria-hidden="true">
                      {WHY_ICONS[i - 1]}
                    </span>
                    <span style={{ fontSize: 14, fontWeight: 600 }}>{t(`pr_why${i}t`)}</span>
                  </div>
                  <span className="kh-pr-why__d">{t(`pr_why${i}d`)}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="kh-pr-needcustom">
            <span>{t('pr_needCustom')}</span>
            <button type="button" onClick={() => setCuOpen(true)}>
              <span className="kh-pr-custchip">{t('pr_customChip')}</span>
              {t('pr_customBtn')}
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <span style={{ fontSize: 18, fontWeight: 600 }}>{t('pr_compare')}</span>
            <div className="kh-pr-cmp">
              <div style={{ minWidth: 860 }}>
                <div
                  className="kh-pr-cmp__row kh-pr-cmp__head"
                  style={{ gridTemplateColumns: `minmax(220px,1.6fr) repeat(${P.length},minmax(90px,1fr))` }}
                >
                  <span style={{ padding: '0 16px' }}>{t('pr_module')}</span>
                  {P.map((p) => (
                    <span key={p.code} style={{ display: 'flex', justifyContent: 'center' }}>
                      <span
                        className="kh-pr-chip kh-pr-chip--sm"
                        style={{ ['--c' as string]: p.color ?? '#fbf8f5' }}
                      >
                        {p.code}
                      </span>
                    </span>
                  ))}
                </div>
                {(d?.groups ?? []).map((g) => {
                  const op = !!open[g.grp];
                  return (
                    <div key={g.grp}>
                      <div
                        className="kh-pr-cmp__row kh-pr-cmp__group"
                        style={{
                          gridTemplateColumns: `minmax(220px,1.6fr) repeat(${P.length},minmax(90px,1fr))`,
                        }}
                      >
                        <button
                          type="button"
                          aria-expanded={op}
                          onClick={() => setOpen((o) => ({ ...o, [g.grp]: !op }))}
                        >
                          <svg
                            width="11"
                            height="11"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.8"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            style={{ transform: `rotate(${op ? 0 : -90}deg)` }}
                            aria-hidden="true"
                          >
                            <path d="M6 9l6 6 6-6" />
                          </svg>
                          {tr(g)}
                        </button>
                        {P.map((p) => {
                          const n = g.modules.filter((m) => p.modules.includes(m.id)).length;
                          return (
                            <span
                              key={p.code}
                              className="kh-pr-cmp__cell"
                              data-v={n === g.modules.length ? 'all' : n ? 'some' : 'none'}
                            >
                              {n === g.modules.length ? '✓' : n ? `${n}/${g.modules.length}` : '—'}
                            </span>
                          );
                        })}
                      </div>
                      {op &&
                        g.modules.map((m) => (
                          <div
                            key={m.id}
                            className="kh-pr-cmp__row kh-pr-cmp__mod"
                            style={{
                              gridTemplateColumns: `minmax(220px,1.6fr) repeat(${P.length},minmax(90px,1fr))`,
                            }}
                          >
                            <span style={{ paddingLeft: 36 }}>{tr(m)}</span>
                            {P.map((p) => {
                              const on = p.modules.includes(m.id);
                              return (
                                <span key={p.code} className="kh-pr-cmp__cell" data-v={on ? 'all' : 'off'}>
                                  {on ? '✓' : '—'}
                                </span>
                              );
                            })}
                          </div>
                        ))}
                    </div>
                  );
                })}
              </div>
            </div>
            <span style={{ fontSize: 12, color: 'rgba(255,248,240,.62)' }}>{t('pr_foot')}</span>
          </div>
        </div>
      </div>

      {cuOpen && d && (
        <div className="kh-pr-dim kh-pr-dim--top" onClick={(e) => (e.stopPropagation(), setCuOpen(false))}>
          <div
            className="kh-pr kh-pr--custom"
            role="dialog"
            aria-modal="true"
            aria-label={t('pr_customTitle')}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="kh-pr__head" style={{ alignItems: 'flex-start' }}>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
                <span className="kh-pr-custchip kh-pr-custchip--lg">{t('pr_customChip')}</span>
                <span style={{ fontSize: 24, fontWeight: 600, letterSpacing: '-.02em' }}>
                  {t('pr_customTitle')}
                </span>
                <span className="kh-pr__sub">{t('pr_customSub')}</span>
              </div>
              <button
                type="button"
                className="kh-pr-x"
                onClick={() => setCuOpen(false)}
                title={t('ui_close')}
                aria-label={t('ui_close')}
              >
                <Close />
              </button>
            </div>
            <div className="kh-pr-cu">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
                {d.groups.map((g) => {
                  const on = cust.includes(g.grp);
                  const base = g.grp === 'base';
                  return (
                    <button
                      key={g.grp}
                      type="button"
                      role="checkbox"
                      aria-checked={on}
                      className="kh-pr-grp"
                      data-on={on || undefined}
                      disabled={base}
                      title={g.modules.map(tr).join(', ')}
                      onClick={() => setCust((c) => (on ? c.filter((x) => x !== g.grp) : [...c, g.grp]))}
                    >
                      <span className="kh-pr-grp__ck">{on && <Check s={12} />}</span>
                      <span
                        style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}
                      >
                        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 14.5, fontWeight: 600 }}>{tr(g)}</span>
                          {base && <span className="kh-pr-inc">{t('pr_included')}</span>}
                        </span>
                        <span
                          className="kh-pr-feat__s"
                          style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                        >
                          {g.modules.map(tr).join(', ')}
                        </span>
                      </span>
                      <span
                        style={{
                          flex: 'none',
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'flex-end',
                        }}
                      >
                        <span className="kh-pr-price" style={{ fontSize: 15 }}>
                          +{fmt(Number(d.addon[g.grp]) || 0)}
                        </span>
                        <span className="kh-pr-note">{t('pr_perUserMo')}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
              <div className="kh-pr-sum">
                <span style={{ fontSize: 15, fontWeight: 600 }}>{t('pr_summary')}</span>
                <div className="kh-pr-cycles kh-pr-cycles--full">{cycles}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ flex: 1, fontSize: 13 }}>{t('pr_users')}</span>
                  <button
                    type="button"
                    className="kh-pr-step"
                    aria-label="−"
                    onClick={() => setSeats((n) => Math.max(1, n - 1))}
                  >
                    −
                  </button>
                  <span className="kh-pr-price" style={{ fontSize: 16, minWidth: 34, textAlign: 'center' }}>
                    {seats}
                  </span>
                  <button
                    type="button"
                    className="kh-pr-step"
                    aria-label="+"
                    onClick={() => setSeats((n) => Math.min(999, n + 1))}
                  >
                    +
                  </button>
                </div>
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6,
                    paddingTop: 12,
                    borderTop: '1px solid rgba(255,255,255,.12)',
                  }}
                >
                  <span style={{ fontSize: 13 }}>{t('pr_groupsN').replace('{n}', String(cust.length))}</span>
                  <span className="kh-pr-price" style={{ fontSize: 14 }}>
                    {fmt(cEff)} <span className="kh-pr-note">{t('pr_perUserMo')}</span>
                  </span>
                  {annual && d.customDisc > 0 && (
                    <span style={{ display: 'flex', gap: 12, fontSize: 12.5, color: 'oklch(0.86 0.13 150)' }}>
                      <span style={{ flex: 1 }}>{t('pr_annualSave')}</span>
                      <span className="kh-pr-mono">
                        −{fmt((sum - cEff) * seats * 12)}
                        {t('pr_yr')}
                      </span>
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span className="kh-pr-note">{annual ? t('pr_perYear') : t('pr_perMonth')}</span>
                  <span className="kh-pr-price" style={{ fontSize: 34 }}>
                    {fmt(cEff * seats * (annual ? 12 : 1))}
                  </span>
                </div>
                <button
                  type="button"
                  className="kh-pr-sumcta"
                  disabled={sent.has('CUSTOM')}
                  onClick={async () => {
                    await request({ kind: 'custom', groups: cust, seats }, 'CUSTOM', t('pr_customTitle'));
                    setCuOpen(false);
                  }}
                >
                  {sent.has('CUSTOM') ? t('pr_reqSent') : t('pr_customCta')}
                </button>
                <span className="kh-pr-note" style={{ textAlign: 'center', lineHeight: 1.45 }}>
                  {t('pr_customNote')}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>,
    document.body,
  );
}
