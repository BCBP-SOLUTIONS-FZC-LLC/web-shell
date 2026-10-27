import path from 'node:path'
import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { federation } from '@module-federation/vite'
import { defineConfig, loadEnv } from 'vite'
import moduleFederationConfig from './module-federation.config.ts'

const projectRoot = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, projectRoot, '')
  const keycloakUrlRaw = (env.VITE_KEYCLOAK_URL || 'http://localhost:8080').replace(/\/$/, '')
  const keycloakUrl = keycloakUrlRaw.replace(/\/\/localhost(?=[:/])/i, '//127.0.0.1')
  const app2Url = (env.VITE_APP2_URL || 'http://localhost:5002').replace(/\/$/, '')

  return {
    plugins: [
      tailwindcss(),
      react(),
      federation({
        ...moduleFederationConfig,
        remotes: {
          app2: {
            type: 'module',
            name: 'app2',
            entry: `${app2Url}/remoteEntry.js`,
            entryGlobalName: 'app2',
            shareScope: 'default',
          },
        },
      }),
    ],
    server: {
      port: 5001,
      strictPort: true,
      origin: 'http://localhost:5001',
      proxy: {
        '/__kc': {
          target: keycloakUrl,
          changeOrigin: true,
          rewrite: (path: string) => path.replace(/^\/__kc/, ''),
        },
      },
    },
    preview: {
      port: 5001,
      strictPort: true,
    },
    build: {
      target: 'esnext',
      modulePreload: false,
      minify: false,
      cssCodeSplit: false,
    },
  }
})
