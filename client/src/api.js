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

async function requestBlob(path, { method = 'GET' } = {}) {
  const headers = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`/api${path}`, { method, headers });
  if (!res.ok) {
    const isJson = res.headers.get('content-type')?.includes('application/json');
    const data = isJson ? await res.json() : null;
    throw new Error(data?.error || `Request failed (${res.status})`);
  }
  const disposition = res.headers.get('content-disposition') || '';
  const filenameMatch = /filename="([^"]+)"/.exec(disposition);
  const blob = await res.blob();
  return { blob, filename: filenameMatch?.[1] || 'documento.docx' };
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export const api = {
  register: (payload) => request('/auth/register', { method: 'POST', body: payload }),
  login: (payload) => request('/auth/login', { method: 'POST', body: payload }),
  login2faVerify: (payload) => request('/auth/2fa/login-verify', { method: 'POST', body: payload }),
  setup2fa: () => request('/auth/2fa/setup', { method: 'POST' }),
  verify2faSetup: (payload) => request('/auth/2fa/verify-setup', { method: 'POST', body: payload }),
  disable2fa: (payload) => request('/auth/2fa/disable', { method: 'POST', body: payload }),
  listSessions: () => request('/auth/sessions'),
  revokeSession: (id) => request(`/auth/sessions/${id}`, { method: 'DELETE' }),
  listAuditLog: (params) => request(`/audit-log${params ? `?${new URLSearchParams(params)}` : ''}`),
  me: () => request('/auth/me'),
  updateProfile: (payload) => request('/auth/me', { method: 'PATCH', body: payload }),
  changePassword: (payload) => request('/auth/change-password', { method: 'POST', body: payload }),
  exportData: () => request('/auth/export'),
  getTeam: () => request('/auth/team'),
  inviteTeamMember: (payload) => request('/auth/team/invite', { method: 'POST', body: payload }),
  removeTeamMember: (id) => request(`/auth/team/${id}`, { method: 'DELETE' }),

  listInviteCodes: () => request('/auth/invite-codes'),
  createInviteCode: () => request('/auth/invite-codes', { method: 'POST' }),
  revokeInviteCode: (id) => request(`/auth/invite-codes/${id}`, { method: 'DELETE' }),
  listAdminUsers: () => request('/auth/admin/users'),
  updateAdminUser: (id, payload) => request(`/auth/admin/users/${id}`, { method: 'PATCH', body: payload }),
  deleteAdminUser: (id) => request(`/auth/admin/users/${id}`, { method: 'DELETE' }),

  listNotes: (trashed = false) => request(`/notes${trashed ? '?trashed=true' : ''}`),
  getNote: (id) => request(`/notes/${id}`),
  createNote: (payload) => request('/notes', { method: 'POST', body: payload }),
  updateNote: (id, payload) => request(`/notes/${id}`, { method: 'PATCH', body: payload }),
  suggestNoteTags: (id) => request(`/notes/${id}/suggest-tags`, { method: 'POST' }),
  shareNote: (id) => request(`/notes/${id}/share`, { method: 'POST' }),
  unshareNote: (id) => request(`/notes/${id}/unshare`, { method: 'POST' }),
  getPublicNote: (token) => request(`/public/notes/${token}`),
  trashNote: (id) => request(`/notes/${id}/trash`, { method: 'POST' }),
  restoreNote: (id) => request(`/notes/${id}/restore`, { method: 'POST' }),
  deleteNoteForever: (id) => request(`/notes/${id}`, { method: 'DELETE' }),
  listNoteVersions: (id) => request(`/notes/${id}/versions`),
  createNoteSnapshot: (id, label) => request(`/notes/${id}/versions`, { method: 'POST', body: { label } }),
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
  uploadFavicon: (file) => {
    const form = new FormData();
    form.append('favicon', file);
    return request('/settings/favicon', { method: 'POST', body: form, isForm: true });
  },
  resetFavicon: () => request('/settings/favicon', { method: 'DELETE' }),
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
  uploadVoiceNote: (blob, title, duration, source = 'mic') => {
    const form = new FormData();
    form.append('audio', blob, 'recording.webm');
    form.append('title', title);
    form.append('duration', String(duration));
    form.append('source', source);
    return request('/voice', { method: 'POST', body: form, isForm: true });
  },
  updateVoiceNote: (id, payload) => request(`/voice/${id}`, { method: 'PATCH', body: payload }),
  trashVoiceNote: (id) => request(`/voice/${id}/trash`, { method: 'POST' }),
  restoreVoiceNote: (id) => request(`/voice/${id}/restore`, { method: 'POST' }),
  deleteVoiceNoteForever: (id) => request(`/voice/${id}`, { method: 'DELETE' }),
  transcribeVoiceNote: (id) => request(`/voice/${id}/transcribe`, { method: 'POST' }),
  suggestTasksFromVoiceNote: (id) => request(`/voice/${id}/suggest-tasks`, { method: 'POST' }),

  getVaultInfo: () => request('/passwords/vault-info'),
  setupVault: (payload) => request('/passwords/setup', { method: 'POST', body: payload }),
  rewrapVault: (payload) => request('/passwords/rewrap', { method: 'POST', body: payload }),
  listPasswords: () => request('/passwords'),
  createPassword: (payload) => request('/passwords', { method: 'POST', body: payload }),
  updatePassword: (id, payload) => request(`/passwords/${id}`, { method: 'PATCH', body: payload }),
  deletePassword: (id) => request(`/passwords/${id}`, { method: 'DELETE' }),
  uploadPasswordIcon: (id, file) => {
    const form = new FormData();
    form.append('icon', file);
    return request(`/passwords/${id}/icon`, { method: 'POST', body: form, isForm: true });
  },
  resetPasswordIcon: (id) => request(`/passwords/${id}/icon`, { method: 'DELETE' }),

  listIssues: () => request('/issues'),
  createIssue: (payload) => request('/issues', { method: 'POST', body: payload }),
  generateIssuesReport: (project) => request('/issues/report', { method: 'POST', body: { project } }),

  listProjects: () => request('/projects'),
  createProject: (payload) => request('/projects', { method: 'POST', body: payload }),
  updateProject: (id, payload) => request(`/projects/${id}`, { method: 'PATCH', body: payload }),
  deleteProject: (id) => request(`/projects/${id}`, { method: 'DELETE' }),
  uploadProjectCover: (file) => {
    const form = new FormData();
    form.append('image', file);
    return request('/projects/covers', { method: 'POST', body: form, isForm: true });
  },
  updateIssue: (id, payload) => request(`/issues/${id}`, { method: 'PATCH', body: payload }),
  deleteIssue: (id) => request(`/issues/${id}`, { method: 'DELETE' }),

  listTransactions: () => request('/transactions'),
  createTransaction: (payload) => request('/transactions', { method: 'POST', body: payload }),
  updateTransaction: (id, payload) => request(`/transactions/${id}`, { method: 'PATCH', body: payload }),
  deleteTransaction: (id) => request(`/transactions/${id}`, { method: 'DELETE' }),
  useTransaction: (id) => request(`/transactions/${id}/use`, { method: 'POST' }),

  listClients: () => request('/clients'),
  createClient: (payload) => request('/clients', { method: 'POST', body: payload }),
  updateClient: (id, payload) => request(`/clients/${id}`, { method: 'PATCH', body: payload }),
  deleteClient: (id) => request(`/clients/${id}`, { method: 'DELETE' }),

  listSapSystems: () => request('/sap-systems'),
  createSapSystem: (payload) => request('/sap-systems', { method: 'POST', body: payload }),
  updateSapSystem: (id, payload) => request(`/sap-systems/${id}`, { method: 'PATCH', body: payload }),
  deleteSapSystem: (id) => request(`/sap-systems/${id}`, { method: 'DELETE' }),

  listContacts: () => request('/contacts'),
  createContact: (payload) => request('/contacts', { method: 'POST', body: payload }),
  updateContact: (id, payload) => request(`/contacts/${id}`, { method: 'PATCH', body: payload }),
  deleteContact: (id) => request(`/contacts/${id}`, { method: 'DELETE' }),

  listTransportRequests: (projectId) => request(`/transport-requests${projectId ? `?projectId=${projectId}` : ''}`),
  createTransportRequest: (payload) => request('/transport-requests', { method: 'POST', body: payload }),
  updateTransportRequest: (id, payload) => request(`/transport-requests/${id}`, { method: 'PATCH', body: payload }),
  deleteTransportRequest: (id) => request(`/transport-requests/${id}`, { method: 'DELETE' }),

  listAgents: () => request('/agents'),
  createAgent: (payload) => request('/agents', { method: 'POST', body: payload }),
  updateAgent: (id, payload) => request(`/agents/${id}`, { method: 'PATCH', body: payload }),
  deleteAgent: (id) => request(`/agents/${id}`, { method: 'DELETE' }),
  testAgent: (id) => request(`/agents/${id}/test`, { method: 'POST' }),
  getAgentMessages: (id) => request(`/agents/${id}/messages`),
  clearAgentMessages: (id) => request(`/agents/${id}/messages`, { method: 'DELETE' }),
  chatWithAgent: (id, payload) => request(`/agents/${id}/chat`, { method: 'POST', body: payload }),
  askAgentWorkspace: (id, payload) => request(`/agents/${id}/ask-workspace`, { method: 'POST', body: payload }),
  listLinks: (type, id) => request(`/links?type=${type}&id=${id}`),
  listLinkSuggestions: (type, id) => request(`/links/suggestions?type=${type}&id=${id}`),
  listUnlinkedMentions: (type, id) => request(`/links/mentions?type=${type}&id=${id}`),
  createLink: (payload) => request('/links', { method: 'POST', body: payload }),
  deleteLink: (id) => request(`/links/${id}`, { method: 'DELETE' }),
  getLinksGraph: () => request('/links/graph'),
  getResurfacedItems: () => request('/links/resurface'),

  listTemplates: (type) => request(`/templates?type=${type}`),
  createTemplate: (payload) => request('/templates', { method: 'POST', body: payload }),
  deleteTemplate: (id) => request(`/templates/${id}`, { method: 'DELETE' }),

  getNews: () => request('/news'),

  listArtifacts: () => request('/artifacts'),
  createArtifact: (payload) => request('/artifacts', { method: 'POST', body: payload }),
  updateArtifact: (id, payload) => request(`/artifacts/${id}`, { method: 'PATCH', body: payload }),
  deleteArtifact: (id) => request(`/artifacts/${id}`, { method: 'DELETE' }),
  listArtifactSnapshots: (id) => request(`/artifacts/${id}/snapshots`),
  createArtifactSnapshot: (id, label) => request(`/artifacts/${id}/snapshots`, { method: 'POST', body: { label } }),
  restoreArtifactSnapshot: (id, snapshotId) => request(`/artifacts/${id}/snapshots/${snapshotId}/restore`, { method: 'POST' }),

  listArtifactFolders: () => request('/artifact-folders'),
  createArtifactFolder: (payload) => request('/artifact-folders', { method: 'POST', body: payload }),
  renameArtifactFolder: (id, payload) => request(`/artifact-folders/${id}`, { method: 'PATCH', body: payload }),
  deleteArtifactFolder: (id) => request(`/artifact-folders/${id}`, { method: 'DELETE' }),

  setHostingerToken: (token) => request('/vps/token', { method: 'POST', body: { token } }),
  clearHostingerToken: () => request('/vps/token', { method: 'DELETE' }),
  getVpsStatus: () => request('/vps/status'),

  getSapNews: () => request('/sap-news'),
  listSavedNews: () => request('/sap-news/saved'),
  saveNews: (payload) => request('/sap-news/saved', { method: 'POST', body: payload }),
  updateSavedNews: (id, payload) => request(`/sap-news/saved/${id}`, { method: 'PATCH', body: payload }),
  deleteSavedNews: (id) => request(`/sap-news/saved/${id}`, { method: 'DELETE' }),

  listDocFolders: () => request('/documentacao/folders'),
  createDocFolder: (payload) => request('/documentacao/folders', { method: 'POST', body: payload }),
  updateDocFolder: (id, payload) => request(`/documentacao/folders/${id}`, { method: 'PATCH', body: payload }),
  deleteDocFolder: (id) => request(`/documentacao/folders/${id}`, { method: 'DELETE' }),
  listDocTemplates: () => request('/documentacao/templates'),
  listDocTemplatesAdmin: () => request('/documentacao/templates/admin'),
  updateDocTemplate: (id, payload) => request(`/documentacao/templates/${id}`, { method: 'PATCH', body: payload }),
  getDocTemplateAccess: (userId) => request(`/documentacao/template-access/${userId}`),
  setDocTemplateAccess: (userId, allowedTemplateIds) => request(`/documentacao/template-access/${userId}`, { method: 'PUT', body: { allowedTemplateIds } }),
  listDocuments: (trashed) => request(`/documentacao${trashed ? '?trashed=true' : ''}`),
  getDocument: (id) => request(`/documentacao/${id}`),
  createDocument: (payload) => request('/documentacao', { method: 'POST', body: payload }),
  updateDocument: (id, payload) => request(`/documentacao/${id}`, { method: 'PATCH', body: payload }),
  trashDocument: (id) => request(`/documentacao/${id}/trash`, { method: 'POST' }),
  restoreDocument: (id) => request(`/documentacao/${id}/restore`, { method: 'POST' }),
  deleteDocumentForever: (id) => request(`/documentacao/${id}`, { method: 'DELETE' }),
  uploadDocImage: (file) => {
    const form = new FormData();
    form.append('image', file);
    return request('/documentacao/images', { method: 'POST', body: form, isForm: true });
  },
  generateDocument: (id) => requestBlob(`/documentacao/${id}/generate`, { method: 'POST' }),
  generateDocumentPdf: (id) => requestBlob(`/documentacao/${id}/pdf`, { method: 'POST' }),
  listDocumentVersions: (id) => request(`/documentacao/${id}/versions`),
  downloadDocumentVersion: (id, versionId) => requestBlob(`/documentacao/${id}/versions/${versionId}/download`),

  listCodeFolders: () => request('/code-library/folders'),
  createCodeFolder: (payload) => request('/code-library/folders', { method: 'POST', body: payload }),
  updateCodeFolder: (id, payload) => request(`/code-library/folders/${id}`, { method: 'PATCH', body: payload }),
  deleteCodeFolder: (id) => request(`/code-library/folders/${id}`, { method: 'DELETE' }),
  listCodeItems: (folderId) => request(`/code-library/folders/${folderId}/items`),
  createCodeItem: (folderId, payload) => request(`/code-library/folders/${folderId}/items`, { method: 'POST', body: payload }),
  updateCodeItem: (id, payload) => request(`/code-library/items/${id}`, { method: 'PATCH', body: payload }),
  documentCodeItem: (id) => request(`/code-library/items/${id}/document`, { method: 'POST' }),
  listCodeItemSnapshots: (id) => request(`/code-library/items/${id}/snapshots`),
  createCodeItemSnapshot: (id, label) => request(`/code-library/items/${id}/snapshots`, { method: 'POST', body: { label } }),
  restoreCodeItemSnapshot: (id, snapshotId) => request(`/code-library/items/${id}/snapshots/${snapshotId}/restore`, { method: 'POST' }),
  deleteCodeItem: (id) => request(`/code-library/items/${id}`, { method: 'DELETE' }),

  listApiFolders: () => request('/api-playground/folders'),
  createApiFolder: (payload) => request('/api-playground/folders', { method: 'POST', body: payload }),
  updateApiFolder: (id, payload) => request(`/api-playground/folders/${id}`, { method: 'PATCH', body: payload }),
  deleteApiFolder: (id) => request(`/api-playground/folders/${id}`, { method: 'DELETE' }),
  listApiRequests: () => request('/api-playground/requests'),
  createApiRequest: (payload) => request('/api-playground/requests', { method: 'POST', body: payload }),
  updateApiRequest: (id, payload) => request(`/api-playground/requests/${id}`, { method: 'PATCH', body: payload }),
  deleteApiRequest: (id) => request(`/api-playground/requests/${id}`, { method: 'DELETE' }),
};
