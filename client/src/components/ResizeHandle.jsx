import { useRef } from 'react';

// Draggable column-edge handle: onResize fires continuously with the delta
// since the last event (for live visual feedback), onResizeEnd fires once
// when the drag finishes (for persisting the final width without spamming
// the API on every pixel of movement).
export default function ResizeHandle({ onResize, onResizeEnd }) {
  const dragRef = useRef(null);
  const onMouseDown = (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragRef.current = { startX: e.clientX };
    const onMove = (moveEvent) => {
      if (!dragRef.current) return;
      onResize(moveEvent.clientX - dragRef.current.startX);
      dragRef.current.startX = moveEvent.clientX;
    };
    const onUp = () => {
      dragRef.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      onResizeEnd?.();
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };
  return (
    <div
      onMouseDown={onMouseDown}
      style={{ position: 'absolute', right: -3, top: 0, bottom: 0, width: 6, cursor: 'col-resize', zIndex: 1 }}
    />
  );
}
