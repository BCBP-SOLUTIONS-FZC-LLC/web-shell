// Flat config: TypeScript + React hooks, with the platform's rules (SDK imports through public
// subpaths, no identity headers, no raw storage, no unsafe HTML, API route templates).
import platform from '@bcbp-solutions-fzc-llc/eslint-plugin'
import reactHooks from 'eslint-plugin-react-hooks'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['dist', 'coverage', 'node_modules', 'keycloak'] },
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': reactHooks },
    rules: { ...reactHooks.configs.recommended.rules },
  },
  { files: ['src/**/*.{ts,tsx}'], ...platform.configs.recommended },
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
