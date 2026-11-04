// The shell's Rsbuild build: the platform plugin (Module Federation v1 with React, the OTel API and
// every SDK subpath shared as strict singletons, CSP-safe output, chunk integrity), plus React,
// Tailwind CSS (postcss.config.js), static files from public/, /version.json and the dev server.
import { readFileSync } from 'node:fs'
import { defineConfig, type RsbuildPlugin } from '@rsbuild/core'
import { pluginReact } from '@rsbuild/plugin-react'
import { pluginPlatform } from '@bcbp-solutions-fzc-llc/webpack-preset/rsbuild'
import { devPlatformMiddleware } from './config/dev-platform.mjs'

const root = import.meta.dirname
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string }

/** /version.json tells running tabs that a new build is live (SDK startVersionPolling). */
function pluginVersionJson(version: string): RsbuildPlugin {
  return {
    name: 'web-shell:version-json',
    setup(api) {
      api.processAssets({ stage: 'additional' }, ({ compilation, sources }) => {
        compilation.emitAsset('version.json', new sources.RawSource(`${JSON.stringify({ version })}\n`))
      })
    },
  }
}

export default defineConfig(({ envMode }) => {
  const prod = envMode === 'production'
  const environment = process.env.PLATFORM_ENVIRONMENT ?? (prod ? 'prod' : 'local')
  const buildVersion = process.env.BUILD_VERSION ?? pkg.version

  return {
    plugins: [pluginReact(), pluginPlatform({ role: 'shell' }), pluginVersionJson(buildVersion)],
    source: {
      entry: { index: './src/index.ts' },
      define: {
        __ENVIRONMENT__: JSON.stringify(environment),
        __BUILD_VERSION__: JSON.stringify(buildVersion),
      },
    },
    html: { template: './index.html' },
    output: {
      // Everything hashed lives under /assets/ (nginx and CloudFront serve it immutable). The preset
      // already names the JS that way; these cover the files Rsbuild's own rules emit.
      distPath: { css: 'assets', font: 'assets', image: 'assets', svg: 'assets', media: 'assets', wasm: 'assets', assets: 'assets' },
      sourceMap: { css: false },
      // External script tags only: CSP script-src 'self' allows no inline script.
      inlineScripts: false,
      inlineStyles: false,
    },
    // Root-relative url()s in the CSS point at files in public/; leave them as written.
    tools: { cssLoader: { url: false } },
    server: {
      port: 5001,
      strictPort: true,
      host: 'localhost',
      historyApiFallback: true,
      // `rsbuild dev` and `rsbuild preview`: local runtime config, remote manifest and IAM stubs,
      // ahead of Rsbuild's own middlewares.
      setup: ({ server }) => {
        server.middlewares.use(devPlatformMiddleware(root))
      },
    },
    dev: { hmr: false, liveReload: true },
  }
})
