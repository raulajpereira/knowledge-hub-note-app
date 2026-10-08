'use client';

import { useRouter } from 'next/navigation';
import { PricingModal } from './PricingModal';

/** /app/pricing: the plans window over the shell; closing goes back (or home). */
export function PricingPage() {
  const router = useRouter();
  return (
    <PricingModal
      onClose={() => {
        if (window.history.length > 1) router.back();
        else router.push('/app');
      }}
    />
  );
}
