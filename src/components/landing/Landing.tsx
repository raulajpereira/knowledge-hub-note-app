'use client';

import Link from 'next/link';
import { Icon, NavIcon, type IconName } from '@/components/shell/icons';
import { useI18n } from '@/i18n/client';
import { PublicFrame, type Entity } from './PublicFrame';

export type LandingPlan = {
  code: string;
  color: string | null;
  price: number;
  disc: number;
  trialEnabled: boolean;
  trialDays: number;
  groups: Array<{ pt: string; en: string; all: boolean }>;
};

const SEC_ICONS: IconName[] = ['shield', 'lock', 'eye', 'activity'];

const MODS: Array<[string, string]> = [
  ['notes', 'lp_m1'],
  ['passwords', 'lp_m2'],
  ['artifacts', 'lp_m3'],
  ['systems', 'lp_m4'],
  ['mg_overview', 'lp_m5'],
  ['tags', 'lp_m6'],
];

/** Public home page (no prototype; decision D50): the app's look, real plans and prices. */
export function Landing({ plans, entity }: { plans: LandingPlan[]; entity: Entity }) {
  const { t, lang } = useI18n();
  const fmt = (n: number) =>
    `${(Math.round(n * 100) / 100).toString().replace('.', lang === 'en' ? '.' : ',')} €`;
  const contact = entity.email ? `mailto:${entity.email}` : '/login';
  return (
    <PublicFrame entity={entity}>
      <section className="kh-lp-hero">
        <div className="kh-lp-hero__text">
          <span className="kh-lp-kicker">{t('lp_kicker')}</span>
          <h1>{t('lp_title')}</h1>
          <p>{t('lp_sub')}</p>
          <div className="kh-lp-ctas">
            <Link href="/login" className="kh-lp__btn kh-lp__btn--light kh-lp__btn--lg">
              {t('lp_ctaLogin')}
            </Link>
            <Link href="/register" className="kh-lp__btn kh-lp__btn--lg">
              {t('lp_ctaCode')}
            </Link>
          </div>
        </div>
        <Preview />
      </section>

      <section className="kh-lp-sec" aria-labelledby="lp-mods">
        <h2 id="lp-mods">{t('lp_modsT')}</h2>
        <p className="kh-lp-sec__sub">{t('lp_modsSub')}</p>
        <div className="kh-lp-mods">
          {MODS.map(([ico, k]) => (
            <div key={k} className="kh-lp-mod">
              <span className="kh-lp-mod__ico" aria-hidden="true">
                <NavIcon id={ico} size={20} />
              </span>
              <h3>{t(`${k}t`)}</h3>
              <p>{t(`${k}d`)}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="kh-lp-sec" aria-labelledby="lp-plans">
        <h2 id="lp-plans">{t('lp_plansT')}</h2>
        <p className="kh-lp-sec__sub">{t('lp_plansSub')}</p>
        <div className="kh-lp-plans">
          {plans.map((p) => (
            <div key={p.code} className="kh-lp-plan" style={{ ['--c' as string]: p.color ?? '#fbf8f5' }}>
              <span className="kh-lp-chip">{p.code}</span>
              <span className="kh-lp-plan__tag">{t(`pr_tag_${p.code}`)}</span>
              <span className="kh-lp-plan__price">
                {p.price ? fmt(p.price) : t('pr_free')}
                {p.price > 0 && <small> {t('lp_month')}</small>}
              </span>
              <span className="kh-lp-plan__note">
                {[
                  p.price && p.disc ? t('lp_annualOff').replace('{n}', String(p.disc)) : '',
                  p.price && p.trialEnabled ? t('lp_trial').replace('{n}', String(p.trialDays)) : '',
                ]
                  .filter(Boolean)
                  .join(' · ') || ' '}
              </span>
              <ul className="kh-lp-plan__groups">
                {p.groups.map((g) => (
                  <li key={g.pt} data-part={!g.all || undefined}>
                    {lang === 'en' ? g.en : g.pt}
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <div className="kh-lp-plan kh-lp-plan--custom">
            <span className="kh-lp-chip kh-lp-chip--custom">{t('pr_customChip')}</span>
            <span className="kh-lp-plan__tag">{t('lp_customT')}</span>
            <p className="kh-lp-plan__desc">{t('lp_customD')}</p>
            <a href={contact} className="kh-lp__btn">
              {t('lp_ctaContact')}
            </a>
          </div>
        </div>
      </section>

      <section className="kh-lp-sec kh-lp-why" aria-labelledby="lp-why">
        <h2 id="lp-why">
          {t('pr_whyKicker')} Knowledge<span style={{ color: 'var(--accent)' }}>Hub</span>?
        </h2>
        <div className="kh-lp-why__grid">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="kh-lp-why__tile">
              <h3>{t(`pr_why${i}t`)}</h3>
              <p>{t(`pr_why${i}d`)}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="kh-lp-sec" aria-labelledby="lp-sec">
        <h2 id="lp-sec">{t('lp_secT')}</h2>
        <ul className="kh-lp-secure">
          {[1, 2, 3, 4].map((i) => (
            <li key={i}>
              <Icon name={SEC_ICONS[i - 1]!} size={18} sw={1.9} />
              {t(`lp_sec${i}`)}
            </li>
          ))}
        </ul>
      </section>

      <section className="kh-lp-ready">
        <h2>{t('lp_ready')}</h2>
        <p>{t('lp_readySub')}</p>
        <div className="kh-lp-ctas">
          <Link href="/login" className="kh-lp__btn kh-lp__btn--light kh-lp__btn--lg">
            {t('lp_ctaLogin')}
          </Link>
          <a href={contact} className="kh-lp__btn kh-lp__btn--lg">
            {t('lp_ctaContact')}
          </a>
        </div>
      </section>
    </PublicFrame>
  );
}

/** A small, static picture of the app (fictional content): sidebar, a note and tasks. */
function Preview() {
  const { lang } = useI18n();
  const en = lang === 'en';
  return (
    <div className="kh-lp-prev" aria-hidden="true">
      <div className="kh-lp-prev__side">
        {['home', 'notes', 'tasks', 'calendar', 'passwords', 'systems', 'mg_overview'].map((id, i) => (
          <span key={id} data-on={i === 1 || undefined}>
            <NavIcon id={id} size={15} />
          </span>
        ))}
      </div>
      <div className="kh-lp-prev__body">
        <div className="kh-lp-prev__card kh-lp-prev__note">
          <b>{en ? 'Cutover plan · wave 2' : 'Plano de cutover · vaga 2'}</b>
          <span>
            {en ? 'Freeze transports on Friday 18:00.' : 'Congelar ordens de transporte na sexta às 18h.'}
          </span>
          <span>
            {en ? 'Data migration dry-run: 3 objects left.' : 'Ensaio da migração: faltam 3 objetos.'}
          </span>
          <span className="kh-lp-prev__tags">
            <i>SAP</i>
            <i>{en ? 'Project' : 'Projeto'}</i>
          </span>
        </div>
        <div className="kh-lp-prev__card">
          {[
            [en ? 'Review FI interface mapping' : 'Rever mapeamento da interface FI', true],
            [en ? 'Prepare UAT scripts' : 'Preparar guiões de UAT', false],
            [en ? 'Allocate team for March' : 'Alocar equipa para março', false],
          ].map(([l, done]) => (
            <span key={String(l)} className="kh-lp-prev__task" data-done={done || undefined}>
              <i />
              {l}
            </span>
          ))}
        </div>
        <div className="kh-lp-prev__card kh-lp-prev__wx">
          <b>18°</b>
          <span>Lisboa</span>
        </div>
      </div>
    </div>
  );
}
