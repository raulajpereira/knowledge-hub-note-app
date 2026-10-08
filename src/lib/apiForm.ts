// API Playground: an x-www-form-urlencoded body edited as key / value rows
// like Params. Stored in the request's body as a JSON list of rows (so the
// switched-off ones are kept); a plain "a=1&b=2" body, from before or typed
// as text, is read too.
export type FormRow = { k: string; v: string; on: boolean };

const dec = (z: string) => {
  try {
    return decodeURIComponent(z.replace(/\+/g, ' '));
  } catch {
    return z;
  }
};

export function parseFormBody(body: string): FormRow[] {
  const s = body.trim();
  if (!s) return [];
  if (s.startsWith('[')) {
    try {
      const rows = JSON.parse(s) as unknown;
      if (Array.isArray(rows))
        return rows
          .filter((r): r is FormRow => !!r && typeof r === 'object' && typeof (r as FormRow).k === 'string')
          .map((r) => ({ k: r.k, v: String(r.v ?? ''), on: r.on !== false }));
    } catch {
      // not the JSON list: read as a urlencoded string
    }
  }
  return s
    .split('&')
    .filter(Boolean)
    .map((p) => {
      const i = p.indexOf('=');
      return { k: dec(i < 0 ? p : p.slice(0, i)), v: dec(i < 0 ? '' : p.slice(i + 1)), on: true };
    });
}

export const storeFormBody = (rows: FormRow[]) => JSON.stringify(rows);

/** The body that is sent: the switched-on rows, {{variables}} resolved, encoded. */
export function encodeFormBody(rows: FormRow[], resolve: (s: string) => string = (s) => s): string {
  return rows
    .filter((r) => r.on && r.k)
    .map((r) => `${encodeURIComponent(resolve(r.k))}=${encodeURIComponent(resolve(r.v))}`)
    .join('&');
}
