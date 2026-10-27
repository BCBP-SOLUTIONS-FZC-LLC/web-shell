import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      'app2/App': fileURLToPath(new URL('./test/fixtures/DashboardApp.tsx', import.meta.url)),
    },
  },
  test: {
    environment: 'happy-dom',
    environmentOptions: {
      happyDOM: {
        url: 'http://localhost:5001/',
      },
    },
    setupFiles: ['./test/setup.ts'],
    include: ['test/**/*.test.ts', 'test/**/*.test.tsx'],
    env: {
      VITE_KEYCLOAK_URL: 'http://localhost:8080',
      VITE_KEYCLOAK_REALM: 'bcbp',
      VITE_KEYCLOAK_CLIENT_ID: 'web-shell',
    },
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
