import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// BASE_PATH (e.g. "/v1", read by deploy.sh from server/.env) serves the
// build from a sub-path; unset, it's served from "/" as before.
const basePath = (process.env.BASE_PATH || '').trim().replace(/\/+$/, '');

export default defineConfig({
  base: `${basePath}/`,
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:4000',
      '/uploads': 'http://localhost:4000',
    },
  },
});
