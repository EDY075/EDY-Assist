import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '../../', '');
  return {
    envDir: '../../',
    plugins: [react()],
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules/recharts') || id.includes('node_modules/d3-')) return 'charts';
            if (id.includes('node_modules/motion') || id.includes('node_modules/framer-motion')) return 'motion';
            if (id.includes('node_modules/@base-ui')) return 'primitives';
            if (id.includes('node_modules/lucide-react')) return 'icons';
            if (id.includes('node_modules/react') || id.includes('node_modules/scheduler')) return 'react';
            return undefined;
          },
        },
      },
    },
    server: {
      port: 5173,
      strictPort: true,
      proxy: {
        '/api': {
          target: env.VITE_API_PROXY_TARGET || 'http://127.0.0.1:3333',
          changeOrigin: false,
        },
      },
    },
  };
});
