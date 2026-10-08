import type { MetadataRoute } from 'next';

const base = process.env.NEXT_PUBLIC_BASE_PATH || '';

// Only the public pages are indexable; the app, console, API and shared links are not.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: [`${base}/`, `${base}/terms`, `${base}/privacy`],
      disallow: [`${base}/app`, `${base}/admin`, `${base}/api/`, `${base}/p/`, `${base}/ui`],
    },
  };
}
