// chrome.storage.local (not localStorage) — the popup is a short-lived page
// that's destroyed every time it closes, so anything that needs to survive
// between openings has to live here instead.
const KEYS = { apiBase: 'kh-clip-api-base', token: 'kh-clip-token' };

export async function getConfig() {
  const stored = await chrome.storage.local.get([KEYS.apiBase, KEYS.token]);
  return { apiBase: stored[KEYS.apiBase] || '', token: stored[KEYS.token] || '' };
}

export async function setApiBase(apiBase) {
  await chrome.storage.local.set({ [KEYS.apiBase]: apiBase.replace(/\/+$/, '') });
}

export async function setToken(token) {
  if (token) await chrome.storage.local.set({ [KEYS.token]: token });
  else await chrome.storage.local.remove(KEYS.token);
}
