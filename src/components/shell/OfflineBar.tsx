'use client';

import { useEffect, useState } from 'react';
import { useI18n } from '@/i18n/client';
import { useToast } from '@/components/ui';
import { flushOutbox, OFFLINE_EVENT, pending, registerOffline } from '@/lib/client/offline';

/**
 * Offline: a line at the top while there is no connection (the app shows the
 * copy kept on this device; edits to notes and tasks wait here), and the edits
 * kept are sent as soon as the connection is back.
 */
export function OfflineBar() {
  const { t } = useI18n();
  const toast = useToast();
  const [off, setOff] = useState(false);
  const [n, setN] = useState(0);

  useEffect(() => {
    registerOffline();
    const count = () => void pending().then((q) => setN(q.length));
    const flush = async () => {
      if (!navigator.onLine) return;
      const q = await pending();
      if (!q.length) return;
      const r = await flushOutbox();
      count();
      if (r.sent || r.copies) {
        toast({ message: t('of_sent').replace('{n}', String(r.sent + r.copies)), tone: 'success' });
        window.dispatchEvent(new Event('kh:counts'));
      }
      if (r.copies)
        toast({ message: t('of_copies').replace('{n}', String(r.copies)), tone: 'warning', duration: 9000 });
    };
    const onEvt = (e: Event) => {
      const o = (e as CustomEvent<{ offline: boolean }>).detail?.offline ?? !navigator.onLine;
      setOff(o || !navigator.onLine);
      count();
      if (!o) void flush();
    };
    const online = () => {
      setOff(false);
      void flush();
    };
    const offline = () => setOff(true);
    setOff(!navigator.onLine);
    count();
    void flush();
    window.addEventListener(OFFLINE_EVENT, onEvt);
    window.addEventListener('online', online);
    window.addEventListener('offline', offline);
    const h = setInterval(() => void flush(), 30_000);
    return () => {
      window.removeEventListener(OFFLINE_EVENT, onEvt);
      window.removeEventListener('online', online);
      window.removeEventListener('offline', offline);
      clearInterval(h);
    };
  }, [t, toast]);

  if (!off && !n) return null;
  return (
    <div className="kh-offline" role="status" data-off={off || undefined}>
      <span className="kh-offline__dot" aria-hidden="true" />
      {off ? t('of_off') : t('of_back')}
      {n > 0 && <b>{t('of_pending').replace('{n}', String(n))}</b>}
    </div>
  );
}
