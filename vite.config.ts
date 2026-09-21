import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

const proxyPort = process.env.QUOTLYN_PROXY_PORT ?? '8787'
// The app shows this in the header; bump it in package.json with every change to the app.
const version = (JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string }).version

export default defineConfig({
  plugins: [vue(), tailwindcss()],
  define: { __APP_VERSION__: JSON.stringify(version) },
  optimizeDeps: {
    // Pre-bundle everything up front so Vite never re-optimizes (and reloads) mid-session.
    include: [
      'vue',
      'vue-router',
      'pinia',
      'vue-i18n',
      'idb',
      'vue-echarts',
      'echarts/core',
      'echarts/charts',
      'echarts/components',
      'echarts/renderers',
    ],
  },
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
