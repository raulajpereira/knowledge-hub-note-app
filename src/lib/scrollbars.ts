// Scrollbars show only while something scrolls: the scrolled element gets
// `data-scrolling` and loses it SCROLL_IDLE_MS after the last scroll event;
// the CSS paints the thumb only then (ui.css). The same rules go into the
// artifacts' own pages (served by /view), with a grey thumb that reads on
// light and dark pages.
export const SCROLL_IDLE_MS = 1200;

export function watchScrollbars(doc: Document): () => void {
  const timers = new Map<Element, ReturnType<typeof setTimeout>>();
  const onScroll = (e: Event) => {
    const el = e.target instanceof Element ? e.target : doc.scrollingElement;
    if (!el) return;
    if (!el.hasAttribute('data-scrolling')) el.setAttribute('data-scrolling', '');
    clearTimeout(timers.get(el));
    timers.set(
      el,
      setTimeout(() => {
        el.removeAttribute('data-scrolling');
        timers.delete(el);
      }, SCROLL_IDLE_MS),
    );
  };
  doc.addEventListener('scroll', onScroll, { capture: true, passive: true });
  return () => {
    doc.removeEventListener('scroll', onScroll, { capture: true });
    for (const t of timers.values()) clearTimeout(t);
  };
}

const FRAME_CSS =
  '::-webkit-scrollbar{width:8px;height:8px;background:transparent}' +
  '::-webkit-scrollbar-thumb{background:transparent;border-radius:8px}' +
  '::-webkit-scrollbar-track,::-webkit-scrollbar-corner{background:transparent}' +
  '[data-scrolling]::-webkit-scrollbar-thumb{background:rgba(128,128,128,.45)}' +
  '[data-scrolling]::-webkit-scrollbar-thumb:hover{background:rgba(128,128,128,.65)}' +
  '@supports (-moz-appearance:none){*{scrollbar-width:thin;scrollbar-color:transparent transparent}' +
  '[data-scrolling]{scrollbar-color:rgba(128,128,128,.45) transparent}}';

// watchScrollbars as plain script for the artifact page (no bundler there)
const FRAME_JS =
  '(function(){var T=new Map();document.addEventListener("scroll",function(e){' +
  'var el=e.target&&e.target.nodeType===1?e.target:document.scrollingElement;if(!el)return;' +
  'el.setAttribute("data-scrolling","");clearTimeout(T.get(el));' +
  `T.set(el,setTimeout(function(){el.removeAttribute("data-scrolling");T.delete(el)},${SCROLL_IDLE_MS}))` +
  '},{capture:true,passive:true})})()';

/**
 * The artifact page as served by /view, with the app's scrollbars: the rules
 * go first in <head>, so the artifact's own scrollbar CSS (if any) wins.
 */
export function withAppScrollbars(html: string): string {
  const inject =
    // closing tags built from parts: the server bundle mangles a literal "</style>"
    '<style data-kh-scrollbars>' +
    FRAME_CSS +
    '<' +
    '/style>' +
    '<script data-kh-scrollbars>' +
    FRAME_JS +
    '<' +
    '/script>';
  const head = /<head\b[^>]*>/i.exec(html);
  if (head)
    return html.slice(0, head.index + head[0].length) + inject + html.slice(head.index + head[0].length);
  const doctype = /^\s*<!doctype[^>]*>/i.exec(html);
  return doctype ? doctype[0] + inject + html.slice(doctype[0].length) : inject + html;
}
