const TOKEN_KEY = 'kh-token';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

async function request(path, { method = 'GET', body, isForm = false } = {}) {
  const headers = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (!isForm && body !== undefined) headers['Content-Type'] = 'application/json';

  const res = await fetch(`/api${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
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
  register: (payload) => request('/auth/register', { method: 'POST', body: payload }),
  login: (payload) => request('/auth/login', { method: 'POST', body: payload }),
  me: () => request('/auth/me'),
  updateProfile: (payload) => request('/auth/me', { method: 'PATCH', body: payload }),
  changePassword: (payload) => request('/auth/change-password', { method: 'POST', body: payload }),
  exportData: () => request('/auth/export'),
  getTeam: () => request('/auth/team'),
  inviteTeamMember: (payload) => request('/auth/team/invite', { method: 'POST', body: payload }),
  removeTeamMember: (id) => request(`/auth/team/${id}`, { method: 'DELETE' }),

  listNotes: (trashed = false) => request(`/notes${trashed ? '?trashed=true' : ''}`),
  getNote: (id) => request(`/notes/${id}`),
  createNote: (payload) => request('/notes', { method: 'POST', body: payload }),
  updateNote: (id, payload) => request(`/notes/${id}`, { method: 'PATCH', body: payload }),
  trashNote: (id) => request(`/notes/${id}/trash`, { method: 'POST' }),
  restoreNote: (id) => request(`/notes/${id}/restore`, { method: 'POST' }),
  deleteNoteForever: (id) => request(`/notes/${id}`, { method: 'DELETE' }),
  listNoteVersions: (id) => request(`/notes/${id}/versions`),
  restoreNoteVersion: (id, versionId) => request(`/notes/${id}/versions/${versionId}/restore`, { method: 'POST' }),
  linkPreview: (url) => request(`/notes/link-preview?url=${encodeURIComponent(url)}`),
  uploadNoteImage: (file) => {
    const form = new FormData();
    form.append('image', file);
    return request('/notes/images', { method: 'POST', body: form, isForm: true });
  },
  uploadNoteFile: (file) => {
    const form = new FormData();
    form.append('file', file);
    return request('/notes/files', { method: 'POST', body: form, isForm: true });
  },

  listFolders: () => request('/folders'),
  createFolder: (payload) => request('/folders', { method: 'POST', body: payload }),
  renameFolder: (id, payload) => request(`/folders/${id}`, { method: 'PATCH', body: payload }),
  deleteFolder: (id) => request(`/folders/${id}`, { method: 'DELETE' }),

  listTasks: (trashed = false) => request(`/tasks${trashed ? '?trashed=true' : ''}`),
  createTask: (payload) => request('/tasks', { method: 'POST', body: payload }),
  updateTask: (id, payload) => request(`/tasks/${id}`, { method: 'PATCH', body: payload }),
  trashTask: (id) => request(`/tasks/${id}/trash`, { method: 'POST' }),
  restoreTask: (id) => request(`/tasks/${id}/restore`, { method: 'POST' }),
  deleteTaskForever: (id) => request(`/tasks/${id}`, { method: 'DELETE' }),

  getSettings: () => request('/settings'),
  updateSettings: (payload) => request('/settings', { method: 'PATCH', body: payload }),
  uploadLogo: (file) => {
    const form = new FormData();
    form.append('logo', file);
    return request('/settings/logo', { method: 'POST', body: form, isForm: true });
  },
  resetLogo: () => request('/settings/logo', { method: 'DELETE' }),
  uploadAvatar: (file) => {
    const form = new FormData();
    form.append('avatar', file);
    return request('/settings/avatar', { method: 'POST', body: form, isForm: true });
  },

  listTags: () => request('/tags'),
  createTag: (payload) => request('/tags', { method: 'POST', body: payload }),
  renameTag: (id, payload) => request(`/tags/${id}`, { method: 'PATCH', body: payload }),
  deleteTag: (id) => request(`/tags/${id}`, { method: 'DELETE' }),

  listVoiceNotes: (trashed = false) => request(`/voice${trashed ? '?trashed=true' : ''}`),
  uploadVoiceNote: (blob, title, duration) => {
    const form = new FormData();
    form.append('audio', blob, 'recording.webm');
    form.append('title', title);
    form.append('duration', String(duration));
    return request('/voice', { method: 'POST', body: form, isForm: true });
  },
  updateVoiceNote: (id, payload) => request(`/voice/${id}`, { method: 'PATCH', body: payload }),
  trashVoiceNote: (id) => request(`/voice/${id}/trash`, { method: 'POST' }),
  restoreVoiceNote: (id) => request(`/voice/${id}/restore`, { method: 'POST' }),
  deleteVoiceNoteForever: (id) => request(`/voice/${id}`, { method: 'DELETE' }),

  getVaultInfo: () => request('/passwords/vault-info'),
  setupVault: (payload) => request('/passwords/setup', { method: 'POST', body: payload }),
  rewrapVault: (payload) => request('/passwords/rewrap', { method: 'POST', body: payload }),
  listPasswords: () => request('/passwords'),
  createPassword: (payload) => request('/passwords', { method: 'POST', body: payload }),
  updatePassword: (id, payload) => request(`/passwords/${id}`, { method: 'PATCH', body: payload }),
  deletePassword: (id) => request(`/passwords/${id}`, { method: 'DELETE' }),

  listIssues: () => request('/issues'),
  createIssue: (payload) => request('/issues', { method: 'POST', body: payload }),
  updateIssue: (id, payload) => request(`/issues/${id}`, { method: 'PATCH', body: payload }),
  deleteIssue: (id) => request(`/issues/${id}`, { method: 'DELETE' }),

  listAgents: () => request('/agents'),
  createAgent: (payload) => request('/agents', { method: 'POST', body: payload }),
  updateAgent: (id, payload) => request(`/agents/${id}`, { method: 'PATCH', body: payload }),
  deleteAgent: (id) => request(`/agents/${id}`, { method: 'DELETE' }),
  testAgent: (id) => request(`/agents/${id}/test`, { method: 'POST' }),
  getAgentMessages: (id) => request(`/agents/${id}/messages`),
  clearAgentMessages: (id) => request(`/agents/${id}/messages`, { method: 'DELETE' }),
  chatWithAgent: (id, payload) => request(`/agents/${id}/chat`, { method: 'POST', body: payload }),

  getNews: () => request('/news'),

  listArtifacts: () => request('/artifacts'),
  createArtifact: (payload) => request('/artifacts', { method: 'POST', body: payload }),
  updateArtifact: (id, payload) => request(`/artifacts/${id}`, { method: 'PATCH', body: payload }),
  deleteArtifact: (id) => request(`/artifacts/${id}`, { method: 'DELETE' }),

  getSapNews: () => request('/sap-news'),
  listSavedNews: () => request('/sap-news/saved'),
  saveNews: (payload) => request('/sap-news/saved', { method: 'POST', body: payload }),
  updateSavedNews: (id, payload) => request(`/sap-news/saved/${id}`, { method: 'PATCH', body: payload }),
  deleteSavedNews: (id) => request(`/sap-news/saved/${id}`, { method: 'DELETE' }),

  listCodeFolders: () => request('/code-library/folders'),
  createCodeFolder: (payload) => request('/code-library/folders', { method: 'POST', body: payload }),
  updateCodeFolder: (id, payload) => request(`/code-library/folders/${id}`, { method: 'PATCH', body: payload }),
  deleteCodeFolder: (id) => request(`/code-library/folders/${id}`, { method: 'DELETE' }),
  listCodeItems: (folderId) => request(`/code-library/folders/${folderId}/items`),
  createCodeItem: (folderId, payload) => request(`/code-library/folders/${folderId}/items`, { method: 'POST', body: payload }),
  updateCodeItem: (id, payload) => request(`/code-library/items/${id}`, { method: 'PATCH', body: payload }),
  deleteCodeItem: (id) => request(`/code-library/items/${id}`, { method: 'DELETE' }),
};
