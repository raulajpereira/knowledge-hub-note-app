/**
 * The interface scale (Settings → Aparência) is a CSS `zoom` on <body>.
 * getBoundingClientRect() and window.innerWidth/innerHeight are screen pixels,
 * while top/left of a fixed element inside the zoomed body are CSS pixels that
 * get multiplied by the zoom: divide by it, or a popover lands off-screen.
 */
export function bodyZoom(): number {
  if (typeof document === 'undefined') return 1;
  const z = parseFloat(getComputedStyle(document.body).zoom);
  return Number.isFinite(z) && z > 0 ? z : 1;
}

/** An element's box and the window's size, in the body's CSS pixels. */
export function cssRect(el: Element) {
  const z = bodyZoom();
  const r = el.getBoundingClientRect();
  return {
    left: r.left / z,
    right: r.right / z,
    top: r.top / z,
    bottom: r.bottom / z,
    width: r.width / z,
    height: r.height / z,
    vw: window.innerWidth / z,
    vh: window.innerHeight / z,
  };
}
