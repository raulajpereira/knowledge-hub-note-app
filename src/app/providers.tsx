'use client';

import { I18nProvider, useI18n } from '@/i18n/client';
import type { Lang } from '@/i18n';
import { ConfirmProvider, ToastProvider } from '@/components/ui';

function UiProviders({ children }: { children: React.ReactNode }) {
  const { t } = useI18n();
  return (
    <ToastProvider dismissLabel={t('ui_dismiss')}>
      <ConfirmProvider>{children}</ConfirmProvider>
    </ToastProvider>
  );
}

export function Providers({ lang, children }: { lang: Lang; children: React.ReactNode }) {
  return (
    <I18nProvider initialLang={lang}>
      <UiProviders>{children}</UiProviders>
    </I18nProvider>
  );
}
