// Deliberately a different localStorage key from the main app's ('kh-token')
// so a session in one never authenticates (or logs out) the other, even
// though both run in the same browser against the same origin.
const TOKEN_KEY = 'kh-backoffice-token';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

async function request(path, { method = 'GET', body } = {}) {
  const headers = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  const res = await fetch(`/api${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const isJson = res.headers.get('content-type')?.includes('application/json');
  const data = isJson ? await res.json() : null;

  if (!res.ok) {
    const message = data?.error || `Request failed (${res.status})`;
    throw new Error(message);
  }
  return data;
}

export const api = {
  login: (payload) => request('/auth/login', { method: 'POST', body: payload }),
  login2faVerify: (payload) => request('/auth/2fa/login-verify', { method: 'POST', body: payload }),
  me: () => request('/auth/me'),

  listInviteCodes: () => request('/auth/invite-codes'),
  createInviteCode: (payload) => request('/auth/invite-codes', { method: 'POST', body: payload }),
  revokeInviteCode: (id) => request(`/auth/invite-codes/${id}`, { method: 'DELETE' }),
  listAdminUsers: () => request('/auth/admin/users'),
  updateAdminUser: (id, payload) => request(`/auth/admin/users/${id}`, { method: 'PATCH', body: payload }),
  deleteAdminUser: (id) => request(`/auth/admin/users/${id}`, { method: 'DELETE' }),

  listCodeRequests: () => request('/code-requests'),
  approveCodeRequest: (id, payload) => request(`/code-requests/${id}/approve`, { method: 'POST', body: payload }),
  rejectCodeRequest: (id) => request(`/code-requests/${id}/reject`, { method: 'POST' }),
  deleteCodeRequest: (id) => request(`/code-requests/${id}`, { method: 'DELETE' }),

  listDocTemplatesAdmin: () => request('/documentacao/templates/admin'),
  updateDocTemplate: (id, payload) => request(`/documentacao/templates/${id}`, { method: 'PATCH', body: payload }),
  getDocTemplateAccess: (userId) => request(`/documentacao/template-access/${userId}`),
  setDocTemplateAccess: (userId, allowedTemplateIds) => request(`/documentacao/template-access/${userId}`, { method: 'PUT', body: { allowedTemplateIds } }),

  listAuditLog: (params) => request(`/audit-log${params ? `?${new URLSearchParams(params)}` : ''}`),
  purgeAuditLog: (olderThanDays) => request(`/audit-log?${new URLSearchParams({ olderThanDays })}`, { method: 'DELETE' }),
};
