import { useLayoutEffect, useRef } from 'react';

export default function AutoResizeTextarea({ value, style, onInput, ...props }) {
  const ref = useRef(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  return (
    <textarea
      ref={ref}
      value={value}
      rows={1}
      onInput={(e) => {
        e.target.style.height = 'auto';
        e.target.style.height = `${e.target.scrollHeight}px`;
        onInput?.(e);
      }}
      style={{ overflow: 'hidden', resize: 'none', ...style }}
      {...props}
    />
  );
}
