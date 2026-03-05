/// <reference types="node" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: '/',
  build: {
    outDir: '../static',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: (() => {
      const target = process.env.VITE_PROXY_TARGET || 'http://localhost:8000';
      return {
        '/auth': target,
        '/lessons': target,
        '/quizzes': target,
        '/admin': target,
        '/webhooks': target,
        '/api': target,
      };
    })(),
  },
});
