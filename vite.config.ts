import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  base: './',
  server: {
    host: '0.0.0.0',
    port: 3000,
    allowedHosts: true,
    proxy: {
      '/api/binance-mainnet': {
        target: 'https://api.binance.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/binance-mainnet/, ''),
      },
      '/api/binance-testnet': {
        target: 'https://testnet.binance.vision',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/binance-testnet/, ''),
      },
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
  preview: {
    host: '0.0.0.0',
    port: 3000,
  },
  plugins: [tailwindcss(), react()],
});
