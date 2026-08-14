// Runs inside the page (injected via chrome.scripting.executeScript, isolated
// world — shares the DOM but not the page's own JS globals) alongside
// vendor/Readability.js, which is injected as the file right before this one
// so the `Readability` class is already a global here. Returns a plain object
// (structured-cloned back to the popup), never a DOM node.
(function extractPageContent() {
  function stripUnwanted(root) {
    root.querySelectorAll('script, style, noscript, iframe, svg, form, button, [aria-hidden="true"]').forEach((el) => el.remove());
    root.querySelectorAll('*').forEach((el) => {
      [...el.attributes].forEach((attr) => {
        // Inline event handlers (onclick, onerror, ...) — dead weight once
        // this HTML lives in a note, and never safe to carry into innerHTML
        // elsewhere in the app.
        if (/^on/i.test(attr.name)) el.removeAttribute(attr.name);
      });
    });
    return root;
  }

  // Images/links in the extracted HTML are often relative to the source
  // page ("/img/foo.png") — meaningless once this HTML is shown anywhere
  // else, so resolve them against the page's own base URL while we still
  // have it.
  function absolutize(root, baseUrl) {
    root.querySelectorAll('img[src]').forEach((img) => {
      try { img.setAttribute('src', new URL(img.getAttribute('src'), baseUrl).href); } catch { /* leave as-is */ }
    });
    root.querySelectorAll('a[href]').forEach((a) => {
      try { a.setAttribute('href', new URL(a.getAttribute('href'), baseUrl).href); } catch { /* leave as-is */ }
    });
    return root;
  }

  function cleanHtml(html, baseUrl) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    absolutize(stripUnwanted(doc.body), baseUrl);
    return doc.body.innerHTML.trim();
  }

  const selection = window.getSelection();
  let selectedHtml = null;
  if (selection && !selection.isCollapsed && selection.rangeCount > 0) {
    const container = document.createElement('div');
    for (let i = 0; i < selection.rangeCount; i++) container.appendChild(selection.getRangeAt(i).cloneContents());
    if (container.textContent.trim()) selectedHtml = container.innerHTML;
  }

  let title = document.title;
  let articleHtml = null;

  if (!selectedHtml && typeof Readability !== 'undefined') {
    try {
      // Readability mutates whatever it's given, so hand it a clone —
      // never the live page.
      const article = new Readability(document.cloneNode(true)).parse();
      if (article && article.content) {
        title = article.title || title;
        articleHtml = article.content;
      }
    } catch {
      // Some pages (SPA shells, non-article content) just aren't
      // Readability-shaped — the body-innerHTML fallback below covers them.
    }
  }

  const rawHtml = selectedHtml || articleHtml || document.body.innerHTML;
  const html = cleanHtml(rawHtml, document.baseURI);

  return {
    title,
    html,
    url: location.href,
    mode: selectedHtml ? 'selection' : articleHtml ? 'article' : 'page',
  };
})();
