import type { KeyboardEvent } from 'react';

/**
 * Enter / Space for a clickable element that isn't a <button> (role="button",
 * tabIndex 0). Keys pressed on nested controls are left to them.
 */
export function onActivateKey(fn: () => void) {
  return (e: KeyboardEvent) => {
    if (e.target !== e.currentTarget || (e.key !== 'Enter' && e.key !== ' ')) return;
    e.preventDefault();
    fn();
  };
}
