// Architecture lint: the shell's component map and the dependencies each component may have.
// The counterpart of the IAM services' .go-arch-lint.yml (components → `in`, deps → `mayDependOn`),
// enforced by dependency-cruiser in "allowed" mode: any dependency not declared below fails
// `npm run arch-lint`, including a file that belongs to no component.
//
// The layers are the Frontend Architecture Constitution's (docs/architecture/constitution-assessment.md),
// in its folders: presentation → application → domain; infrastructure implements domain contracts;
// app/ is the composition root. eslint.config.js repeats the import rules for editor
// feedback and adds what a dependency graph cannot see (browser globals such as fetch or localStorage).
//
// Tests, config/ (dev stand-ins) and scripts are not part of the runtime architecture: only src/ is
// scanned.

/** The platform SDK's subpaths, as resolved in node_modules. */
const sdk = (...subpaths) => `^node_modules/@bcbp-solutions-fzc-llc/frontend-sdk/dist/(${subpaths.join('|')})/`
const ANY_SDK = '^node_modules/@bcbp-solutions-fzc-llc/frontend-sdk/'
const REACT = '^node_modules/(react|react-dom)/'

/** Where each component lives: a directory, or one file. The folders are the constitution's. */
const components = {
  // Pure contracts, errors and rules (the role map): no framework, no browser, nothing else in the shell.
  domain: { in: ['src/domain/'] },
  // Use cases; their infrastructure is injected by the composition root.
  application: { in: ['src/application/'] },
  // Adapters: IAM API, password reset, remembered email and welcome-intro flag (localStorage), router bridge, text registration.
  infrastructure: { in: ['src/infrastructure/'] },
  // Cross-cutting: the shell's text, constants (help and legal links), UI assets and styles.
  i18n: { in: ['src/shared/i18n/'] },
  constants: { in: ['src/shared/constants/'] },
  ui_assets: { in: ['src/shared/ui/'] },
  // Presentation: render, capture clicks, call the use cases they are given.
  components: { in: ['src/presentation/components/'] },
  widgets: { in: ['src/presentation/widgets/'] },
  pages: { in: ['src/presentation/pages/'] },
  features: { in: ['src/presentation/features/'] },
  // app/: the composition root and what only it may know.
  layouts: { in: ['src/app/layouts/'] },
  providers: { in: ['src/app/providers/'] },
  routes: { in: ['src/app/routes/'] },
  bootstrap: { in: ['src/app/bootstrap/bootstrap.tsx'] },
  // The async boundary and the static "unavailable" page (Rsbuild's entry).
  entry: { in: ['src/app/bootstrap/index.ts'] },
}

/**
 * What each component may depend on. A component may always use its own files.
 * - mayDependOn: other components.
 * - vendors: packages it may import (resolved paths); anyVendorDeps: any package.
 * - typeOnlyVendors: packages it may import types from, never values (the SDK's ports).
 * - typeOnlyDependOn: components it may import types from, never values (presentation takes use cases
 *   as props, so it needs application/ types only).
 */
const deps = {
  domain: { typeOnlyVendors: [ANY_SDK] },
  // The SDK's error classes (/problem) are values a use case may test for (instanceof).
  application: { mayDependOn: ['domain'], vendors: [sdk('problem')], typeOnlyVendors: [ANY_SDK] },
  infrastructure: { mayDependOn: ['domain', 'i18n'], vendors: [ANY_SDK] },
  i18n: { vendors: [sdk('i18n', 'react')] },
  constants: { mayDependOn: ['i18n'] },
  ui_assets: {},
  components: { mayDependOn: ['ui_assets', 'i18n', 'constants'], vendors: [REACT] },
  widgets: { mayDependOn: ['i18n'], vendors: [REACT] },
  pages: { mayDependOn: ['components', 'ui_assets', 'i18n', 'constants', 'domain'], typeOnlyDependOn: ['application'], vendors: [REACT] },
  features: { mayDependOn: ['pages', 'components', 'i18n', 'domain'], typeOnlyDependOn: ['application'], vendors: [REACT], typeOnlyVendors: [sdk('auth')] },
  layouts: { mayDependOn: ['features', 'i18n', 'application'], vendors: [REACT], typeOnlyVendors: [sdk('auth')] },
  providers: { mayDependOn: ['application'], vendors: [REACT, sdk('react')], typeOnlyVendors: [sdk('auth')] },
  routes: { mayDependOn: ['widgets', 'i18n'], vendors: [REACT, '^node_modules/react-router(-dom)?/', sdk('react')] },
  // Composition root: wires everything.
  bootstrap: {
    mayDependOn: ['domain', 'application', 'infrastructure', 'i18n', 'ui_assets', 'layouts', 'providers', 'routes'],
    anyVendorDeps: true,
  },
  // The unavailable page reads the catalogue directly: nothing shared may load before the async boundary.
  entry: { mayDependOn: ['bootstrap', 'i18n'] },
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
    ...(d.typeOnlyDependOn ?? []).map((target) => {
      if (!components[target]) throw new Error(`arch-lint: ${name} may depend on unknown component "${target}"`)
      return { from, to: { path: pathOf(target), dependencyTypes: ['type-only'] } }
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
    exclude: { path: '^src/shared/types/globals\\.d\\.ts$' },
  },
}
