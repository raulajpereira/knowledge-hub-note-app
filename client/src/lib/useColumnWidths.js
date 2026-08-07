import { useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../api.js';

export const MIN_COLUMN_WIDTH = 60;

// Resizable table columns whose widths persist across sessions/devices via
// Settings.columnWidths ({ [pageKey]: { [columnKey]: widthPx } }). The width
// is only PATCHed to the server once the drag ends (see ResizeHandle's
// onResizeEnd), not on every pixel of movement.
export function useColumnWidths(pageKey, defaultColumns) {
  const { user, updateUserSettings } = useAuth();
  const saved = user?.settings?.columnWidths?.[pageKey];

  const [columns, setColumns] = useState(() =>
    defaultColumns.map((c) => ({ ...c, width: saved?.[c.key] ?? c.width }))
  );
  const pendingRef = useRef(null);

  const resizeColumn = (index, deltaX) => {
    setColumns((prev) => {
      const next = prev.map((c, i) =>
        i === index ? { ...c, width: Math.max(c.minWidth || MIN_COLUMN_WIDTH, c.width + deltaX) } : c
      );
      pendingRef.current = next;
      return next;
    });
  };

  const persistColumnWidths = () => {
    const cols = pendingRef.current;
    if (!cols) return;
    pendingRef.current = null;
    const widths = Object.fromEntries(cols.map((c) => [c.key, c.width]));
    const merged = { ...(user?.settings?.columnWidths || {}), [pageKey]: widths };
    api.updateSettings({ columnWidths: merged }).then(({ settings }) => updateUserSettings(settings));
  };

  return { columns, resizeColumn, persistColumnWidths };
}
