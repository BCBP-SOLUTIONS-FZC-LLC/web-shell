// Architecture lint: the shell's component map and the dependencies each component may have.
// The counterpart of the IAM services' .go-arch-lint.yml (components → `in`, deps → `mayDependOn`),
// enforced by dependency-cruiser in "allowed" mode: any dependency not declared below fails
// `npm run arch-lint`, including a file that belongs to no component.
//
// The layers are the Frontend Architecture Constitution's (docs/architecture/constitution-assessment.md):
// presentation → application → domain; infrastructure (src/platform/) implements domain contracts;
// bootstrap.tsx is the composition root. eslint.config.js repeats the import rules for editor
// feedback and adds what a dependency graph cannot see (browser globals such as fetch or localStorage).
//
// Tests, config/ (dev stand-ins) and scripts are not part of the runtime architecture: only src/ is
// scanned.

/** The platform SDK's subpaths, as resolved in node_modules. */
const sdk = (...subpaths) => `^node_modules/@bcbp-solutions-fzc-llc/frontend-sdk/dist/(${subpaths.join('|')})/`
const ANY_SDK = '^node_modules/@bcbp-solutions-fzc-llc/frontend-sdk/'
const REACT = '^node_modules/(react|react-dom)/'

/** Where each component lives: a directory, or one file. */
const components = {
  // Pure contracts and errors: no framework, no browser, nothing else in the shell.
  domain: { in: ['src/domain/'] },
  // Use cases; their infrastructure is injected by the composition root.
  application: { in: ['src/application/'] },
  // The shell's text (the SDK's /i18n `shell` namespace and its English catalogue).
  i18n: { in: ['src/shared/i18n/'] },
  // Static files bundled by Rsbuild: images, styles.
  assets: { in: ['src/assets/', 'src/index.css', 'src/theme/'] },
  // Presentation.
  components: { in: ['src/components/'] },
  pages: { in: ['src/pages/'] },
  // Presentation that lives next to infrastructure: the session screens, and the host that mounts them.
  session_screens: { in: ['src/platform/SessionScreens.tsx'] },
  screen_host: { in: ['src/platform/screen.tsx'] },
  // Infrastructure: IAM ports, password reset hand-off, remembered email (localStorage), session
  // context store and provider, router bridge, role map, text registration.
  infrastructure: {
    in: [
      'src/platform/iam.ts',
      'src/platform/passwordReset.ts',
      'src/platform/rememberedEmail.ts',
      'src/platform/sessionContext.ts',
      'src/platform/ShellRoot.tsx',
      'src/platform/navigator.ts',
      'src/platform/permissions.ts',
      'src/platform/shellMessages.ts',
    ],
  },
  // Signed-in routes and the dashboard RemoteBoundary.
  routes: { in: ['src/App.tsx'] },
  // Composition root: wires everything.
  composition_root: { in: ['src/bootstrap.tsx'] },
  // The async boundary and the static "unavailable" page.
  entry: { in: ['src/index.ts'] },
}

/**
 * What each component may depend on. A component may always use its own files.
 * - mayDependOn: other components.
 * - vendors: packages it may import (resolved paths); anyVendorDeps: any package.
 * - typeOnlyVendors: packages it may import types from, never values (the SDK's ports).
 */
const deps = {
  domain: { typeOnlyVendors: [ANY_SDK] },
  application: { mayDependOn: ['domain'], typeOnlyVendors: [ANY_SDK] },
  i18n: { vendors: [sdk('i18n', 'react')] },
  assets: {},
  components: { mayDependOn: ['assets'] },
  pages: { mayDependOn: ['components', 'assets', 'i18n', 'domain', 'application'], vendors: [REACT] },
  screen_host: { vendors: [REACT] },
  session_screens: {
    mayDependOn: ['pages', 'screen_host', 'i18n', 'domain', 'application'],
    vendors: [REACT],
    typeOnlyVendors: [sdk('auth')],
  },
  infrastructure: { mayDependOn: ['domain', 'i18n'], vendors: [REACT, ANY_SDK] },
  routes: { mayDependOn: ['i18n'], vendors: [REACT, '^node_modules/react-router(-dom)?/', sdk('react')] },
  composition_root: {
    mayDependOn: ['domain', 'application', 'i18n', 'assets', 'pages', 'session_screens', 'screen_host', 'infrastructure', 'routes'],
    anyVendorDeps: true,
  },
  // The unavailable page reads the catalogue directly: nothing shared may load before the async boundary.
  entry: { mayDependOn: ['composition_root', 'i18n'] },
}

// ---- generated rules -------------------------------------------------------------------------

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
/** A path regex for a component's files. */
const pathOf = (name) =>
  `^(${components[name].in.map((p) => (p.endsWith('/') ? `${escape(p)}` : `${escape(p)}$`)).join('|')})`

for (const name of Object.keys(deps)) if (!components[name]) throw new Error(`arch-lint: deps names unknown component "${name}"`)
for (const name of Object.keys(components)) if (!deps[name]) throw new Error(`arch-lint: component "${name}" has no deps entry`)

const allowed = Object.entries(deps).flatMap(([name, d]) => {
  const from = { path: pathOf(name) }
  return [
    // its own files
    { from, to: { path: pathOf(name) } },
    ...(d.mayDependOn ?? []).map((target) => {
      if (!components[target]) throw new Error(`arch-lint: ${name} may depend on unknown component "${target}"`)
      return { from, to: { path: pathOf(target) } }
    }),
    ...(d.anyVendorDeps ? [{ from, to: { path: '^node_modules/' } }] : []),
    ...(d.vendors ?? []).map((path) => ({ from, to: { path } })),
    ...(d.typeOnlyVendors ?? []).map((path) => ({ from, to: { path, dependencyTypes: ['type-only'] } })),
  ]
})

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  allowed,
  allowedSeverity: 'error',
  forbidden: [
    { name: 'no-circular', severity: 'error', comment: 'A cycle hides which side owns the dependency.', from: {}, to: { circular: true } },
    { name: 'not-to-unresolvable', severity: 'error', comment: 'An import that resolves to nothing.', from: {}, to: { couldNotResolve: true } },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    // Type-only imports are dependencies too (and are told apart: `typeOnlyVendors`).
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.json' },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'types', 'default'],
      extensions: ['.ts', '.tsx', '.d.ts', '.js', '.json'],
    },
    // Ambient declarations (build constants) are not a component.
    exclude: { path: '^src/globals\\.d\\.ts$' },
  },
}
