import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

const proxyPort = process.env.QUOTLYN_PROXY_PORT ?? '8787'

export default defineConfig({
  plugins: [vue()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        target: `http://localhost:${proxyPort}`,
        changeOrigin: false,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
})
