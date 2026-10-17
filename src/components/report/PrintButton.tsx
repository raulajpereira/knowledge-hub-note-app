'use client';

/** "Imprimir / guardar PDF": the browser's print dialog (save as PDF from there). */
export function PrintButton({ label }: { label: string }) {
  return (
    <button type="button" className="kh-rep-print" onClick={() => window.print()}>
      {label}
    </button>
  );
}
