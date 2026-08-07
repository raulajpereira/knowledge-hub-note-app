import { useState } from 'react';

// A vertical drag handle between two panes (e.g. a page's list pane and its
// detail pane) — same visual/drag pattern as AppLayout's own sidebar-resize
// handle, generalized for reuse inside any page.
export default function PanelDivider({ onResize, onResizeEnd, theme }) {
  const [dragging, setDragging] = useState(false);

  const onPointerDown = (e) => {
    e.preventDefault();
    let lastX = e.clientX;
    setDragging(true);
    const onMove = (moveEvent) => {
      onResize(moveEvent.clientX - lastX);
      lastX = moveEvent.clientX;
    };
    const onUp = () => {
      setDragging(false);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      onResizeEnd?.();
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  return (
    <>
      <div
        onPointerDown={onPointerDown}
        style={{
          width: 5, flexShrink: 0, cursor: 'col-resize', background: dragging ? theme.accent : 'transparent',
          position: 'relative', zIndex: 5, marginLeft: -2, marginRight: -3, borderRadius: 3,
        }}
      />
      {dragging && <div style={{ position: 'fixed', inset: 0, zIndex: 999, cursor: 'col-resize' }} />}
    </>
  );
}
