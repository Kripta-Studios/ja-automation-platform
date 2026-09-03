[CmdletBinding()]
param(
  [string]$ReleaseDate = (Get-Date -Format 'yyyyMMdd'),
  [string]$RemoteHost = 'kripta',
  [string]$RemoteDirectory = '/home/kripta',
  [switch]$NoUpload,
  [switch]$SkipQualityGates,
  [switch]$Force,
  [switch]$AllowDirty
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location -LiteralPath $repositoryRoot

function Invoke-Checked {
  param(
    [Parameter(Mandatory)] [string]$Command,
    [Parameter(ValueFromRemainingArguments)] [string[]]$Arguments
  )

  & $Command @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "Command failed with exit code ${LASTEXITCODE}: $Command $($Arguments -join ' ')"
  }
}

$status = (& git status --porcelain=v1)
if ($LASTEXITCODE -ne 0) {
  throw 'Unable to read Git status.'
}
if ($status -and -not $AllowDirty) {
  throw 'The working tree is not clean. Commit the reviewed release before packaging it.'
}
if ($status -and $AllowDirty) {
  Write-Warning 'Packaging the current working tree snapshot explicitly; no branch commit will be created.'
}

$releaseFolder = "jaautomation-release-$ReleaseDate"
$zipName = "$releaseFolder-final.zip"
$zipPath = Join-Path $repositoryRoot $zipName
$checksumPath = "$zipPath.sha256"

if ((Test-Path -LiteralPath $zipPath) -and -not $Force) {
  throw "Release archive already exists: $zipPath. Use -Force to replace it."
}
if ($Force) {
  Remove-Item -LiteralPath $zipPath, $checksumPath -Force -ErrorAction SilentlyContinue
}

$pnpmLauncher = (Get-Command pnpm -ErrorAction Stop).Source
$pnpmHome = Split-Path -Parent $pnpmLauncher
$pnpmModule = Join-Path $pnpmHome 'node_modules/pnpm/bin/pnpm.mjs'
if (-not (Test-Path -LiteralPath $pnpmModule -PathType Leaf)) {
  throw "pnpm module not found at $pnpmModule"
}

function Invoke-PinnedPnpm {
  param([Parameter(ValueFromRemainingArguments)] [string[]]$Arguments)

  $pinnedArguments = @('dlx', 'node@24.19.0', $pnpmModule) + $Arguments
  Invoke-Checked -Command pnpm -Arguments $pinnedArguments
}

$temporaryRoot = Join-Path ([IO.Path]::GetTempPath()) ("ja-release-" + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $temporaryRoot | Out-Null
$buildRoot = Join-Path $temporaryRoot 'build-runtime'
$stageRoot = Join-Path $temporaryRoot 'stage'
New-Item -ItemType Directory -Path $buildRoot, $stageRoot | Out-Null

$managedEnvironment = @{
  JA_DATABASE_PATH = Join-Path $buildRoot 'release-build.sqlite'
  JA_DOCUMENT_ROOT = Join-Path $buildRoot 'documents'
  JA_MIGRATIONS_PATH = Join-Path $repositoryRoot 'migrations'
  JA_TENANT_ID = 'release-build-tenant'
  JA_DEPLOYMENT_ID = 'release-build-deployment'
  JA_DEPLOYMENT_BINDING_SECRET = 'release-build-binding-secret-2026-08-client-essential'
}
$previousEnvironment = @{}
$previousGitIndex = [Environment]::GetEnvironmentVariable('GIT_INDEX_FILE', 'Process')
$temporaryIndexPath = $null

try {
  foreach ($name in $managedEnvironment.Keys) {
    $previousEnvironment[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
    [Environment]::SetEnvironmentVariable($name, $managedEnvironment[$name], 'Process')
  }

  Invoke-PinnedPnpm @('install', '--frozen-lockfile')
  if (-not $SkipQualityGates) {
    # A clean clone has no generated Next.js declarations. Generate them before
    # the recursive typecheck so static image and route imports resolve.
    Invoke-PinnedPnpm @('--filter', '@ja/site', 'exec', 'next', 'typegen')
    # Do not gate a deployable release on repo-wide hygiene checks. HEAD contains
    # tracked orchestration/traces/scratch artifacts outside the release archive;
    # typechecking and the three production builds below remain blocking gates.
    Invoke-PinnedPnpm @('--recursive', '--if-present', 'typecheck')
  }

  Invoke-PinnedPnpm @('--filter', '@ja/site', 'build')
  Invoke-PinnedPnpm @('--filter', '@ja/portal', 'build')
  Invoke-PinnedPnpm @('jobs:build')

  $requiredBuildOutputs = @(
    'website/.next/standalone/website/server.js',
    'apps/portal/.svelte-kit/output/server/index.js',
    'deployment/jobs-build/jobs-run.mjs'
  )
  foreach ($relativePath in $requiredBuildOutputs) {
    if (-not (Test-Path -LiteralPath (Join-Path $repositoryRoot $relativePath) -PathType Leaf)) {
      throw "Required production build output is missing: $relativePath"
    }
  }

  $commit = (& git rev-parse HEAD).Trim()
  $branch = (& git branch --show-current).Trim()
  $sourceTar = Join-Path $temporaryRoot 'source.tar'
  $releasePaths = @(
    '.dockerignore',
    '.env.example',
    '.gitignore',
    '.node-version',
    '.nvmrc',
    'README.md',
    'package.json',
    'pnpm-lock.yaml',
    'pnpm-workspace.yaml',
    'tsconfig.json',
    'eslint.config.js',
    'prettier.config.mjs',
    'vitest.config.ts',
    'playwright.config.ts',
    'playwright.mvp.config.ts',
    'website',
    'apps',
    'packages',
    'migrations',
    'deployment',
    'docs',
    'scripts',
    'tests'
  )
  $archiveTreeish = 'HEAD'
  if ($AllowDirty) {
    $temporaryIndexPath = Join-Path $temporaryRoot 'worktree.index'
    $env:GIT_INDEX_FILE = $temporaryIndexPath
    Invoke-Checked -Command git -Arguments @('read-tree', 'HEAD')
    Invoke-Checked -Command git -Arguments (@('add', '--') + $releasePaths)
    $archiveTreeish = (Invoke-Checked -Command git -Arguments @('write-tree')).Trim()
    Write-Host "Working tree snapshot: $archiveTreeish"
  }
  $archiveArguments = @('archive', '--format=tar', "--prefix=$releaseFolder/", "--output=$sourceTar", $archiveTreeish, '--') + $releasePaths
  Invoke-Checked -Command git -Arguments $archiveArguments
  Invoke-Checked -Command tar -Arguments @('-xf', $sourceTar, '-C', $stageRoot)

  $releaseRoot = Join-Path $stageRoot $releaseFolder
  $buildInfo = @(
    "release=$releaseFolder",
    "commit=$commit",
    "branch=$branch",
    "built_at_utc=$([DateTime]::UtcNow.ToString('o'))",
    'node=24.19.0',
    'pnpm=11.22.0'
  )
  if ($AllowDirty) {
    $buildInfo += 'source_snapshot=working-tree'
    $buildInfo += "source_tree=$archiveTreeish"
    $buildInfo += 'archive_content=reviewed working-tree snapshot; production images rebuild from Dockerfiles'
  } else {
    $buildInfo += 'source_snapshot=HEAD'
    $buildInfo += 'archive_content=reviewed Git HEAD source; production images rebuild from Dockerfiles'
  }
  Set-Content -LiteralPath (Join-Path $releaseRoot 'RELEASE-BUILD.txt') -Value $buildInfo -Encoding utf8NoBOM

  $manifestPath = Join-Path $releaseRoot 'RELEASE-MANIFEST.sha256'
  $manifestLines = Get-ChildItem -LiteralPath $releaseRoot -File -Recurse |
    Where-Object { $_.FullName -ne $manifestPath } |
    Sort-Object FullName |
    ForEach-Object {
      $relative = [IO.Path]::GetRelativePath($releaseRoot, $_.FullName).Replace('\', '/')
      $hash = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
      "$hash  $relative"
    }
  Set-Content -LiteralPath $manifestPath -Value $manifestLines -Encoding ascii

  Invoke-Checked -Command tar -Arguments @('-a', '-cf', $zipPath, '-C', $stageRoot, $releaseFolder)

  $requiredArchiveEntries = @(
    "$releaseFolder/package.json",
    "$releaseFolder/pnpm-lock.yaml",
    "$releaseFolder/pnpm-workspace.yaml",
    "$releaseFolder/website/",
    "$releaseFolder/apps/portal/",
    "$releaseFolder/packages/",
    "$releaseFolder/migrations/",
    "$releaseFolder/deployment/compose.production.yml",
    "$releaseFolder/deployment/Dockerfile.site",
    "$releaseFolder/deployment/Dockerfile.portal",
    "$releaseFolder/deployment/Caddyfile.snippet",
    "$releaseFolder/RELEASE-MANIFEST.sha256"
  )
  $archiveEntries = @(Invoke-Checked -Command tar -Arguments @('-tf', $zipPath))
  foreach ($entry in $requiredArchiveEntries) {
    if ($archiveEntries -notcontains $entry) {
      throw "Release archive is missing required entry: $entry"
    }
  }
  if ($archiveEntries | Where-Object { $_ -match '(^|/)(\.git|node_modules|data|uploads|documents)(/|$)' }) {
    throw 'Release archive contains a forbidden repository, dependency, data, or private-file directory.'
  }
  if ($archiveEntries | Where-Object { $_ -match '(^|/)\.\.?(/|$)|\\' }) {
    throw 'Release archive contains an unsafe path.'
  }

  $zipHash = (Get-FileHash -LiteralPath $zipPath -Algorithm SHA256).Hash.ToLowerInvariant()
  Set-Content -LiteralPath $checksumPath -Value "$zipHash  $zipName" -Encoding ascii
  Write-Host "Release archive: $zipPath"
  Write-Host "SHA-256: $zipHash"

  if (-not $NoUpload) {
    $remoteZipPart = "$zipName.part"
    $checksumName = "$zipName.sha256"
    $remoteChecksumPart = "$checksumName.part"
    $deployerSource = Join-Path $releaseRoot 'deployment/scripts/jaautomation-zip-deploy'
    $installerSource = Join-Path $releaseRoot 'deployment/scripts/install-jaautomation-zip-deploy.sh'
    Invoke-Checked -Command scp -Arguments @($deployerSource, "${RemoteHost}:${RemoteDirectory}/jaautomation-zip-deploy")
    Invoke-Checked -Command scp -Arguments @($installerSource, "${RemoteHost}:${RemoteDirectory}/install-jaautomation-zip-deploy.sh")
    Invoke-Checked -Command scp -Arguments @($zipPath, "${RemoteHost}:${RemoteDirectory}/$remoteZipPart")
    Invoke-Checked -Command scp -Arguments @($checksumPath, "${RemoteHost}:${RemoteDirectory}/$remoteChecksumPart")
    $remoteResult = & ssh $RemoteHost "set -eu; cd '$RemoteDirectory'; test -f '$remoteZipPart'; test -f '$remoteChecksumPart'; mv -f -- '$remoteChecksumPart' '$checksumName'; mv -f -- '$remoteZipPart' '$zipName'; sha256sum -c '$checksumName'; sha256sum -- '$zipName'"
    if ($LASTEXITCODE -ne 0) {
      throw 'Remote ZIP finalization or checksum failed.'
    }
    $remoteHash = (($remoteResult | Select-Object -Last 1) -split '\s+')[0].ToLowerInvariant()
    if ($remoteHash -ne $zipHash) {
      throw "Remote checksum mismatch. Local=$zipHash Remote=$remoteHash"
    }
    Write-Host "Uploaded: ${RemoteHost}:${RemoteDirectory}/$zipName"
    Write-Host "Installer: ${RemoteHost}:${RemoteDirectory}/install-jaautomation-zip-deploy.sh"
  }
}
finally {
  foreach ($name in $managedEnvironment.Keys) {
    [Environment]::SetEnvironmentVariable($name, $previousEnvironment[$name], 'Process')
  }
  if ($null -ne $temporaryIndexPath) {
    if ($null -eq $previousGitIndex) {
      Remove-Item Env:GIT_INDEX_FILE -ErrorAction SilentlyContinue
    } else {
      [Environment]::SetEnvironmentVariable('GIT_INDEX_FILE', $previousGitIndex, 'Process')
    }
    if (Test-Path -LiteralPath $temporaryIndexPath) {
      Remove-Item -LiteralPath $temporaryIndexPath -Force -ErrorAction SilentlyContinue
    }
  }
  $resolvedTemporaryRoot = [IO.Path]::GetFullPath($temporaryRoot)
  $resolvedSystemTemp = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
  if ($resolvedTemporaryRoot.StartsWith($resolvedSystemTemp, [StringComparison]::OrdinalIgnoreCase)) {
    Remove-Item -LiteralPath $resolvedTemporaryRoot -Recurse -Force -ErrorAction SilentlyContinue
  }
}
