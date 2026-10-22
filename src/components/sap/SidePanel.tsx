'use client';

import { useRef, useState } from 'react';
import { usePersistentState, useViewport } from '@/components/ui';
import { BackBar } from '@/components/content/MobilePane';

/**
 * Prototype `panelRes`: the right-hand detail panel of the SAP screens,
 * resizable by its left handle (double-click restores the default width).
 * Tablets: the panel floats over the list (sap.css); phones: it is the whole
 * page with "← Voltar" (`onBack`) on top (D70).
 */
export function SidePanel({
  id,
  def,
  min = 340,
  max = 1300,
  resizeLabel,
  onBack,
  backTitle,
  children,
}: {
  id: string;
  def: number;
  min?: number;
  max?: number;
  resizeLabel: string;
  /** phones: the "← Voltar" bar on top (back to the list) */
  onBack?: () => void;
  backTitle?: React.ReactNode;
  children: React.ReactNode;
}) {
  const phone = useViewport() === 'phone';
  const [saved, setSaved] = usePersistentState<number>(`panel.${id}`, def);
  const [live, setLive] = useState<number | null>(null);
  const w0 = useRef(0);
  const width = live ?? saved;
  const down = (e: React.PointerEvent) => {
    e.preventDefault();
    const x0 = e.clientX;
    w0.current = width;
    let last = width;
    const mv = (ev: PointerEvent) => {
      last = Math.round(Math.max(min, Math.min(max, w0.current - (ev.clientX - x0))));
      setLive(last);
    };
    const up = () => {
      window.removeEventListener('pointermove', mv);
      window.removeEventListener('pointerup', up);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      setLive(null);
      setSaved(last);
    };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('pointermove', mv);
    window.addEventListener('pointerup', up);
  };
  return (
    <>
      <div
        className="kh-sap-handle"
        role="separator"
        aria-orientation="vertical"
        aria-label={resizeLabel}
        title={resizeLabel}
        data-drag={live !== null || undefined}
        onPointerDown={down}
        onDoubleClick={() => setSaved(def)}
      >
        <div />
      </div>
      <div className="kh-sap-panel" style={{ width }}>
        {phone && onBack && <BackBar onBack={onBack} title={backTitle} />}
        {children}
      </div>
    </>
  );
}

/** Saves the SAP GUI shortcut (.sap) — opening it starts SAP GUI on that system. */
export function downloadShortcut(file: string, body: string) {
  const u = URL.createObjectURL(new Blob([body], { type: 'application/x-sapshortcut' }));
  const a = document.createElement('a');
  a.href = u;
  a.download = file;
  a.click();
  setTimeout(() => URL.revokeObjectURL(u), 4000);
}
