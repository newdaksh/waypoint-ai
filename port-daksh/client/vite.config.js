import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// In dev the API runs separately (npm run dev starts both); /api is proxied so the client never
// needs to know the server's origin and no CORS configuration is required.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // ws: the live interview's voice channel is a WebSocket under /api.
    proxy: { '/api': { target: 'http://localhost:4000', changeOrigin: true, ws: true } },
  },
  build: { outDir: 'dist', sourcemap: true },
});
