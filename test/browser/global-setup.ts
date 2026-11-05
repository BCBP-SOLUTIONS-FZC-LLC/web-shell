// Starts the app and the fake Keycloak for the whole run; the workers read their URLs from
// BROWSER_APP_URL and BROWSER_IDP_URL.
import { startServers } from './server'

export default async function globalSetup(): Promise<() => Promise<void>> {
  const servers = await startServers()
  process.env.BROWSER_APP_URL = servers.app
  process.env.BROWSER_IDP_URL = servers.idp
  return servers.close
}
