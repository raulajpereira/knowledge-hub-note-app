'use client';

import { useEffect, useState } from 'react';

// Focus timer (prototype pomo / hPomoTick): 25 min focus / 5 min break. Kept
// outside React so it keeps running while the user moves to other pages.
type Pomo = { mode: 'focus' | 'break'; left: number; running: boolean };
const FOCUS = 1500;
const BREAK = 300;

let state: Pomo = { mode: 'focus', left: FOCUS, running: false };
let timer: ReturnType<typeof setInterval> | null = null;
const subs = new Set<(p: Pomo) => void>();
let onFocusDone: (() => void) | null = null;

const emit = () => subs.forEach((f) => f(state));
const stop = () => {
  if (timer) clearInterval(timer);
  timer = null;
};

function tick() {
  if (!state.running) return;
  const left = state.left - 1;
  if (left <= 0) {
    stop();
    if (state.mode === 'focus') onFocusDone?.();
    state = {
      mode: state.mode === 'focus' ? 'break' : 'focus',
      left: state.mode === 'focus' ? BREAK : FOCUS,
      running: false,
    };
  } else state = { ...state, left };
  emit();
}

export const pomo = {
  total: () => (state.mode === 'focus' ? FOCUS : BREAK),
  toggle() {
    if (state.running) {
      stop();
      state = { ...state, running: false };
    } else {
      state = { ...state, running: true };
      stop();
      timer = setInterval(tick, 1000);
    }
    emit();
  },
  reset() {
    stop();
    state = { mode: state.mode, left: pomo.total(), running: false };
    emit();
  },
  mode(m: Pomo['mode']) {
    stop();
    state = { mode: m, left: m === 'focus' ? FOCUS : BREAK, running: false };
    emit();
  },
};

export function usePomodoro(whenFocusDone: () => void): Pomo {
  const [p, setP] = useState(state);
  useEffect(() => {
    subs.add(setP);
    onFocusDone = whenFocusDone;
    return () => {
      subs.delete(setP);
    };
  }, [whenFocusDone]);
  return p;
}

export const fmtT = (s: number) =>
  `${Math.floor(Math.max(0, s) / 60)}:${String(Math.max(0, s) % 60).padStart(2, '0')}`;
