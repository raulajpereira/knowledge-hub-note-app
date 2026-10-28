'use client';

import { useId, useRef, useState } from 'react';
import { Popover } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import { MG_PJ_MOD_MAX } from '@/lib/mg';
import { modColor, normTxMod, parseTxMod, SAP_MODULE_IDS, SAP_MODULES, TX_MOD_MAX } from '@/lib/sap';
import { css } from './css';

// SAP modules of a project (Projetos: new project and detail): the chosen
// modules as coloured chips with ×, a search box after them and a list of
// the known modules (SAP_MODULES, then the tenant's own) with a tick on the
// chosen ones. ↑/↓ + Enter toggle, Backspace in the empty box removes the
// last chip, "Outro módulo…" (or typing a name that is not in the list)
// adds a module of the tenant's own.

const DESC = new Map(SAP_MODULES);

/** The modules offered: SAP_MODULES first, then the ones the tenant typed (alphabetical). */
export function moduleOptions(used: Iterable<string>) {
  const own = new Set<string>();
  for (const m of used) if (m && !DESC.has(m)) own.add(m);
  return [...SAP_MODULE_IDS, ...[...own].sort((a, b) => a.localeCompare(b))];
}

/** A tinted chip in the module's colour (the Transações chips). */
export const modChip = (m: string, small?: boolean) =>
  css(
    `display:inline-flex;align-items:center;gap:5px;flex:none;max-width:100%;box-sizing:border-box;border-radius:999px;border:1px solid ${modColor(m).replace(')', ' / .5)')};background:${modColor(m).replace(')', ' / .2)')};color:var(--ink);font-family:'Geist Mono',monospace;font-weight:600;white-space:nowrap;${small ? 'height:20px;padding:0 7px;font-size:10.5px;' : 'height:26px;padding:0 4px 0 10px;font-size:12px;'}`,
  );

/** Read-only chips (project list and cards), the rest as "+N". */
export function ModChips({
  mods: all,
  first,
  max = 4,
}: {
  mods: readonly string[];
  /** shown first (the module the list is filtered by) */
  first?: string;
  max?: number;
}) {
  if (!all.length) return null;
  const mods = first && all.includes(first) ? [first, ...all.filter((m) => m !== first)] : all;
  const shown = mods.length > max ? mods.slice(0, max - 1) : mods;
  return (
    <span style={css('display:flex;flex-wrap:wrap;gap:4px;min-width:0;')}>
      {shown.map((m) => (
        <span key={m} style={modChip(m, true)}>
          {m}
        </span>
      ))}
      {shown.length < mods.length && (
        <span
          title={mods.slice(shown.length).join(', ')}
          style={css(
            "display:inline-flex;align-items:center;height:20px;padding:0 7px;border-radius:999px;border:1px solid rgb(var(--w) / .16);font-family:'Geist Mono',monospace;font-size:10.5px;font-weight:600;color:rgb(var(--t) / calc(.75 * var(--t-k)));",
          )}
        >
          +{mods.length - shown.length}
        </span>
      )}
    </span>
  );
}

export function ModulePicker({
  value,
  options,
  onChange,
  label,
}: {
  value: readonly string[];
  options: readonly string[];
  onChange: (mods: string[]) => void;
  label: string;
}) {
  const { t, lang } = useI18n();
  const id = useId();
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(-1);
  /** "Outro módulo…": the box takes the name of a new module */
  const [custom, setCustom] = useState(false);

  const chosen = new Set(value);
  const full = value.length >= MG_PJ_MOD_MAX;
  const norm = normTxMod(q);
  const typed = parseTxMod(q);
  const desc = (m: string) => {
    const d = DESC.get(m);
    return d ? d[lang === 'en' ? 'en' : 'pt'] : t('mgm_modOwn');
  };
  const lq = q.trim().toLowerCase();
  const list = custom
    ? []
    : norm
      ? options.filter((m) => m.includes(norm) || desc(m).toLowerCase().includes(lq))
      : options;
  // "Outro módulo…" takes any valid name (a known one too); typing in the list only offers new ones
  const canCreate = !!typed && !chosen.has(typed) && !full && (custom || !options.includes(typed));
  type Row = { m: string; kind: 'opt' | 'new' | 'other' };
  const rows: Row[] = [
    ...list.map((m): Row => ({ m, kind: 'opt' })),
    ...(canCreate ? [{ m: typed, kind: 'new' } as Row] : []),
    ...(!norm && !custom && !full ? [{ m: '', kind: 'other' } as Row] : []),
  ];

  const reset = () => {
    setQ('');
    setHi(-1);
    setCustom(false);
  };
  const close = () => {
    setOpen(false);
    reset();
  };
  const toggle = (m: string) => {
    if (chosen.has(m)) onChange(value.filter((x) => x !== m));
    else if (!full) onChange([...value, m]);
  };
  const pick = (r: Row) => {
    if (r.kind === 'other') {
      setCustom(true);
      setQ('');
      setHi(-1);
    } else {
      toggle(r.m);
      reset();
    }
    input.current?.focus();
  };
  const shown = open && (rows.length > 0 || custom || !!norm);

  return (
    <>
      <div
        ref={box}
        className="mg-modbox"
        role="group"
        aria-label={label}
        onClick={() => input.current?.focus()}
        style={css(
          'display:flex;flex-wrap:wrap;align-items:center;gap:6px;min-height:38px;padding:5px 6px;border-radius:12px;border:1px solid rgb(var(--w) / .16);background-color:rgb(var(--d) / calc(.25 * var(--d-k)));box-sizing:border-box;cursor:text;',
        )}
      >
        {value.map((m) => (
          <span key={m} className="mg-modchip" style={modChip(m)} title={desc(m)}>
            {m}
            <button
              type="button"
              aria-label={t('mgm_modRemove').replace('{x}', m)}
              title={t('mgm_modRemove').replace('{x}', m)}
              onClick={(e) => {
                e.stopPropagation();
                toggle(m);
                input.current?.focus();
              }}
              style={css(
                'width:20px;height:20px;display:flex;align-items:center;justify-content:center;padding:0;border:0;border-radius:50%;background:transparent;color:rgb(var(--t) / calc(.7 * var(--t-k)));font-size:14px;line-height:1;cursor:pointer;',
              )}
            >
              ×
            </button>
          </span>
        ))}
        <input
          ref={input}
          value={q}
          maxLength={custom ? TX_MOD_MAX : 40}
          spellCheck={false}
          autoComplete="off"
          disabled={full && !value.length}
          placeholder={
            custom
              ? t('mgm_modOtherPh')
              : full
                ? t('mgm_modMax').replace('{n}', String(MG_PJ_MOD_MAX))
                : value.length
                  ? t('mgm_modsMore')
                  : t('mgm_modsAdd')
          }
          aria-label={custom ? t('mgm_modOtherPh') : label}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={shown}
          aria-controls={shown ? id : undefined}
          aria-activedescendant={shown && hi >= 0 ? `${id}-${hi}` : undefined}
          title={custom ? t('mgm_modRule') : undefined}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQ(custom ? e.target.value.toUpperCase() : e.target.value);
            setHi(custom ? -1 : 0);
            setOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
              e.preventDefault();
              if (!open) return setOpen(true);
              if (!rows.length) return;
              const d = e.key === 'ArrowDown' ? 1 : -1;
              setHi((h) => (h + d + rows.length) % rows.length);
            } else if (e.key === 'Enter') {
              e.preventDefault();
              const r = hi >= 0 ? rows[hi] : canCreate ? { m: typed, kind: 'new' as const } : undefined;
              if (r) pick(r);
            } else if (e.key === 'Backspace' && !q && value.length) {
              onChange(value.slice(0, -1));
            } else if (e.key === 'Tab') close();
          }}
          style={css(
            'flex:1;min-width:120px;height:26px;padding:0 6px;border:0;background:transparent;color:var(--ink);font:inherit;font-size:13.5px;outline:none;',
          )}
        />
      </div>
      {shown && (
        <Popover
          anchor={box}
          align="left"
          onClose={close}
          className="kh-taglist mg-modlist"
          width={Math.max(260, box.current?.offsetWidth ?? 0)}
          maxHeight={300}
          id={id}
          role="listbox"
          aria-label={label}
          aria-multiselectable
        >
          {rows.map((r, i) => (
            <button
              key={`${r.kind}:${r.m}`}
              id={`${id}-${i}`}
              type="button"
              role="option"
              tabIndex={-1}
              aria-selected={r.kind === 'opt' ? chosen.has(r.m) : false}
              data-hi={i === hi || undefined}
              data-kind={r.kind}
              disabled={r.kind === 'opt' && full && !chosen.has(r.m)}
              // keep the focus in the box
              onMouseDown={(e) => e.preventDefault()}
              onMouseMove={() => i !== hi && setHi(i)}
              onClick={() => pick(r)}
            >
              {r.kind === 'other' ? (
                <>
                  <span className="mg-modlist__plus" aria-hidden>
                    +
                  </span>
                  {t('mgm_modOther')}
                </>
              ) : (
                <>
                  <span className="mg-modlist__sq" style={{ background: modColor(r.m) }} aria-hidden />
                  <span className="mg-modlist__id">
                    {r.kind === 'new' ? t('mgm_modNew').replace('{x}', r.m) : r.m}
                  </span>
                  {r.kind === 'opt' && <span className="mg-modlist__desc">{desc(r.m)}</span>}
                  {r.kind === 'opt' && chosen.has(r.m) && (
                    <span className="mg-modlist__tick" aria-hidden>
                      ✓
                    </span>
                  )}
                </>
              )}
            </button>
          ))}
          {custom && !canCreate && (
            <span className="mg-modlist__note">
              {typed && chosen.has(typed) ? t('mgm_modExists').replace('{x}', typed) : t('mgm_modRule')}
            </span>
          )}
          {!custom && norm && !rows.length && <span className="mg-modlist__note">{t('mgm_modNoMatch')}</span>}
        </Popover>
      )}
    </>
  );
}
