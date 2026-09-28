[CmdletBinding()]
param(
    [switch]$IncludeE2E,
    [switch]$IncludeOps,
    [switch]$Install,
    [switch]$RuntimeCheckOnly,
    [Alias('NodePath')]
    [string]$NodeExecutable,
    [Alias('PnpmPath')]
    [string]$PnpmModule,
    [Alias('LogDirectory')]
    [string]$LogRoot
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location -LiteralPath $repositoryRoot

$requiredNodeVersion = '24.19.0'
$requiredNodeOutput = "v$requiredNodeVersion"
$requiredPnpmVersion = '11.22.0'

function Resolve-AbsolutePath {
    param(
        [Parameter(Mandatory)]
        [AllowEmptyString()]
        [string]$Path
    )

    if ([IO.Path]::IsPathRooted($Path)) {
        return [IO.Path]::GetFullPath($Path)
    }

    return [IO.Path]::GetFullPath((Join-Path $repositoryRoot $Path))
}

function Invoke-VersionCommand {
    param(
        [Parameter(Mandatory)]
        [string]$Executable,
        [Parameter(Mandatory)]
        [string[]]$Arguments
    )

    try {
        $outputLines = @(& $Executable @Arguments 2>&1)
        $exitCode = $LASTEXITCODE
    } catch {
        throw "Unable to execute '$Executable': $($_.Exception.Message)"
    }

    $output = (($outputLines | ForEach-Object { $_.ToString() }) -join "`n").Trim()
    if ($exitCode -ne 0) {
        throw "Version check failed for '$Executable' (exit $exitCode): $output"
    }

    return $output
}

function Add-UniquePath {
    param(
        [Parameter(Mandatory)]
        [AllowEmptyCollection()]
        [System.Collections.Generic.List[string]]$Paths,
        [Parameter(Mandatory)]
        [AllowEmptyString()]
        [string]$Path
    )

    if ([string]::IsNullOrWhiteSpace($Path)) {
        return
    }

    $absolutePath = Resolve-AbsolutePath $Path
    if (-not $Paths.Contains($absolutePath)) {
        [void]$Paths.Add($absolutePath)
    }
}

function Resolve-PinnedNodeExecutable {
    param(
        [string]$Override
    )

    if ([string]::IsNullOrWhiteSpace($Override) -and -not [string]::IsNullOrWhiteSpace($env:JA_NODE_BIN)) {
        $Override = $env:JA_NODE_BIN
    }

    if (-not [string]::IsNullOrWhiteSpace($Override)) {
        $explicitPath = Resolve-AbsolutePath $Override
        if (-not (Test-Path -LiteralPath $explicitPath -PathType Leaf)) {
            throw "Pinned Node executable was not found: $explicitPath"
        }

        return $explicitPath
    }

    $candidatePaths = [System.Collections.Generic.List[string]]::new()
    $candidateRoots = [System.Collections.Generic.List[string]]::new()

    $localAppData = $env:LOCALAPPDATA
    if ([string]::IsNullOrWhiteSpace($localAppData)) {
        $localAppData = [Environment]::GetFolderPath([Environment+SpecialFolder]::LocalApplicationData)
    }
    Add-UniquePath -Paths $candidateRoots -Path $localAppData

    # This repository is commonly checked out below the user profile. Deriving
    # the profile path from the repository keeps the lookup portable and avoids
    # baking a workstation username or pnpm content hash into the gate.
    Add-UniquePath -Paths $candidateRoots -Path (Join-Path $repositoryRoot '..\..\..\..\AppData\Local')

    if (-not [string]::IsNullOrWhiteSpace($env:PNPM_HOME)) {
        Add-UniquePath -Paths $candidateRoots -Path $env:PNPM_HOME
    }

    foreach ($candidateRoot in $candidateRoots) {
        $versionRoot = Join-Path $candidateRoot 'pnpm\store\v11\links\@\node\24.19.0'
        if (-not (Test-Path -LiteralPath $versionRoot -PathType Container)) {
            continue
        }

        $packageDirectories = @(Get-ChildItem -LiteralPath $versionRoot -Directory -Force | Sort-Object Name)
        foreach ($packageDirectory in $packageDirectories) {
            Add-UniquePath -Paths $candidatePaths -Path (
                Join-Path $packageDirectory.FullName 'node_modules\node\bin\node.exe'
            )
            Add-UniquePath -Paths $candidatePaths -Path (
                Join-Path $packageDirectory.FullName 'node_modules\node\bin\node'
            )
        }
    }

    # A machine-level Node 24 installation is also a valid pinned executable;
    # it is accepted only after its reported version is checked below.
    foreach ($commandName in @('node.exe', 'node')) {
        $command = Get-Command $commandName -ErrorAction SilentlyContinue |
            Where-Object { $_.CommandType -eq 'Application' } |
            Select-Object -First 1
        if ($null -ne $command) {
            Add-UniquePath -Paths $candidatePaths -Path $command.Source
        }
    }

    $observedVersions = [System.Collections.Generic.List[string]]::new()
    foreach ($candidatePath in $candidatePaths) {
        if (-not (Test-Path -LiteralPath $candidatePath -PathType Leaf)) {
            continue
        }

        try {
            $reportedVersion = Invoke-VersionCommand -Executable $candidatePath -Arguments @('--version')
        } catch {
            $reportedVersion = "error: $($_.Exception.Message)"
        }
        [void]$observedVersions.Add("$candidatePath => $reportedVersion")
        if ($reportedVersion -eq $requiredNodeOutput) {
            return (Resolve-AbsolutePath $candidatePath)
        }
    }

    $observed = if ($observedVersions.Count -gt 0) { $observedVersions -join '; ' } else { 'none' }
    throw "Pinned Node $requiredNodeVersion executable was not found. Candidates: $observed"
}

function Resolve-PnpmModule {
    param(
        [string]$Override
    )

    if ([string]::IsNullOrWhiteSpace($Override) -and -not [string]::IsNullOrWhiteSpace($env:JA_PNPM_MODULE)) {
        $Override = $env:JA_PNPM_MODULE
    }

    if (-not [string]::IsNullOrWhiteSpace($Override)) {
        $explicitPath = Resolve-AbsolutePath $Override
        if (-not (Test-Path -LiteralPath $explicitPath -PathType Leaf)) {
            throw "pnpm module was not found: $explicitPath"
        }

        return $explicitPath
    }

    $candidatePaths = [System.Collections.Generic.List[string]]::new()
    foreach ($commandName in @('pnpm.cmd', 'pnpm.exe', 'pnpm')) {
        $command = Get-Command $commandName -ErrorAction SilentlyContinue |
            Where-Object { $_.CommandType -in @('Application', 'ExternalScript') } |
            Select-Object -First 1
        if ($null -eq $command -or [string]::IsNullOrWhiteSpace($command.Source)) {
            continue
        }

        $launcherDirectory = Split-Path -Parent $command.Source
        Add-UniquePath -Paths $candidatePaths -Path (
            Join-Path $launcherDirectory 'node_modules\pnpm\bin\pnpm.mjs'
        )
    }

    $applicationData = $env:APPDATA
    if ([string]::IsNullOrWhiteSpace($applicationData)) {
        $applicationData = [Environment]::GetFolderPath([Environment+SpecialFolder]::ApplicationData)
    }
    if (-not [string]::IsNullOrWhiteSpace($applicationData)) {
        Add-UniquePath -Paths $candidatePaths -Path (
            Join-Path $applicationData 'npm\node_modules\pnpm\bin\pnpm.mjs'
        )
    }
    if (-not [string]::IsNullOrWhiteSpace($env:PNPM_HOME)) {
        Add-UniquePath -Paths $candidatePaths -Path (
            Join-Path $env:PNPM_HOME 'node_modules\pnpm\bin\pnpm.mjs'
        )
    }

    foreach ($candidatePath in $candidatePaths) {
        if (Test-Path -LiteralPath $candidatePath -PathType Leaf) {
            return (Resolve-AbsolutePath $candidatePath)
        }
    }

    throw 'pnpm module was not found. Install pnpm 11.22.0 or pass -PnpmModule explicitly.'
}

function Assert-PinnedRuntime {
    $resolvedNode = Resolve-PinnedNodeExecutable -Override $NodeExecutable
    $reportedNodeVersion = Invoke-VersionCommand -Executable $resolvedNode -Arguments @('--version')
    if ($reportedNodeVersion -ne $requiredNodeOutput) {
        throw "Required Node $requiredNodeVersion (reported as $requiredNodeOutput), but '$resolvedNode' reports '$reportedNodeVersion'."
    }

    $resolvedPnpm = Resolve-PnpmModule -Override $PnpmModule
    $reportedPnpmVersion = Invoke-VersionCommand -Executable $resolvedNode -Arguments @($resolvedPnpm, '--version')
    if ($reportedPnpmVersion -ne $requiredPnpmVersion) {
        throw "Required pnpm $requiredPnpmVersion, but '$resolvedPnpm' reports '$reportedPnpmVersion' under '$resolvedNode'."
    }

    return [pscustomobject]@{
        NodeExecutable = $resolvedNode
        NodeVersion = $reportedNodeVersion
        PnpmModule = $resolvedPnpm
        PnpmVersion = $reportedPnpmVersion
    }
}

# Runtime validation is deliberately the first operation that can fail after
# locating the repository. In particular, do not create an evidence directory
# until both executable versions have been checked.
$runtime = Assert-PinnedRuntime
Write-Host "Pinned runtime validated: Node $($runtime.NodeVersion); pnpm $($runtime.PnpmVersion)" -ForegroundColor Green
if ($RuntimeCheckOnly) {
    return
}

$resolvedLogRoot = if ([string]::IsNullOrWhiteSpace($LogRoot)) {
    Resolve-AbsolutePath 'artifacts\quality-gates'
} else {
    Resolve-AbsolutePath $LogRoot
}
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$logDir = Join-Path $resolvedLogRoot $stamp
[IO.Directory]::CreateDirectory($logDir) | Out-Null

$previousPath = $env:PATH
$previousNodeExecPath = [Environment]::GetEnvironmentVariable('npm_node_execpath', 'Process')
$previousNodePath = [Environment]::GetEnvironmentVariable('NODE', 'Process')
$nodeDirectory = Split-Path -Parent $runtime.NodeExecutable
$qualityRuntimeRoot = Join-Path ([IO.Path]::GetTempPath()) ("ja-quality-gates-" + [guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($qualityRuntimeRoot) | Out-Null
$managedEnvironment = @{
    JA_DATABASE_PATH = Join-Path $qualityRuntimeRoot 'quality-gates.sqlite'
    JA_DOCUMENT_ROOT = Join-Path $qualityRuntimeRoot 'documents'
    JA_MIGRATIONS_PATH = Join-Path $repositoryRoot 'migrations'
    JA_TENANT_ID = 'quality-gate-tenant'
    JA_DEPLOYMENT_ID = 'quality-gate-deployment'
    JA_DEPLOYMENT_BINDING_SECRET = 'quality-gate-binding-secret-client-essential'
}
$previousManagedEnvironment = @{}

try {
    # Lifecycle scripts and nested pnpm invocations must resolve the same Node
    # executable as the top-level pnpm process, even when the host PATH points
    # at another Node installation.
    $env:PATH = "$nodeDirectory$([IO.Path]::PathSeparator)$previousPath"
    [Environment]::SetEnvironmentVariable('npm_node_execpath', $runtime.NodeExecutable, 'Process')
    [Environment]::SetEnvironmentVariable('NODE', $runtime.NodeExecutable, 'Process')
    foreach ($name in $managedEnvironment.Keys) {
        $previousManagedEnvironment[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
        [Environment]::SetEnvironmentVariable($name, $managedEnvironment[$name], 'Process')
    }

    function Invoke-Gate {
        param(
            [Parameter(Mandatory)]
            [string]$Name,
            [Parameter(Mandatory)]
            [string[]]$Arguments
        )

        Write-Host "`n=== $Name ===" -ForegroundColor Cyan
        $log = Join-Path $logDir (($Name -replace '[^A-Za-z0-9_.-]', '_') + '.log')
        $logWriter = $null
        try {
            # Stream through a literal .NET writer so a caller-supplied log
            # root containing wildcard characters remains a safe filesystem
            # path. Tee-Object resolves provider paths and can reject such
            # otherwise valid directories on Windows.
            $logWriter = [IO.StreamWriter]::new(
                $log,
                $false,
                [Text.UTF8Encoding]::new($false)
            )
            & $runtime.NodeExecutable $runtime.PnpmModule @Arguments 2>&1 |
                ForEach-Object {
                    $line = $_.ToString()
                    $logWriter.WriteLine($line)
                    $logWriter.Flush()
                    Write-Output $line
                }
            $exitCode = $LASTEXITCODE
        } catch {
            throw "Gate failed: $Name (see $log): $($_.Exception.Message)"
        } finally {
            if ($null -ne $logWriter) {
                $logWriter.Dispose()
            }
        }
        if ($exitCode -ne 0) {
            throw "Gate failed: $Name (exit $exitCode; see $log)"
        }
    }

    if ($Install) {
        Invoke-Gate -Name 'install' -Arguments @('install', '--frozen-lockfile')
    }
    Invoke-Gate -Name 'format-check' -Arguments @('format:check')
    Invoke-Gate -Name 'lint' -Arguments @('lint')
    Invoke-Gate -Name 'typecheck' -Arguments @('typecheck')
    Invoke-Gate -Name 'unit' -Arguments @('test:unit')
    Invoke-Gate -Name 'reporting' -Arguments @('test:reporting')
    Invoke-Gate -Name 'integration' -Arguments @('test:integration')
    Invoke-Gate -Name 'invariants' -Arguments @('test:invariants')
    Invoke-Gate -Name 'security' -Arguments @('test:security')
    Invoke-Gate -Name 'offline' -Arguments @('test:offline')
    Invoke-Gate -Name 'db-check' -Arguments @('db:check')
    Invoke-Gate -Name 'db-integrity' -Arguments @('db:integrity')
    Invoke-Gate -Name 'build' -Arguments @('build')

    if ($IncludeE2E) {
        Invoke-Gate -Name 'e2e' -Arguments @('test:e2e')
    }

    if ($IncludeOps) {
        Invoke-Gate -Name 'backup-test' -Arguments @('ops:backup:test')
        Invoke-Gate -Name 'restore-test' -Arguments @('ops:restore-test')
        Invoke-Gate -Name 'continuity-test' -Arguments @(
            'exec',
            'vitest',
            'run',
            'tests/operations/continuity-backup.test.ts'
        )
        Invoke-Gate -Name 'continuity-readiness' -Arguments @('ops:continuity-readiness')
        Invoke-Gate -Name 'continuity-restore-drill' -Arguments @('ops:continuity-restore-drill')
    }

    Write-Host "`nAll selected gates passed. Logs: $logDir" -ForegroundColor Green
} finally {
    foreach ($name in $managedEnvironment.Keys) {
        [Environment]::SetEnvironmentVariable($name, $previousManagedEnvironment[$name], 'Process')
    }
    [Environment]::SetEnvironmentVariable('PATH', $previousPath, 'Process')
    [Environment]::SetEnvironmentVariable('npm_node_execpath', $previousNodeExecPath, 'Process')
    [Environment]::SetEnvironmentVariable('NODE', $previousNodePath, 'Process')
    $resolvedQualityRuntimeRoot = [IO.Path]::GetFullPath($qualityRuntimeRoot)
    $resolvedSystemTemp = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
    if ($resolvedQualityRuntimeRoot.StartsWith($resolvedSystemTemp, [StringComparison]::OrdinalIgnoreCase)) {
        Remove-Item -LiteralPath $resolvedQualityRuntimeRoot -Recurse -Force -ErrorAction SilentlyContinue
    }
}
