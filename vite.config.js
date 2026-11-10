import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const codespace = process.env.CODESPACE_NAME;

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 3000,
    strictPort: true,
    allowedHosts: true,
    // Codespaces forwards over HTTPS, so hot reload has to connect on 443
    hmr: codespace ? { clientPort: 443 } : undefined,
    proxy: { '/api': 'http://127.0.0.1:5001' },
  },
});
