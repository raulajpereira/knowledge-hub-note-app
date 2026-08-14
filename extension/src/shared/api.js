import { getConfig, setToken } from './storage.js';

// Unlike the web app and the backoffice, the extension doesn't know its
// server's origin at build time — each install points at whichever
// Knowledge Hub deployment its owner uses, set once in the login screen and
// kept in chrome.storage.
async function request(path, { method = 'GET', body } = {}) {
  const { apiBase, token } = await getConfig();
  if (!apiBase) throw new Error('missing-api-base');

  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  const res = await fetch(`${apiBase}/api${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const isJson = res.headers.get('content-type')?.includes('application/json');
  const data = isJson ? await res.json() : null;

  if (res.status === 401) await setToken(null);
  if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);
  return data;
}

export const api = {
  login: (payload) => request('/auth/login', { method: 'POST', body: payload }),
  login2faVerify: (payload) => request('/auth/2fa/login-verify', { method: 'POST', body: payload }),
  me: () => request('/auth/me'),
  createNote: (payload) => request('/notes', { method: 'POST', body: payload }),
};
