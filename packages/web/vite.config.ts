import basicSsl from '@vitejs/plugin-basic-ssl';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const BACKEND = process.env.EVERYFRAME_BACKEND_URL ?? 'https://localhost:4000';

// Serves the dev server over https with a self-signed, locally-generated cert (cached under
// node_modules/.vite-plugin-basic-ssl/ after the first run). The backend also serves https
// (its own self-signed cert - see packages/server/scripts/generate-dev-cert.mjs); `secure: false`
// tells the proxy not to reject that cert since it isn't from a public CA.
export default defineConfig({
  plugins: [react(), basicSsl()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: BACKEND, changeOrigin: true, secure: false },
      '/ws': { target: BACKEND, ws: true, changeOrigin: true, secure: false },
    },
  },
});
