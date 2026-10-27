'use client';

import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { cx } from './cx';
import { usePersistentState } from './usePersistentState';
import { useViewport } from './useViewport';

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
  /**
   * `fit` tables: when the columns' minimum widths don't fit the block, the
   * columns with a `hide` rank go, lowest rank first (the rest never hide).
   */
  hide?: number;
  /** `fit` tables: the width it may still squeeze to when nothing else can hide (default minWidth). */
  minTight?: number;
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
  /** Phones: each row drawn as a card by this instead of the grid (D70). */
  card?: (row: Row) => React.ReactNode;
  /**
   * Fit the block's width: the widths are shares of the available width
   * (each column at least its minWidth), so there is no sideways scroll nor
   * empty space; dragging an edge moves width between the two neighbours.
   * When even the minimums don't fit, the columns with a `hide` rank go first.
   */
  fit?: boolean;
};

const MIN = 40;

/**
 * `fit` tables: the widths scaled to fill `avail`, each at least its floor
 * (columns that would go under it keep the floor; the rest share what is left).
 */
export function fitWidths(target: number[], floor: number[], avail: number): number[] {
  const fixed = new Set<number>();
  let out = target.slice();
  for (let it = 0; it <= target.length; it++) {
    const free = target.map((_, i) => i).filter((i) => !fixed.has(i));
    const used = [...fixed].reduce((a, i) => a + floor[i]!, 0);
    const sum = free.reduce((a, i) => a + target[i]!, 0) || 1;
    const room = Math.max(0, avail - used);
    let changed = false;
    out = target.map((w, i) => (fixed.has(i) ? floor[i]! : (w * room) / sum));
    for (const i of free)
      if (out[i]! < floor[i]!) {
        fixed.add(i);
        changed = true;
      }
    if (!changed) break;
  }
  return out.map((w, i) => Math.max(floor[i]!, Math.floor(w)));
}

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
  card,
  fit,
}: Props<Row>) {
  const phone = useViewport() === 'phone';
  const defaults = useMemo(() => columns.map((c) => c.width), [columns]);
  const [saved, setSaved, resetSaved] = usePersistentState<number[] | null>(`rt.${id}`, null);
  const [live, setLive] = useState<number[] | null>(null);
  const headRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [avail, setAvail] = useState<number | null>(null);
  // fit: the block's width decides which columns there is room for
  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!fit || !el) return;
    const measure = () => setAvail(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [fit, phone, card]);

  const widths = live ?? (saved && saved.length === columns.length ? saved : defaults);
  const shown = useMemo(() => {
    const all = columns.map((_, i) => i);
    if (!fit || avail === null) return all;
    const out = new Set(all);
    const ranked = all
      .filter((i) => columns[i]!.hide !== undefined)
      .sort((a, b) => columns[a]!.hide! - columns[b]!.hide!);
    const need = () => [...out].reduce((a, i) => a + (columns[i]!.minWidth ?? MIN), 0);
    for (const i of ranked) {
      if (need() <= avail) break;
      out.delete(i);
    }
    return all.filter((i) => out.has(i));
  }, [fit, avail, columns]);
  // still too wide: the columns go down to their tight minimums
  const tight = fit && avail !== null && shown.reduce((a, i) => a + (columns[i]!.minWidth ?? MIN), 0) > avail;
  const tightOf = (i: number) => columns[i]?.minTight ?? columns[i]?.minWidth ?? MIN;
  // widths the person set may go down to the tight minimum; the defaults keep the comfortable one
  const minOf = (i: number) => (tight || saved || live ? tightOf(i) : (columns[i]?.minWidth ?? MIN));
  const hasGrow = columns.some((c) => c.grow);
  const fitPx =
    fit && avail !== null
      ? fitWidths(
          shown.map((i) => widths[i] ?? MIN),
          shown.map(minOf),
          avail,
        )
      : null;
  const template = fitPx
    ? fitPx.map((w, k) => (k === fitPx.length - 1 ? `minmax(${w}px,1fr)` : `${w}px`)).join(' ')
    : fit
      ? shown.map((i) => `minmax(${minOf(i)}px,${Math.max(1, Math.round(widths[i] ?? MIN))}fr)`).join(' ')
      : widths
          .map((w, i) =>
            columns[i]?.grow || (!hasGrow && i === columns.length - 1)
              ? `minmax(${Math.round(w)}px,1fr)`
              : `${Math.round(w)}px`,
          )
          .join(' ');
  const fitMin = fit ? shown.reduce((a, i) => a + minOf(i), 0) : undefined;

  /** fit: the edge between two shown columns moves width from one to the other (the total stays). */
  const startFitResize = (k: number, e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const head = headRef.current;
    if (!head) return;
    const zoom = head.getBoundingClientRect().width / (head.offsetWidth || 1) || 1;
    const px = [...head.children].map((el) => (el as HTMLElement).getBoundingClientRect().width / zoom);
    const i = shown[k]!;
    const base = widths.map((w, x) => {
      const at = shown.indexOf(x);
      return at >= 0 ? px[at]! : w;
    });
    // growing takes the width from the columns on the right (nearest first, down
    // to their minimums); shrinking gives it to the next one
    const right = shown.slice(k + 1);
    const slack = right.reduce((acc, x) => acc + Math.max(0, base[x]! - tightOf(x)), 0);
    const x0 = e.clientX;
    const line = document.createElement('div');
    line.className = 'kh-resize-line';
    line.style.left = `${e.clientX}px`;
    document.body.appendChild(line);
    let current = base;
    const move = (ev: PointerEvent) => {
      const d = Math.max(tightOf(i) - base[i]!, Math.min(slack, (ev.clientX - x0) / zoom));
      const next = [...base];
      next[i] = base[i]! + d;
      if (d < 0) next[right[0]!] = base[right[0]!]! - d;
      else {
        let rest = d;
        for (const x of right) {
          const take = Math.min(rest, Math.max(0, base[x]! - tightOf(x)));
          next[x] = base[x]! - take;
          rest -= take;
        }
      }
      current = next;
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

  if (card && phone)
    return (
      <div className={cx('kh-table-cards', className)} role="list">
        {rows.length === 0 ? (
          <div className="kh-table__empty">{emptyLabel}</div>
        ) : (
          rows.map((row) => {
            const k = rowKey(row);
            return (
              <div
                key={k}
                role="listitem"
                className="kh-table-card"
                aria-current={selectedKey === k || undefined}
                data-on={selectedKey === k || undefined}
                tabIndex={onRowClick ? 0 : undefined}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                onKeyDown={
                  onRowClick
                    ? (e) => {
                        if (e.key === 'Enter' && e.target === e.currentTarget) onRowClick(row);
                      }
                    : undefined
                }
              >
                {card(row)}
              </div>
            );
          })
        )}
      </div>
    );

  return (
    <div ref={boxRef} className={cx('kh-well', 'kh-table', className)} style={{ maxHeight }} data-zs="">
      <div role="table" style={{ minWidth: fit ? fitMin : minWidth }}>
        <div ref={headRef} role="row" className="kh-table__head" style={{ gridTemplateColumns: template }}>
          {(fit ? shown.map((i) => columns[i]!) : columns).map((c, k) => {
            const i = fit ? shown[k]! : k;
            const last = fit ? k === shown.length - 1 : i === columns.length - 1;
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
                {!last && (
                  <span
                    className="kh-table__grip"
                    title={resizeLabel}
                    aria-hidden="true"
                    onPointerDown={(e) => (fit ? startFitResize(k, e) : startResize(i, e))}
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
                {(fit ? shown.map((i) => columns[i]!) : columns).map((c) => (
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
