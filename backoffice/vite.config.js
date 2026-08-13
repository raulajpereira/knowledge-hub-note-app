import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  base: '/backoffice/',
  plugins: [react()],
  server: {
    port: 5174,
    proxy: {
      '/api': 'http://localhost:4000',
      '/uploads': 'http://localhost:4000',
    },
    // A handful of design-system files (translations, theme tokens) are
    // intentionally shared by reading straight from ../client/src rather
    // than forked into a second copy that would drift — the dev server's
    // default fs.allow (this project's own root) would otherwise refuse to
    // serve anything outside backoffice/.
    fs: { allow: [__dirname, path.join(__dirname, '..', 'client')] },
  },
});
