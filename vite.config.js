import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  root: './src/web/react',
  base: '/',
  build: {
    outDir: '../../../dist',
    emptyOutDir: true,
    sourcemap: false
  },
  server: {
    middlewareMode: true,
    hmr: {
      overlay: false
    },
    host: true,
    allowedHosts: ['dcf66baefa9f.ngrok-free.app', '.ngrok-free.app', '.ngrok.io', 'localhost', '127.0.0.1', '.aloia.dev']
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src/web/react/src')
    }
  }
});