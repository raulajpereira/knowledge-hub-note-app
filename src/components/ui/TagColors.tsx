'use client';

import { createContext, useCallback, useContext } from 'react';
import { tagStyle, type TagColorMap } from '@/lib/tags';

// The tag colours chosen on the Tags page (prefs.tagColors), provided once by
// the app shell for every chip. Without a provider (landing, catalogue) tags
// keep their automatic colour.

const NONE: TagColorMap = {};
const TagColorsContext = createContext<TagColorMap>(NONE);

export function TagColorsProvider({ value, children }: { value?: TagColorMap; children: React.ReactNode }) {
  return <TagColorsContext.Provider value={value ?? NONE}>{children}</TagColorsContext.Provider>;
}

export function useTagColors(): TagColorMap {
  return useContext(TagColorsContext);
}

/** tagStyle() with the user's chosen colours. */
export function useTagStyle(): (name: string) => React.CSSProperties {
  const chosen = useTagColors();
  return useCallback((name: string) => tagStyle(name, chosen), [chosen]);
}
