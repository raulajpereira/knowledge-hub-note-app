import { redirect } from 'next/navigation';
import { getAuth } from '@/server/auth/request';
import { env } from '@/lib/env';
import { plansFull } from '@/server/admin/plans';
import { Landing, type LandingPlan } from '@/components/landing/Landing';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'KnowledgeHub — notas, tarefas, código, SAP e equipas num só lugar',
  description:
    'Notas, tarefas, cofre de palavras-passe, código, SAP e gestão de equipas num espaço seguro, com dados alojados na UE.',
};

// Root: signed in → the app; otherwise the public landing page (real plans and prices).
export default async function Home() {
  if (await getAuth()) redirect('/app');
  const full = await plansFull();
  const plans: LandingPlan[] = full.plans.map((p) => ({
    code: p.code,
    color: p.color,
    price: p.price,
    disc: p.disc,
    trialEnabled: p.trialEnabled,
    trialDays: p.trialDays,
    groups: full.groups
      .map((g) => ({ g, n: g.modules.filter((m) => p.modules.includes(m.id)).length }))
      .filter((x) => x.n > 0)
      .map((x) => ({ pt: x.g.pt, en: x.g.en, all: x.n === x.g.modules.length })),
  }));
  const e = env();
  return (
    <Landing
      plans={plans}
      entity={{ name: e.LEGAL_ENTITY_NAME || 'KnowledgeHub', email: e.LEGAL_CONTACT_EMAIL ?? '' }}
    />
  );
}
