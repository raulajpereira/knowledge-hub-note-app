import path from 'node:path';

// Text drawn on a canvas for the OCR tests uses a font that ships with the
// project (Geist, from the `geist` dependency), never the machine's
// "sans-serif": a CI runner without system fonts drew only the digits and the
// OCR tests read "4 7 1".
export const TEST_FONT = 'KH Test Sans';

export async function loadTestFont() {
  const { GlobalFonts } = await import('@napi-rs/canvas');
  if (!GlobalFonts.has(TEST_FONT)) {
    // the tests run from the repository root (vitest and playwright)
    const file = path.resolve('node_modules/geist/dist/fonts/geist-sans/Geist-Regular.ttf');
    const ok = GlobalFonts.registerFromPath(file, TEST_FONT);
    if (!ok) throw new Error('test font not registered');
  }
  return TEST_FONT;
}
