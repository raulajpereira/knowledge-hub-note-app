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
  };
}
