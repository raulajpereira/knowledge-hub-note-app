import type { MetadataRoute } from 'next';

const base = process.env.NEXT_PUBLIC_BASE_PATH || '';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'KnowledgeHub',
    short_name: 'KnowledgeHub',
    start_url: `${base}/`,
    scope: `${base}/`,
    display: 'standalone',
    background_color: '#121315',
    theme_color: '#121315',
    icons: [{ src: `${base}/icon-512.png`, sizes: '512x512', type: 'image/png' }],
    // Android's share sheet → KnowledgeHub (D69): the server keeps what was
    // shared and /app/share asks what to make of it (note, task, Ficheiros)
    share_target: {
      action: `${base}/api/v1/share-target`,
      method: 'POST',
      enctype: 'multipart/form-data',
      params: {
        title: 'title',
        text: 'text',
        url: 'url',
        files: [{ name: 'files', accept: ['image/*', 'application/pdf'] }],
      },
    },
  };
}
