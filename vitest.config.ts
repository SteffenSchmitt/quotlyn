import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [vue()],
  test: {
    // Pure logic runs in node; component tests opt into happy-dom with a `@vitest-environment` comment.
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
})
