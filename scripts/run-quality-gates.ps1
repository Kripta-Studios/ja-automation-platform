param(
    [switch]$IncludeE2E,
    [switch]$IncludeOps,
    [switch]$Install
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$logDir = Join-Path $root "artifacts/quality-gates/$stamp"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

function Invoke-Gate([string]$Name, [string]$Command) {
    Write-Host "`n=== $Name ===" -ForegroundColor Cyan
    $log = Join-Path $logDir ("$Name.log" -replace '[^A-Za-z0-9_.-]','_')
    & pwsh -NoLogo -NoProfile -Command $Command 2>&1 | Tee-Object -FilePath $log
    if ($LASTEXITCODE -ne 0) {
        throw "Gate failed: $Name (see $log)"
    }
}

if ($Install) { Invoke-Gate 'install' 'pnpm install --frozen-lockfile' }
Invoke-Gate 'format-check' 'pnpm format:check'
Invoke-Gate 'lint' 'pnpm lint'
Invoke-Gate 'typecheck' 'pnpm typecheck'
Invoke-Gate 'unit' 'pnpm test:unit'
Invoke-Gate 'reporting' 'pnpm test:reporting'
Invoke-Gate 'integration' 'pnpm test:integration'
Invoke-Gate 'invariants' 'pnpm test:invariants'
Invoke-Gate 'security' 'pnpm test:security'
Invoke-Gate 'offline' 'pnpm test:offline'
Invoke-Gate 'db-check' 'pnpm db:check'
Invoke-Gate 'db-integrity' 'pnpm db:integrity'
Invoke-Gate 'build' 'pnpm build'

if ($IncludeE2E) {
    Invoke-Gate 'e2e' 'pnpm test:e2e'
}

if ($IncludeOps) {
    Invoke-Gate 'backup-test' 'pnpm ops:backup:test'
    Invoke-Gate 'restore-test' 'pnpm ops:restore-test'
}

Write-Host "`nAll selected gates passed. Logs: $logDir" -ForegroundColor Green
