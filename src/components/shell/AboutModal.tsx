'use client';

import { Modal } from '@/components/ui';
import { Logo } from '@/components/brand/Logo';
import { useI18n } from '@/i18n/client';
import { Icon } from './icons';

export const APP_VERSION = '2.0.0';

/** "Sobre" (prototype aboutOpen). */
export function AboutModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useI18n();
  return (
    <Modal open={open} onClose={onClose} size="sm" closeLabel={t('i_close')} className="kh-about" hideClose>
      <button
        type="button"
        className="kh-x"
        onClick={onClose}
        title={t('i_close')}
        aria-label={t('i_close')}
        style={{ position: 'absolute', top: 16, right: 16 }}
      >
        <Icon name="close" size={12} sw={2.6} />
      </button>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',

          textShadow: '0 1px 10px rgb(0 0 0 / calc(.18 * var(--sh-k)))',
        }}
      >
        <div style={{ borderRadius: 24, boxShadow: '0 14px 40px rgb(0 0 0 / calc(.25 * var(--sh-k)))' }}>
          <Logo size={92} showWordmark={false} />
        </div>
        <div style={{ marginTop: 22, fontSize: 30, fontWeight: 700, letterSpacing: '-.02em' }}>
          <span>Knowledge</span>
          <span style={{ color: 'var(--accent-text)' }}>Hub</span>
        </div>
        <div style={{ marginTop: 8, fontSize: 15, color: 'rgb(var(--t) / calc(.85 * var(--t-k)))' }}>
          {t('ab_tag')}
        </div>
        <div
          style={{
            marginTop: 22,
            fontFamily: 'var(--font-mono)',
            fontSize: 12.5,
            fontWeight: 700,
            letterSpacing: '.14em',
            color: 'rgb(var(--t) / calc(.75 * var(--t-k)))',
          }}
        >
          {t('ab_version')} {APP_VERSION}
        </div>
        <div style={{ marginTop: 24, fontSize: 15, fontWeight: 600 }}>{t('ab_dev')} Raul Pereira</div>
        <div style={{ marginTop: 22, fontSize: 12, color: 'rgb(var(--t) / calc(.7 * var(--t-k)))' }}>
          © {new Date().getFullYear()} KnowledgeHub
        </div>
      </div>
    </Modal>
  );
}
