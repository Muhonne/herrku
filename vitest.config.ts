import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@herrku/shared': fileURLToPath(new URL('./shared/src/index.ts', import.meta.url)),
    },
  },
  test: {
    include: ['shared/test/**/*.test.ts', 'server/test/**/*.test.ts', 'mcp/test/**/*.test.ts'],
    environment: 'node',
    env: { NODE_ENV: 'test' },
    pool: 'forks',
    testTimeout: 30000,
    hookTimeout: 30000,
  },
})
