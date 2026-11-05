// The smoke suite (test/smoke, `npm run test-smoke`), left out of `npm test` as in
// platform-reactcommon: GET-only checks against SMOKE_BASE_URL (the image in CI, or a deployment).
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/smoke/**/*.test.ts'],
    // Network round trips to a deployment: generous, but a hung origin still fails.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
})
