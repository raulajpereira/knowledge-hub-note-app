'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { Popover } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import { modColor, normTxMod, parseTxMod, TX_MOD_MAX } from '@/lib/sap';

// Module of a transaction: pick one of the known modules or type a new one
// (it becomes a module of the tenant as soon as a transaction uses it).

export function ModuleCombo({
  value,
  options,
  onChange,
}: {
  value: string;
  options: string[];
  onChange: (module: string) => void;
}) {
  const { t } = useI18n();
  const id = useId();
  const ref = useRef<HTMLInputElement>(null);
  const [val, setVal] = useState(value);
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(-1);
  const [typed, setTyped] = useState(false);
  useEffect(() => setVal(value), [value]);

  const norm = normTxMod(val);
  const valid = parseTxMod(val);
  const list = typed && norm ? options.filter((m) => m.includes(norm)) : options;
  const isNew = !!valid && !options.includes(valid);
  // suggestions, then "create X" when the text is a new module
  const rows: Array<{ m: string; create?: boolean }> = [
    ...list.map((m) => ({ m })),
    ...(isNew ? [{ m: valid, create: true }] : []),
  ];
  const shown = open && rows.length > 0;

  const close = () => {
    setOpen(false);
    setHi(-1);
    setTyped(false);
  };
  const commit = (raw: string) => {
    const m = parseTxMod(raw);
    close();
    if (!m) return setVal(value);
    setVal(m);
    if (m !== value) onChange(m);
  };

  return (
    <>
      <div className="kh-tx-combo">
        <span className="kh-sap-sq" style={{ background: modColor(valid ?? value) }} aria-hidden />
        <input
          ref={ref}
          className="kh-sap-input kh-tx-modin"
          value={val}
          maxLength={TX_MOD_MAX}
          spellCheck={false}
          autoComplete="off"
          placeholder={t('x_modPh')}
          aria-label={t('x_mod')}
          aria-invalid={(typed && !!val.trim() && !valid) || undefined}
          title={t('x_modRule')}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={shown}
          aria-controls={shown ? id : undefined}
          aria-activedescendant={shown && hi >= 0 ? `${id}-${hi}` : undefined}
          onFocus={(e) => {
            setOpen(true);
            e.currentTarget.select();
          }}
          onChange={(e) => {
            setVal(e.target.value.toUpperCase());
            setTyped(true);
            setHi(-1);
            setOpen(true);
          }}
          onBlur={() => commit(val)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
              e.preventDefault();
              if (!open) return setOpen(true);
              if (!rows.length) return;
              const d = e.key === 'ArrowDown' ? 1 : -1;
              setHi((h) => (h + d + rows.length) % rows.length);
            } else if (e.key === 'Enter') {
              e.preventDefault();
              commit(hi >= 0 && rows[hi] ? rows[hi].m : val);
            } else if (e.key === 'Escape' && open) {
              e.preventDefault();
              e.stopPropagation();
              setVal(value);
              close();
            }
          }}
        />
      </div>
      {shown && (
        <Popover
          anchor={ref}
          align="left"
          onClose={close}
          className="kh-taglist kh-tx-modlist"
          width={Math.max(200, ref.current?.offsetWidth ?? 0)}
          maxHeight={280}
          id={id}
          role="listbox"
          aria-label={t('x_mod')}
        >
          {rows.map((r, i) => (
            <button
              key={r.create ? `+${r.m}` : r.m}
              id={`${id}-${i}`}
              type="button"
              role="option"
              tabIndex={-1}
              aria-selected={i === hi || (hi < 0 && !r.create && r.m === value)}
              data-create={r.create || undefined}
              // keep the focus in the box (its blur commits what is typed)
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => commit(r.m)}
            >
              <span className="kh-sap-sq" style={{ background: modColor(r.m) }} />
              {r.create ? t('x_modNew').replace('{x}', r.m) : r.m}
            </button>
          ))}
        </Popover>
      )}
    </>
  );
}
