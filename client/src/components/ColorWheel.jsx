import { useCallback, useRef } from 'react';

const STOPS = Array.from({ length: 13 }, (_, i) => `oklch(0.6 0.19 ${i * 30}) ${(i / 12) * 100}%`).join(', ');

export default function ColorWheel({ hue, onChange, size = 96 }) {
  const ref = useRef(null);

  const setFromEvent = useCallback(
    (e) => {
      const rect = ref.current.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = e.clientX - cx;
      const dy = e.clientY - cy;
      let angle = (Math.atan2(dx, -dy) * 180) / Math.PI;
      angle = (angle + 360) % 360;
      onChange(Math.round(angle));
    },
    [onChange]
  );

  const onMouseDown = (e) => {
    e.preventDefault();
    setFromEvent(e);
    const onMove = (moveEvent) => setFromEvent(moveEvent);
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const radius = size / 2;
  const markerR = radius - 10;
  const rad = (hue * Math.PI) / 180;
  const markerX = radius + markerR * Math.sin(rad);
  const markerY = radius - markerR * Math.cos(rad);

  return (
    <div
      ref={ref}
      onMouseDown={onMouseDown}
      title="Drag to pick a hue"
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        position: 'relative',
        cursor: 'crosshair',
        flexShrink: 0,
        background: `conic-gradient(from 0deg, ${STOPS})`,
        boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.15)',
      }}
    >
      <div
        style={{
          position: 'absolute',
          left: markerX - 9,
          top: markerY - 9,
          width: 18,
          height: 18,
          borderRadius: '50%',
          background: `oklch(0.6 0.19 ${hue})`,
          border: '3px solid #fff',
          boxShadow: '0 1px 4px rgba(0,0,0,0.45)',
          pointerEvents: 'none',
        }}
      />
    </div>
  );
}
