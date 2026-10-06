'use client';

import type { Dek } from '@/lib/vaultCrypto';

// The unlocked DEK lives only in this module's memory (never in storage, never
// sent anywhere). Moving between pages keeps it; inactivity or "Bloquear"
// clears it (SECURITY.md §4: key only in memory, cleared on lock/close).

let dek: Dek | null = null;
let last = 0;

export const vaultSession = {
  get(lockMinutes: number): Dek | null {
    if (dek && Date.now() - last > lockMinutes * 60_000) vaultSession.lock();
    return dek;
  },
  set(d: Dek) {
    dek = d;
    last = Date.now();
  },
  touch() {
    if (dek) last = Date.now();
  },
  idleMs: () => Date.now() - last,
  lock() {
    if (dek) dek.raw.fill(0);
    dek = null;
  },
};
