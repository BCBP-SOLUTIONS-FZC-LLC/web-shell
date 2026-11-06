// Flat config: TypeScript + React hooks, with the platform's rules (SDK imports through public
// subpaths, no identity headers, no raw storage, no unsafe HTML, API route templates).
import platform from '@bcbp-solutions-fzc-llc/eslint-plugin'
import reactHooks from 'eslint-plugin-react-hooks'
import globals from 'globals'
import tseslint from 'typescript-eslint'

// Layer rule building blocks (used below).
const REACT = ['react', 'react/*', 'react-dom', 'react-dom/*', 'react-router-dom']
const SDK = ['@bcbp-solutions-fzc-llc/frontend-sdk', '@bcbp-solutions-fzc-llc/frontend-sdk/*']
/** What domain and application code may not touch: the browser. */
const BROWSER_GLOBALS = ['window', 'document', 'navigator', 'location', 'localStorage', 'sessionStorage', 'indexedDB', 'fetch', 'XMLHttpRequest', 'history', 'globalThis', 'self', 'open']
/** Presentation renders the DOM, but never reaches the network, storage or navigation itself. */
const PRESENTATION_GLOBALS = ['fetch', 'XMLHttpRequest', 'localStorage', 'sessionStorage', 'indexedDB', 'location', 'history', 'navigator', 'open']
const PRESENTATION = 'Presentation does not reach the network, storage or navigation: call a use case it is given.'
/** Presentation's restricted globals through window, globalThis, self, and document.location. */
function browserProperties(message) {
  const objects = ['window', 'globalThis', 'self']
  return [
    ...objects.flatMap((object) => PRESENTATION_GLOBALS.map((property) => ({ object, property, message }))),
    { object: 'document', property: 'location', message },
  ]
}

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
    files: ['src/platform/rememberedEmail.ts'],
    rules: { '@bcbp-solutions-fzc-llc/no-raw-storage': 'off' },
  },
  // Layer rules (Frontend Architecture Constitution; docs/architecture/constitution-assessment.md §5).
  // Presentation → application → domain; infrastructure (platform/) implements domain contracts;
  // bootstrap.tsx is the composition root. test/unit/layer-rules.test.ts proves each rule fires.
  {
    files: ['src/domain/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': 'off',
      '@typescript-eslint/no-restricted-imports': ['error', { patterns: [
        { group: REACT, message: 'Domain is framework-free: no React.' },
        { group: SDK, allowTypeImports: true, message: 'Domain may use SDK types (ports) only, not its runtime.' },
        { group: ['**/application/**', '**/platform/**', '**/pages/**', '**/components/**', '**/App', '**/bootstrap'], message: 'Domain depends on nothing in the shell.' },
      ] }],
      'no-restricted-globals': ['error', ...BROWSER_GLOBALS.map((name) => ({ name, message: 'Domain is browser-free.' }))],
    },
  },
  {
    files: ['src/application/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': 'off',
      '@typescript-eslint/no-restricted-imports': ['error', { patterns: [
        { group: REACT, message: 'Application has no React.' },
        { group: SDK, allowTypeImports: true, message: 'Application uses SDK types (ports); the runtime is injected by the composition root.' },
        { group: ['**/platform/**', '**/pages/**', '**/components/**', '**/App', '**/bootstrap'], message: 'Application reaches infrastructure only through injected ports, and never presentation.' },
      ] }],
      'no-restricted-globals': ['error', ...BROWSER_GLOBALS.map((name) => ({ name, message: 'Application is browser-free: inject the port.' }))],
    },
  },
  {
    // Pages and components: never platform/ or the SDK (CLAUDE.md); what they need is passed in.
    files: ['src/pages/**/*.{ts,tsx}', 'src/components/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': 'off',
      '@typescript-eslint/no-restricted-imports': ['error', { patterns: [
        { group: ['**/platform/**', '**/bootstrap', '**/App'], message: 'Pages and components never import platform/ (infrastructure) or the composition root: take what you need as props or use cases.' },
        { group: SDK, message: 'Pages and components never import the SDK: the composition root passes what they need.' },
      ] }],
      'no-restricted-globals': ['error', ...PRESENTATION_GLOBALS.map((name) => ({ name, message: PRESENTATION }))],
      'no-restricted-properties': ['error', ...browserProperties(PRESENTATION)],
    },
  },
  {
    // shared/: cross-cutting helpers for every layer (the shell's text). It depends on no shell layer,
    // and of the SDK only on text lookup (/i18n) and its React hook (/react).
    files: ['src/shared/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': 'off',
      '@typescript-eslint/no-restricted-imports': ['error', { patterns: [
        { group: ['**/platform/**', '**/pages/**', '**/components/**', '**/application/**', '**/App', '**/bootstrap'], message: 'shared/ depends on no shell layer.' },
        { regex: '^@bcbp-solutions-fzc-llc/frontend-sdk(?!/(i18n|react)$)(/.*)?$', message: 'shared/ uses the SDK only for text (/i18n, /react).' },
      ] }],
      'no-restricted-globals': ['error', ...PRESENTATION_GLOBALS.map((name) => ({ name, message: 'shared/ does not reach the network, storage or navigation.' }))],
    },
  },
  {
    // The session screens are presentation that lives next to the infrastructure it must not use.
    files: ['src/platform/SessionScreens.tsx'],
    rules: {
      'no-restricted-imports': 'off',
      '@typescript-eslint/no-restricted-imports': ['error', { patterns: [
        { group: ['./iam', './passwordReset', './rememberedEmail', './navigator', './sessionContext', './permissions', './ShellRoot', '**/platform/*', '!**/platform/screen', '**/bootstrap', '**/App'], message: 'The session screens call the use cases they are given (application/), not infrastructure.' },
        { group: ['@bcbp-solutions-fzc-llc/frontend-sdk/auth'], allowTypeImports: true, message: 'The session screens use /auth types only: signing in is the caller\'s (no login without a click).' },
        { regex: '^@bcbp-solutions-fzc-llc/frontend-sdk(?!/auth$)(/.*)?$', message: 'The session screens use /auth types only.' },
      ] }],
      'no-restricted-globals': ['error', ...PRESENTATION_GLOBALS.map((name) => ({ name, message: PRESENTATION }))],
      'no-restricted-properties': ['error', ...browserProperties(PRESENTATION)],
    },
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
