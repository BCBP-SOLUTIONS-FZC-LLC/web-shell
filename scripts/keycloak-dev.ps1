# Start local Keycloak (Docker). Run from the web-shell folder in PowerShell or Windows Terminal.
$ErrorActionPreference = 'Stop'
$ProjectRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$ComposeFile = Join-Path $ProjectRoot 'docker-compose.keycloak.yml'

$dockerCandidates = @(
  $env:DOCKER_CLI,
  "$env:ProgramFiles\Docker\Docker\resources\bin\docker.exe",
  "${env:ProgramFiles(x86)}\Docker\Docker\resources\bin\docker.exe"
) | Where-Object { $_ -and (Test-Path $_) }

$Docker = $dockerCandidates | Select-Object -First 1
if (-not $Docker) {
  $cmd = Get-Command docker -ErrorAction SilentlyContinue
  if ($cmd) { $Docker = $cmd.Source }
}

if (-not $Docker) {
  Write-Host ''
  Write-Host 'Docker CLI not found.' -ForegroundColor Red
  Write-Host '1. Open Docker Desktop and wait until the engine is running.'
  Write-Host '2. Docker Desktop -> Settings -> General -> enable CLI / PATH (wording may vary).'
  Write-Host '3. Close and reopen PowerShell, then run this script again.'
  Write-Host ''
  Write-Host 'Or set DOCKER_CLI to the full path of docker.exe, e.g.:'
  Write-Host '  $env:DOCKER_CLI = "C:\Program Files\Docker\Docker\resources\bin\docker.exe"'
  exit 1
}

Write-Host "Using Docker: $Docker"
Set-Location $ProjectRoot
& $Docker compose -f $ComposeFile up -d @args
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host ''
Write-Host 'Waiting for Keycloak on http://localhost:8080 (up to ~3 min)...'
$deadline = (Get-Date).AddMinutes(3)
$ok = $false
while ((Get-Date) -lt $deadline) {
  try {
    $r = Invoke-WebRequest -Uri 'http://127.0.0.1:8080/realms/tenant-bcbp/.well-known/openid-configuration' -UseBasicParsing -TimeoutSec 5
    if ($r.StatusCode -eq 200) {
      $ok = $true
      break
    }
  } catch {
    Start-Sleep -Seconds 5
  }
}

if ($ok) {
  Write-Host 'Keycloak OK — refresh http://localhost:5001 and sign in.' -ForegroundColor Green
  exit 0
}

Write-Host 'Container started but Keycloak is not ready yet. Run: npm run keycloak:logs' -ForegroundColor Yellow
exit 1
