// Build-time constants (Rsbuild source.define, rsbuild.config.ts), passed to initializeCore.
declare const __ENVIRONMENT__: 'local' | 'dev' | 'test' | 'staging' | 'prod'
declare const __BUILD_VERSION__: string

declare module '*.css'
