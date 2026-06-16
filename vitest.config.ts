import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  resolve: {
    alias: {
      'pamh-core': fileURLToPath(new URL('./packages/core/src/index.ts', import.meta.url)),
      'pamh-protocol': fileURLToPath(new URL('./packages/mcp/src/index.ts', import.meta.url)),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['packages/core/src/**/*.ts'],
      exclude: ['packages/core/src/**/*.test.ts'],
      thresholds: {
        statements: 80,
        branches: 80,
        functions: 80,
        lines: 80,
      },
    },
    include: ['packages/*/src/**/*.test.ts'],
  },
})
