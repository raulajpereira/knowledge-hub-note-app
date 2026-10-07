'use client';

import { api } from '@/lib/client/api';

const BASE = process.env.NEXT_PUBLIC_BASE_PATH || '';

export type Folder = { id: string; name: string; color: string; sort: number; count: number };
export type FolderList = { folders: Folder[]; total: number; favorites: number };
export type NoteItem = {
  id: string;
  title: string;
  summary: string;
  tags: string[];
  folderId: string | null;
  favorite: boolean;
  createdAt: string;
  updatedAt: string;
};
export type Note = Omit<NoteItem, 'summary'> & { content: unknown };
export type LinkItem = { type: 'note' | 'task' | 'voice' | 'issue'; id: string; title: string };
export type Candidate = LinkItem & { sub: string };

export const notesApi = {
  folders: () => api<FolderList>('/folders?kind=notes'),
  createFolder: (name: string) => api<{ folder: Folder }>('/folders?kind=notes', { name }),
  renameFolder: (id: string, name: string) => api(`/folders/${id}`, { name }, 'PATCH'),
  deleteFolder: (id: string) => api(`/folders/${id}`, undefined, 'DELETE'),
  duplicateFolder: (id: string, suffix: string) =>
    api<{ folder: Folder }>(`/folders/${id}/duplicate`, { suffix }),

  list: (q: { folder?: string; fav?: boolean; q?: string }) => {
    const sp = new URLSearchParams();
    if (q.folder) sp.set('folder', q.folder);
    if (q.fav) sp.set('fav', '1');
    if (q.q) sp.set('q', q.q);
    return api<{ notes: NoteItem[] }>(`/notes?${sp}`);
  },
  get: (id: string) => api<{ note: Note }>(`/notes/${id}`),
  create: (folderId: string | null) => api<{ note: NoteItem }>('/notes', { folderId }),
  update: (id: string, patch: Partial<Pick<Note, 'title' | 'content' | 'tags' | 'favorite' | 'folderId'>>) =>
    api<{ note: NoteItem }>(`/notes/${id}`, patch, 'PATCH'),
  move: (id: string, folderId: string | null) => api<{ note: NoteItem }>(`/notes/${id}/move`, { folderId }),
  duplicate: (id: string, suffix: string) => api<{ note: NoteItem }>(`/notes/${id}/duplicate`, { suffix }),
  trash: (id: string) => api(`/notes/${id}`, undefined, 'DELETE'),
  importImage: (id: string, url: string) =>
    api<{ id: string; src: string }>(`/notes/${id}/attachments`, { url }),
  async uploadImage(id: string, file: Blob): Promise<{ id: string; src: string }> {
    const res = await fetch(`${BASE}/api/v1/notes/${id}/attachments`, {
      method: 'POST',
      body: file,
      headers: { 'Content-Type': file.type || 'application/octet-stream' },
      credentials: 'same-origin',
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw { code: data?.error?.code ?? 'internal', status: res.status };
    return data;
  },

  links: (id: string) => api<{ links: LinkItem[] }>(`/links?type=note&id=${id}`),
  candidates: (id: string, q: string) =>
    api<{ items: Candidate[] }>(`/links/candidates?type=note&id=${id}&q=${encodeURIComponent(q)}`),
  link: (id: string, other: { type: string; id: string }) =>
    api('/links', { a: { type: 'note', id }, b: other }),
  unlink: (id: string, other: { type: string; id: string }) =>
    api('/links', { a: { type: 'note', id }, b: other }, 'DELETE'),
};
