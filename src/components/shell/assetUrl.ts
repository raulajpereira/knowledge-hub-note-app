const BASE = process.env.NEXT_PUBLIC_BASE_PATH || '';

/** Versioned URL of one of the user's images (immutable → cached by the browser). */
export const assetUrl = (kind: 'avatar' | 'background' | 'logo', v: number) =>
  `${BASE}/api/v1/me/assets/${kind}?v=${v}`;
