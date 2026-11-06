// Flat config: TypeScript + React hooks, with the platform's rules (SDK imports through public
// subpaths, no identity headers, no raw storage, no unsafe HTML, API route templates).
import platform from '@bcbp-solutions-fzc-llc/eslint-plugin'
import reactHooks from 'eslint-plugin-react-hooks'
import globals from 'globals'
import tseslint from 'typescript-eslint'

// Layer rule building blocks (used below).
const REACT = ['react', 'react/*', 'react-dom', 'react-dom/*', 'react-router-dom']
const SDK = ['@bcbp-solutions-fzc-llc/frontend-sdk', '@bcbp-solutions-fzc-llc/frontend-sdk/*']
/** The shell's layers (the constitution's src/ folders). */
const LAYERS = ['**/app/**', '**/presentation/**', '**/application/**', '**/domain/**', '**/infrastructure/**', '**/shared/**']
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
    files: ['src/infrastructure/storage/rememberedEmail.ts'],
    rules: { '@bcbp-solutions-fzc-llc/no-raw-storage': 'off' },
  },
  // Layer rules (Frontend Architecture Constitution; docs/architecture/constitution-assessment.md §5).
  // presentation → application → domain; infrastructure implements domain contracts; app/ is the
  // composition root (bootstrap, providers, routes, layouts) and may use everything. The same graph is
  // declared in .dependency-cruiser.cjs (npm run arch-lint); these rules add editor feedback and the
  // browser globals a dependency graph cannot see. test/unit/layer-rules.test.ts proves each fires.
  {
    files: ['src/domain/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': 'off',
      '@typescript-eslint/no-restricted-imports': ['error', { patterns: [
        { group: REACT, message: 'Domain is framework-free: no React.' },
        { group: SDK, allowTypeImports: true, message: 'Domain may use SDK types (ports) only, not its runtime.' },
        { group: LAYERS.filter((l) => l !== '**/domain/**'), message: 'Domain depends on nothing in the shell.' },
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
        // The SDK's error classes (/problem) are plain values a use case may test for (instanceof).
        { regex: '^@bcbp-solutions-fzc-llc/frontend-sdk(?!/problem$)(/.*)?$', allowTypeImports: true, message: 'Application uses SDK types (ports) and /problem errors; the runtime is injected by the composition root.' },
        { group: ['**/infrastructure/**', '**/presentation/**', '**/app/**'], message: 'Application reaches infrastructure only through injected ports, and never presentation or app/.' },
      ] }],
      'no-restricted-globals': ['error', ...BROWSER_GLOBALS.map((name) => ({ name, message: 'Application is browser-free: inject the port.' }))],
    },
  },
  {
    files: ['src/infrastructure/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': 'off',
      '@typescript-eslint/no-restricted-imports': ['error', { patterns: [
        { group: ['**/presentation/**', '**/application/**', '**/app/**'], message: 'Infrastructure implements domain contracts: it never imports presentation, application or app/.' },
      ] }],
    },
  },
  {
    // All of presentation (pages, components, widgets, and any new folder): never infrastructure, app/
    // or the SDK (CLAUDE.md); what it needs is passed in as props or use cases. features/ is relaxed
    // for /auth types by the next block.
    files: ['src/presentation/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': 'off',
      '@typescript-eslint/no-restricted-imports': ['error', { patterns: [
        { group: ['**/infrastructure/**', '**/app/**'], message: 'Presentation never imports infrastructure or app/: take what you need as props or use cases.' },
        { group: ['**/application/**'], allowTypeImports: true, message: 'Presentation takes use cases as props: application/ types only.' },
        { group: SDK, message: 'Pages, components and widgets never import the SDK: the composition root passes what they need.' },
      ] }],
      'no-restricted-globals': ['error', ...PRESENTATION_GLOBALS.map((name) => ({ name, message: PRESENTATION }))],
      'no-restricted-properties': ['error', ...browserProperties(PRESENTATION)],
    },
  },
  {
    // Features (the session screens): as above, plus SDK /auth types (session state, workspace).
    files: ['src/presentation/features/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': 'off',
      '@typescript-eslint/no-restricted-imports': ['error', { patterns: [
        { group: ['**/infrastructure/**', '**/app/**'], message: 'The session screens call the use cases they are given (application/), not infrastructure or app/.' },
        { group: ['**/application/**'], allowTypeImports: true, message: 'Presentation takes use cases as props: application/ types only.' },
        { group: ['@bcbp-solutions-fzc-llc/frontend-sdk/auth'], allowTypeImports: true, message: 'The session screens use /auth types only: signing in is the caller\'s (no login without a click).' },
        { regex: '^@bcbp-solutions-fzc-llc/frontend-sdk(?!/auth$)(/.*)?$', message: 'The session screens use /auth types only.' },
      ] }],
      'no-restricted-globals': ['error', ...PRESENTATION_GLOBALS.map((name) => ({ name, message: PRESENTATION }))],
      'no-restricted-properties': ['error', ...browserProperties(PRESENTATION)],
    },
  },
  {
    // shared/: cross-cutting helpers for every layer (text, constants, UI assets, types). It depends
    // on no shell layer, and of the SDK only on text lookup (/i18n) and its React hook (/react).
    files: ['src/shared/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': 'off',
      '@typescript-eslint/no-restricted-imports': ['error', { patterns: [
        { group: LAYERS.filter((l) => l !== '**/shared/**'), message: 'shared/ depends on no shell layer.' },
        { regex: '^@bcbp-solutions-fzc-llc/frontend-sdk(?!/(i18n|react)$)(/.*)?$', message: 'shared/ uses the SDK only for text (/i18n, /react).' },
      ] }],
      'no-restricted-globals': ['error', ...PRESENTATION_GLOBALS.map((name) => ({ name, message: 'shared/ does not reach the network, storage or navigation.' }))],
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
