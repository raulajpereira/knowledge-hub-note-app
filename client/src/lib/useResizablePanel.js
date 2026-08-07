import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../api.js';

// A single persisted panel width (e.g. a page's list pane, next to a flex-1
// detail pane) — same storage/sync pattern as AppLayout's own sidebarWidth,
// just generalized to any page. `key` should be unique per pane, e.g.
// "notes.list" or "codeLibrary.folders".
export function useResizablePanel(key, defaultWidth, { min = 220, max = 520 } = {}) {
  const { user, updateUserSettings } = useAuth();
  const [width, setWidth] = useState(defaultWidth);
  const widthRef = useRef(defaultWidth);

  useEffect(() => {
    const saved = user?.settings?.panelWidths?.[key];
    const next = saved ?? defaultWidth;
    setWidth(next);
    widthRef.current = next;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.settings?.panelWidths?.[key], key]);

  const onResize = (deltaX) => {
    const next = Math.min(max, Math.max(min, widthRef.current + deltaX));
    widthRef.current = next;
    setWidth(next);
  };

  const onResizeEnd = () => {
    const merged = { ...(user?.settings?.panelWidths || {}), [key]: widthRef.current };
    api.updateSettings({ panelWidths: merged }).then(({ settings }) => updateUserSettings(settings));
  };

  return { width, onResize, onResizeEnd };
}
