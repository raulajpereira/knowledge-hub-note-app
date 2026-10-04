'use client';

import { useMemo, useRef, useState } from 'react';
import { cx } from './cx';
import { usePersistentState } from './usePersistentState';

export type Column<Row> = {
  key: string;
  label: React.ReactNode;
  /** Default width in px. */
  width: number;
  /** Takes the leftover space (minmax(width, 1fr)). Default: the last column. */
  grow?: boolean;
  minWidth?: number;
  sortable?: boolean;
  render: (row: Row) => React.ReactNode;
  cellClassName?: string;
};

export type SortState = { key: string; dir: 'asc' | 'desc' } | null;

type Props<Row> = {
  /** Persists column widths per table (prototype data-rth key). */
  id: string;
  columns: ReadonlyArray<Column<Row>>;
  rows: ReadonlyArray<Row>;
  rowKey: (row: Row) => string;
  onRowClick?: (row: Row) => void;
  selectedKey?: string | null;
  sort?: SortState;
  onSortChange?: (sort: SortState) => void;
  emptyLabel: React.ReactNode;
  resizeLabel: string;
  /** Horizontal scroll kicks in below this width. */
  minWidth?: number;
  maxHeight?: number | string;
  className?: string;
};

const MIN = 40;

/**
 * Table with drag-to-resize columns (prototype `initRT`): drag a header edge,
 * double-click it to restore defaults; widths persist per table. Columns
 * are a CSS grid, so header and rows always line up.
 */
export function ResizableTable<Row>({
  id,
  columns,
  rows,
  rowKey,
  onRowClick,
  selectedKey,
  sort,
  onSortChange,
  emptyLabel,
  resizeLabel,
  minWidth,
  maxHeight,
  className,
}: Props<Row>) {
  const defaults = useMemo(() => columns.map((c) => c.width), [columns]);
  const [saved, setSaved, resetSaved] = usePersistentState<number[] | null>(`rt.${id}`, null);
  const [live, setLive] = useState<number[] | null>(null);
  const headRef = useRef<HTMLDivElement>(null);

  const widths = live ?? (saved && saved.length === columns.length ? saved : defaults);
  const hasGrow = columns.some((c) => c.grow);
  const template = widths
    .map((w, i) =>
      columns[i]?.grow || (!hasGrow && i === columns.length - 1)
        ? `minmax(${Math.round(w)}px,1fr)`
        : `${Math.round(w)}px`,
    )
    .join(' ');

  const startResize = (i: number, e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Headers may be zoomed (UI scale); convert screen px back to CSS px.
    const head = headRef.current;
    const zoom = head ? head.getBoundingClientRect().width / (head.offsetWidth || 1) || 1 : 1;
    const x0 = e.clientX;
    const start = [...widths];
    const w0 = start[i] ?? MIN;
    const min = columns[i]?.minWidth ?? MIN;
    const line = document.createElement('div');
    line.className = 'kh-resize-line';
    line.style.left = `${e.clientX}px`;
    document.body.appendChild(line);
    let current = start;
    const move = (ev: PointerEvent) => {
      current = start.map((w, j) => (j === i ? Math.max(min, w0 + (ev.clientX - x0) / zoom) : w));
      setLive(current);
      line.style.left = `${ev.clientX}px`;
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      line.remove();
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      setSaved(current.map(Math.round));
      setLive(null);
    };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const toggleSort = (key: string) => {
    if (!onSortChange) return;
    if (sort?.key !== key) onSortChange({ key, dir: 'asc' });
    else if (sort.dir === 'asc') onSortChange({ key, dir: 'desc' });
    else onSortChange(null);
  };

  return (
    <div className={cx('kh-well', 'kh-table', className)} style={{ maxHeight }} data-zs="">
      <div role="table" style={{ minWidth }}>
        <div ref={headRef} role="row" className="kh-table__head" style={{ gridTemplateColumns: template }}>
          {columns.map((c, i) => {
            const active = sort?.key === c.key;
            const arrow = active ? (sort?.dir === 'asc' ? '▲' : '▼') : '';
            const content = (
              <>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.label}</span>
                <span style={{ fontSize: 10 }}>{arrow}</span>
              </>
            );
            return (
              <div
                key={c.key}
                role="columnheader"
                aria-sort={active ? (sort?.dir === 'asc' ? 'ascending' : 'descending') : undefined}
                style={{ position: 'relative', minWidth: 0, height: '100%' }}
              >
                {c.sortable && onSortChange ? (
                  <button
                    type="button"
                    className="kh-table__th"
                    style={{ width: '100%' }}
                    onClick={() => toggleSort(c.key)}
                  >
                    {content}
                  </button>
                ) : (
                  <div className="kh-table__th">{content}</div>
                )}
                {i < columns.length - 1 && (
                  <span
                    className="kh-table__grip"
                    title={resizeLabel}
                    aria-hidden="true"
                    onPointerDown={(e) => startResize(i, e)}
                    onDoubleClick={resetSaved}
                  />
                )}
              </div>
            );
          })}
        </div>
        {rows.length === 0 ? (
          <div className="kh-table__empty">{emptyLabel}</div>
        ) : (
          rows.map((row) => {
            const k = rowKey(row);
            return (
              <div
                key={k}
                role="row"
                aria-selected={selectedKey === k || undefined}
                tabIndex={onRowClick ? 0 : undefined}
                className={cx('kh-table__row', onRowClick && 'kh-table__row--click')}
                style={{ gridTemplateColumns: template }}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                onKeyDown={
                  onRowClick
                    ? (e) => {
                        if (e.key === 'Enter') onRowClick(row);
                      }
                    : undefined
                }
              >
                {columns.map((c) => (
                  <div key={c.key} role="cell" className={cx('kh-table__td', c.cellClassName)}>
                    {c.render(row)}
                  </div>
                ))}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
