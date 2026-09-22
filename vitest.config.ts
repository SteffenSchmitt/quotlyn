import { readFileSync } from 'node:fs'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vitest/config'

// Mirrors the define in vite.config.ts, so App.vue can be mounted in a test like anywhere else.
const version = (JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string }).version

export default defineConfig({
  plugins: [vue()],
  define: { __APP_VERSION__: JSON.stringify(version) },
  test: {
    // Pure logic runs in node; component tests opt into happy-dom with a `@vitest-environment` comment.
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**', 'proxy/**'],
      // Bootstrap and plain configuration: a test here would only assert that a list is a list.
      exclude: ['src/main.ts', 'src/router/**', 'src/i18n/index.ts', 'src/lib/chartTheme.ts', 'src/**/*.json', 'src/env.d.ts'],
      reporter: ['text-summary', 'json-summary', 'html'],
    },
  },
})
