import { notFound } from 'next/navigation';
import { CatalogShell } from './CatalogShell';

export const metadata = { title: 'KnowledgeHub · Componentes', robots: { index: false } };
// Checked per request so KH_UI_CATALOG can be toggled without a rebuild.
export const dynamic = 'force-dynamic';

// Dev tool: always on in development, opt-in (KH_UI_CATALOG=true) elsewhere.
export default function UiLayout({ children }: { children: React.ReactNode }) {
  const enabled = process.env.NODE_ENV !== 'production' || process.env.KH_UI_CATALOG === 'true';
  if (!enabled) notFound();
  return <CatalogShell>{children}</CatalogShell>;
}
