import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  server: {
    port: 8000,
    // Proxy /api/* to the Wrangler Pages Functions server (port 8787)
    // Run `npm run pages:dev` in a second terminal when developing locally
    proxy: {
      '/api': {
        target:      'http://localhost:8787',
        changeOrigin: true,
        secure:       false
      }
    }
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src')
    }
  },
  build: {
    outDir:    'dist',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          clerk: ['@clerk/clerk-js']
        }
      }
    }
  }
});
