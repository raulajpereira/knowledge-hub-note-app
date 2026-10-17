import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { getAuth } from '@/server/auth/request';
import { getEntitlements } from '@/server/licensing/entitlements';
import { listAssets } from '@/server/assets';
import { getLang } from '@/i18n/server';
import { translate, type AppKey } from '@/i18n';
import { listRecords } from '@/server/content/functional';
import { listEvidence, type Evidence } from '@/server/content/fnEvidence';
import { listClients } from '@/server/content/sap';
import { mgOptions } from '@/server/content/mg';
import { FN, FN_RC, type FnRow } from '@/lib/functional';
import { Logo } from '@/components/brand/Logo';
import { PrintButton } from '@/components/report/PrintButton';
import '@/components/report/report.css';

export const metadata: Metadata = { title: 'KnowledgeHub · Relatório de testes', robots: { index: false } };
export const dynamic = 'force-dynamic';

const BASE = process.env.NEXT_PUBLIC_BASE_PATH || '';
const P = FN.fn_test;
const Ids = z.array(z.uuid()).max(500);

/**
 * "Relatório de testes" (Funcional › Testes): a printable page — the browser
 * saves it as PDF — for one test case or a set (ids, or filters cycle /
 * module / status): cover with the brand logo, summary of results and each
 * case with its steps, expected and actual results and the evidence inline.
 */
export default async function TestReportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const auth = await getAuth();
  if (!auth) redirect('/login?next=/app/fn-test');
  const lang = await getLang();
  const t = (k: string) => translate(lang, k as AppKey) as string;
  const tr = (o: { pt: string; en: string }) => (lang === 'en' ? o.en : o.pt);
  const ent = await getEntitlements(auth.tenant.id);
  if (!ent.modules.includes('fn_test'))
    return <div className="kh-rep kh-rep--empty">{t('soon_notInPlan')}</div>;
  const sp = await searchParams;
  const ids = Ids.safeParse((sp.ids ?? '').split(',').filter(Boolean));
  const [all, clients, mg, assets] = await Promise.all([
    listRecords(auth, 'fn_test'),
    listClients(auth),
    mgOptions(auth),
    listAssets(auth.user.id),
  ]);
  const want = ids.success && ids.data.length ? new Set(ids.data) : null;
  const order = want ? [...want] : null;
  const recs = all
    .filter(
      (r) =>
        (!want || want.has(r.id)) &&
        (!sp.cycle || r.f.cycle === sp.cycle) &&
        (!sp.module || r.f.module === sp.module) &&
        (!sp.st || r.st === sp.st),
    )
    .sort((a, b) =>
      order
        ? order.indexOf(a.id) - order.indexOf(b.id)
        : (a.code || a.title).localeCompare(b.code || b.title),
    );
  const ev = await listEvidence(
    auth,
    recs.map((r) => r.id),
  );
  const logo =
    ent.modules.includes('brand') && assets.logo ? `${BASE}/api/v1/me/assets/logo?v=${assets.logo}` : null;
  const person = (id: unknown) => mg.people.find((p) => p.id === id)?.name ?? '';
  const project = (id: unknown) => {
    const p = mg.projects.find((x) => x.id === id);
    return p ? `${p.code} · ${p.name}` : '';
  };
  const uniq = (xs: string[]) => [...new Set(xs.filter(Boolean))].join(', ') || '—';
  const stL = (k: string) => tr((P.st.find((s) => s[0] === k) ?? P.st[0]!)[1]);
  const rowL = (k: string) => tr((P.rows.status!.find((s) => s[0] === k) ?? P.rows.status![0]!)[1]);
  const opt = (k: string, v: unknown) => {
    const o = P.fields.find((f) => f.k === k)?.opts?.find((x) => x[0] === v);
    return o ? tr(o[1]) : typeof v === 'string' ? v : '';
  };
  const date = new Date().toLocaleDateString(lang === 'en' ? 'en-GB' : 'pt-PT', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const count = (k: string) => recs.filter((r) => r.st === k).length;
  const steps = recs.flatMap((r) => r.rows);
  const stepCount = (k: string) => steps.filter((s) => (s.st || 'todo') === k).length;
  const evOf = (recId: string, row: FnRow) => (ev[recId] ?? []).filter((e) => e.rowId === row.id);
  const loose = (recId: string, rows: FnRow[]) =>
    (ev[recId] ?? []).filter((e) => !rows.some((r) => r.id === e.rowId));
  const img = (e: Evidence) => e.mime.startsWith('image/');

  return (
    <div className="kh-rep">
      <div className="kh-rep-tools">
        <PrintButton label={t('rep_print')} />
        <span>{t('rep_printHint')}</span>
      </div>
      <section className="kh-rep-cover">
        <div className="kh-rep-brand">
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element -- the user's logo, streamed by our API
            <img src={logo} alt="" className="kh-rep-logo" />
          ) : (
            <Logo />
          )}
        </div>
        <h1>{t('rep_title')}</h1>
        <dl className="kh-rep-meta">
          <div>
            <dt>{t('sn_project')}</dt>
            <dd>{uniq(recs.map((r) => project(r.f.project)))}</dd>
          </div>
          <div>
            <dt>{t('rep_client')}</dt>
            <dd>{uniq(recs.map((r) => clients.find((c) => c.id === r.f.client)?.name ?? ''))}</dd>
          </div>
          <div>
            <dt>{tr(P.fields.find((f) => f.k === 'cycle')!.label)}</dt>
            <dd>{uniq(recs.map((r) => opt('cycle', r.f.cycle)))}</dd>
          </div>
          <div>
            <dt>{tr(P.fields.find((f) => f.k === 'owner')!.label)}</dt>
            <dd>{uniq(recs.map((r) => person(r.f.owner)))}</dd>
          </div>
          <div>
            <dt>{t('rep_date')}</dt>
            <dd>{date}</dd>
          </div>
          <div>
            <dt>{t('rep_cases')}</dt>
            <dd>{recs.length}</dd>
          </div>
        </dl>
        <h2>{t('rep_summary')}</h2>
        <table className="kh-rep-sum">
          <thead>
            <tr>
              {P.st.map(([k, l]) => (
                <th key={k}>{tr(l)}</th>
              ))}
              <th>{t('rep_total')}</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              {P.st.map(([k]) => (
                <td key={k} data-st={k}>
                  {count(k)}
                </td>
              ))}
              <td>{recs.length}</td>
            </tr>
          </tbody>
        </table>
        <p className="kh-rep-steps">
          {t('rep_steps')}: {steps.length} ·{' '}
          {P.rows.status!.map(([k, l]) => `${tr(l)} ${stepCount(k)}`).join(' · ')}
        </p>
        <table className="kh-rep-index">
          <thead>
            <tr>
              <th>{tr(P.codeLbl)}</th>
              <th>{t('fn_title')}</th>
              <th>{tr(P.fields[0]!.label)}</th>
              <th>{tr(P.fields.find((f) => f.k === 'kind')!.label)}</th>
              <th>{t('fn_status')}</th>
            </tr>
          </thead>
          <tbody>
            {recs.map((r) => (
              <tr key={r.id}>
                <td className="kh-rep-mono">{r.code || '—'}</td>
                <td>{r.title}</td>
                <td>{(r.f.module as string) || '—'}</td>
                <td>{opt('kind', r.f.kind) || '—'}</td>
                <td>
                  <span className="kh-rep-pill" data-st={r.st}>
                    {stL(r.st)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!recs.length && <p>{t('rep_none')}</p>}
      </section>

      {recs.map((r) => (
        <section key={r.id} className="kh-rep-case">
          <header>
            <span className="kh-rep-mono">{r.code}</span>
            <h2>{r.title}</h2>
            <span className="kh-rep-pill" data-st={r.st}>
              {stL(r.st)}
            </span>
          </header>
          <dl className="kh-rep-meta kh-rep-meta--case">
            {P.fields
              .filter((f) => f.type !== 'area')
              .map((f) => {
                const v = r.f[f.k];
                const shown =
                  f.type === 'client'
                    ? (clients.find((c) => c.id === v)?.name ?? '')
                    : f.type === 'project'
                      ? project(v)
                      : f.type === 'person'
                        ? person(v)
                        : f.type === 'sel'
                          ? opt(f.k, v)
                          : String(v ?? '');
                return (
                  <div key={f.k}>
                    <dt>{tr(f.label)}</dt>
                    <dd>{shown || '—'}</dd>
                  </div>
                );
              })}
          </dl>
          {P.fields
            .filter((f) => f.type === 'area' && r.f[f.k])
            .map((f) => (
              <div key={f.k} className="kh-rep-area">
                <h3>{tr(f.label)}</h3>
                <p>{String(r.f[f.k])}</p>
              </div>
            ))}
          <table className="kh-rep-stepst">
            <thead>
              <tr>
                <th>#</th>
                {P.rows.cols.map((c) => (
                  <th key={c[0]}>{tr(c[1])}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {r.rows.map((row, i) => {
                const es = evOf(r.id, row);
                return [
                  <tr key={`${row.id ?? i}`} className="kh-rep-step">
                    <td className="kh-rep-mono">{i + 1}</td>
                    {P.rows.cols.map(([k, , kind]) => (
                      <td key={k}>
                        {kind === 'rst' ? (
                          <span className="kh-rep-res" style={{ borderColor: FN_RC[row[k] || 'todo'] }}>
                            {rowL(row[k] || 'todo')}
                          </span>
                        ) : (
                          row[k] || '—'
                        )}
                      </td>
                    ))}
                  </tr>,
                  es.length > 0 && (
                    <tr key={`${row.id ?? i}-ev`} className="kh-rep-evrow">
                      <td />
                      <td colSpan={P.rows.cols.length}>
                        <div className="kh-rep-ev">
                          {es.map((e) =>
                            img(e) ? (
                              <figure key={e.id}>
                                {/* eslint-disable-next-line @next/next/no-img-element -- evidence streamed by our API */}
                                <img src={`${BASE}/api/v1/sap/functional/evidence/${e.id}`} alt={e.name} />
                                <figcaption>{e.name}</figcaption>
                              </figure>
                            ) : (
                              <span key={e.id} className="kh-rep-file">
                                ↧ {e.name}
                              </span>
                            ),
                          )}
                        </div>
                      </td>
                    </tr>
                  ),
                ];
              })}
            </tbody>
          </table>
          {!r.rows.length && <p>{t('fn_noRows')}</p>}
          {loose(r.id, r.rows).length > 0 && (
            <div className="kh-rep-area">
              <h3>{t('rep_otherEv')}</h3>
              <div className="kh-rep-ev">
                {loose(r.id, r.rows).map((e) =>
                  img(e) ? (
                    <figure key={e.id}>
                      {/* eslint-disable-next-line @next/next/no-img-element -- evidence streamed by our API */}
                      <img src={`${BASE}/api/v1/sap/functional/evidence/${e.id}`} alt={e.name} />
                      <figcaption>{e.name}</figcaption>
                    </figure>
                  ) : (
                    <span key={e.id} className="kh-rep-file">
                      ↧ {e.name}
                    </span>
                  ),
                )}
              </div>
            </div>
          )}
        </section>
      ))}
    </div>
  );
}
