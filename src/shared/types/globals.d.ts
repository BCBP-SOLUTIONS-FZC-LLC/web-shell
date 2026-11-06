// Build-time constants (Rsbuild source.define, rsbuild.config.ts), passed to initializeCore.
declare const __ENVIRONMENT__: 'local' | 'dev' | 'test' | 'staging' | 'prod'
declare const __BUILD_VERSION__: string

declare module '*.css'

// Images imported from src/shared/ui/assets: the bundler emits each under /assets/ with a content hash and
// the import is its URL.
declare module '*.jpg' {
  const src: string
  export default src
}
declare module '*.png' {
  const src: string
  export default src
}
