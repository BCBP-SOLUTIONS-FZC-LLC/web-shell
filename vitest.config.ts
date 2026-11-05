import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  define: {
    __ENVIRONMENT__: JSON.stringify('test'),
    __BUILD_VERSION__: JSON.stringify('test'),
  },
  test: {
    environment: 'happy-dom',
    environmentOptions: {
      happyDOM: {
        url: 'http://localhost:5001/',
      },
    },
    setupFiles: ['./test/setup.ts'],
    // The SDK is evaluated by Vitest rather than Node, so vi.resetModules() gives the e2e suite a
    // fresh SDK on each simulated page load (test/e2e/shell.test.tsx).
    server: { deps: { inline: [/@bcbp-solutions-fzc-llc\/frontend-sdk/] } },
    include: ['test/**/*.test.ts', 'test/**/*.test.tsx'],
    // test/smoke runs against a served image or deployment: `npm run test-smoke` (vitest.smoke.config.ts).
    exclude: ['test/smoke/**', 'test/browser/**', 'node_modules/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      reportsDirectory: 'coverage',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.d.ts', 'src/**/*.css'],
      reportOnFailure: true,
    },
  },
})
