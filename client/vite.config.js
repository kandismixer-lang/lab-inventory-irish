import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    // build ไปที่ ../public เพื่อให้ Express เสิร์ฟได้เลย
    outDir: '../public',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    // dev: ส่ง /api ต่อไปที่ backend Express
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
});
