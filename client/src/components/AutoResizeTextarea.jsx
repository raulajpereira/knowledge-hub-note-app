import { forwardRef, useLayoutEffect, useRef } from 'react';

function mergeRefs(refs) {
  return (node) => {
    for (const ref of refs) {
      if (typeof ref === 'function') ref(node);
      else if (ref) ref.current = node;
    }
  };
}

const AutoResizeTextarea = forwardRef(function AutoResizeTextarea({ value, style, onInput, ...props }, forwardedRef) {
  const ref = useRef(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  return (
    <textarea
      ref={mergeRefs([ref, forwardedRef])}
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
});

export default AutoResizeTextarea;
