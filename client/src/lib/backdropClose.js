// Close a modal only when the press that started the click actually began on
// the backdrop itself. A plain onClick handler fires even when a text
// selection is started inside the modal and the mouse is released outside it
// (the browser's click target follows mouseup, not mousedown), which used to
// close popups and discard whatever the user had just typed.
export function backdropClose(onClose) {
  return (e) => {
    if (e.target === e.currentTarget) onClose();
  };
}
