const bases = ['http://127.0.0.1:8080', 'http://localhost:8080']
const realm = process.env.KEYCLOAK_REALM || 'tenant-bcbp'
const path = `/realms/${encodeURIComponent(realm)}/.well-known/openid-configuration`

for (const base of bases) {
  const url = `${base}${path}`
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(8000) })
    if (response.ok) {
      console.log(`Keycloak OK: ${url}`)
      process.exit(0)
    }
    console.log(`Keycloak responded ${response.status}: ${url}`)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.log(`Keycloak unreachable: ${url} (${message})`)
  }
}

console.error('')
console.error('Nothing is listening on port 8080 (or realm "tenant-bcbp" is missing).')
console.error('1. Open Docker Desktop — engine must be running.')
console.error('2. From app1: npm run keycloak:dev:detach')
console.error('3. Watch logs: npm run keycloak:logs')
console.error('4. Wait until: npm run keycloak:status')
process.exit(1)
