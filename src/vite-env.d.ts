/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_KEYCLOAK_URL?: string
  readonly VITE_KEYCLOAK_REDIRECT_URI?: string
  readonly VITE_KEYCLOAK_REALM?: string
  readonly VITE_KEYCLOAK_CLIENT_ID?: string
  readonly VITE_APP2_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare module 'app2/App' {
  import type { ComponentType } from 'react'

  const DashboardApp: ComponentType<{
    userLabel?: string
    onLogout?: () => void
  }>
  export default DashboardApp
}
