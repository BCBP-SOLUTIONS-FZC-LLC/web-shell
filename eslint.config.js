// Flat config: TypeScript + React hooks, with the platform's rules (SDK imports through public
// subpaths, no identity headers, no raw storage, no unsafe HTML, API route templates).
import platform from '@bcbp-solutions-fzc-llc/eslint-plugin'
import reactHooks from 'eslint-plugin-react-hooks'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['dist', 'coverage', 'node_modules', 'keycloak', '.remote', 'test-results', 'playwright-report'] },
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': reactHooks },
    rules: { ...reactHooks.configs.recommended.rules },
  },
  { files: ['src/**/*.{ts,tsx}'], ...platform.configs.recommended },
  {
    // "Remember Email" is needed before any workspace is known and must survive sign-out; the SDK's
    // storage() is workspace-scoped and cleared on sign-out. Only the typed email is kept, never a
    // token. This is the one file allowed raw localStorage (the rule has no allow option).
    files: ['src/pages/rememberEmail.ts'],
    rules: { '@bcbp-solutions-fzc-llc/no-raw-storage': 'off' },
  },
  {
    files: ['**/*.{js,mjs}', '.github/**/*.{js,mjs}', 'scripts/**/*.mjs'],
    languageOptions: { globals: globals.node },
  },
  {
    // Tests drive the real browser APIs the SDK wraps (storage, DOM) to set up fixtures.
    files: ['test/**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: { '@typescript-eslint/no-explicit-any': 'off' },
  },
)
