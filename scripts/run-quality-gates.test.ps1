[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$qualityScript = Join-Path $PSScriptRoot 'run-quality-gates.ps1'
$pwshPath = (Get-Command pwsh -ErrorAction Stop).Source
$testRoot = Join-Path ([IO.Path]::GetTempPath()) ("ja-quality-gates-runtime-" + [guid]::NewGuid().ToString('N'))
$logRoot = Join-Path $testRoot 'logs [safe path]'
$failureLogRoot = Join-Path $testRoot 'failure logs [safe path]'
$fixtureRoot = Join-Path $testRoot 'fixtures'
New-Item -ItemType Directory -Path $fixtureRoot | Out-Null

function Invoke-QualityScript {
    param(
        [Parameter(Mandatory)]
        [string[]]$Arguments
    )

    $outputLines = @(& $pwshPath -NoLogo -NoProfile -ExecutionPolicy Bypass -File $qualityScript @Arguments 2>&1)
    $exitCode = $LASTEXITCODE
    [pscustomobject]@{
        ExitCode = $exitCode
        Output = (($outputLines | ForEach-Object { $_.ToString() }) -join "`n")
    }
}

function Assert-True {
    param(
        [Parameter(Mandatory)]
        [bool]$Condition,
        [Parameter(Mandatory)]
        [string]$Message
    )

    if (-not $Condition) {
        throw $Message
    }
}

try {
    $pnpmLauncher = Get-Command pnpm.cmd -ErrorAction SilentlyContinue
    if ($null -eq $pnpmLauncher) {
        $pnpmLauncher = Get-Command pnpm -ErrorAction Stop
    }
    $pnpmModule = Join-Path (Split-Path -Parent $pnpmLauncher.Source) 'node_modules\pnpm\bin\pnpm.mjs'
    Assert-True -Condition (Test-Path -LiteralPath $pnpmModule -PathType Leaf) -Message "pnpm module not found: $pnpmModule"

    $fakeNodeMismatch = Join-Path $fixtureRoot 'node25.ps1'
    Set-Content -LiteralPath $fakeNodeMismatch -Encoding utf8NoBOM -Value @'
param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Arguments)
Write-Output 'v25.8.1'
exit 0
'@
    $mismatchedNode = Invoke-QualityScript -Arguments @(
        '-RuntimeCheckOnly',
        '-NodeExecutable', $fakeNodeMismatch,
        '-PnpmModule', $pnpmModule,
        '-LogRoot', $logRoot
    )
    Assert-True -Condition ($mismatchedNode.ExitCode -ne 0) -Message 'A Node version mismatch unexpectedly passed.'
    Assert-True -Condition ($mismatchedNode.Output -match 'Required Node 24\.19\.0') -Message (
        "Node mismatch did not report the required version: $($mismatchedNode.Output)"
    )
    Assert-True -Condition (-not (Test-Path -LiteralPath $logRoot)) -Message (
        'A Node 25 mismatch created a quality-gate log directory before runtime validation completed.'
    )

    $fakePnpmMismatch = Join-Path $fixtureRoot 'pnpm-mismatch.ps1'
    Set-Content -LiteralPath $fakePnpmMismatch -Encoding utf8NoBOM -Value @'
param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Arguments)
if ($Arguments.Count -eq 1 -and $Arguments[0] -eq '--version') {
    Write-Output 'v24.19.0'
} else {
    Write-Output '11.21.0'
}
exit 0
'@
    $mismatchedPnpm = Invoke-QualityScript -Arguments @(
        '-RuntimeCheckOnly',
        '-NodeExecutable', $fakePnpmMismatch,
        '-PnpmModule', $pnpmModule,
        '-LogRoot', $logRoot
    )
    Assert-True -Condition ($mismatchedPnpm.ExitCode -ne 0) -Message 'A pnpm version mismatch unexpectedly passed.'
    Assert-True -Condition ($mismatchedPnpm.Output -match 'Required pnpm 11\.22\.0') -Message (
        "pnpm mismatch did not report the required version: $($mismatchedPnpm.Output)"
    )
    Assert-True -Condition (-not (Test-Path -LiteralPath $logRoot)) -Message (
        'A pnpm mismatch created a quality-gate log directory before runtime validation completed.'
    )

    $pinnedRuntime = Invoke-QualityScript -Arguments @(
        '-RuntimeCheckOnly',
        '-LogRoot', $logRoot
    )
    Assert-True -Condition ($pinnedRuntime.ExitCode -eq 0) -Message (
        "The discovered pinned runtime did not pass: $($pinnedRuntime.Output)"
    )
    Assert-True -Condition (
        $pinnedRuntime.Output -match 'Pinned runtime validated: Node v24\.19\.0; pnpm 11\.22\.0'
    ) -Message "Pinned runtime confirmation was not emitted: $($pinnedRuntime.Output)"
    Assert-True -Condition (-not (Test-Path -LiteralPath $logRoot)) -Message (
        'Runtime-only validation created quality-gate evidence unexpectedly.'
    )

    $fakeGateNode = Join-Path $fixtureRoot 'gate-runtime.ps1'
    $fakeGateInvocations = Join-Path $fixtureRoot 'gate-invocations.log'
    Set-Content -LiteralPath $fakeGateNode -Encoding utf8NoBOM -Value @'
param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Arguments)
if ($Arguments.Count -eq 1 -and $Arguments[0] -eq '--version') {
    Write-Output 'v24.19.0'
} elseif ($Arguments.Count -eq 2 -and $Arguments[1] -eq '--version') {
    Write-Output '11.22.0'
} else {
    $nodeDirectory = Split-Path -Parent $env:NODE
    $pathFirstEntry = ($env:PATH -split [IO.Path]::PathSeparator)[0]
    $gateArguments = $Arguments[1..($Arguments.Count - 1)] -join ' '
    if ($env:JA_QUALITY_GATE_TEST_FAIL_GATE -eq $Arguments[1]) {
        Write-Output "simulated gate failure: $($Arguments[1])"
        exit 17
    }
    Add-Content -LiteralPath $env:JA_QUALITY_GATE_TEST_INVOCATIONS -Value (
        "$($Arguments[1])|args=$gateArguments|node=$env:NODE|npm_node_execpath=$env:npm_node_execpath|path_first=$pathFirstEntry|node_directory=$nodeDirectory"
    ) -Encoding utf8NoBOM
    Write-Output "simulated gate: $($Arguments[1]); node=$env:NODE; npm_node_execpath=$env:npm_node_execpath; path_first=$pathFirstEntry"
}
exit 0
'@
    $previousTestInvocationPath = $env:JA_QUALITY_GATE_TEST_INVOCATIONS
    try {
        $env:JA_QUALITY_GATE_TEST_INVOCATIONS = $fakeGateInvocations
        $simulatedGates = Invoke-QualityScript -Arguments @(
            '-Install',
            '-NodeExecutable', $fakeGateNode,
            '-PnpmModule', $pnpmModule,
            '-IncludeE2E',
            '-IncludeOps',
            '-LogRoot', $logRoot
        )
    } finally {
        $env:JA_QUALITY_GATE_TEST_INVOCATIONS = $previousTestInvocationPath
    }
    Assert-True -Condition ($simulatedGates.ExitCode -eq 0) -Message (
        "The gates did not run through the validated executable: $($simulatedGates.Output)"
    )
    $expectedGates = @(
        'install',
        'format:check',
        'lint',
        'typecheck',
        'test:unit',
        'test:reporting',
        'test:integration',
        'test:invariants',
        'test:security',
        'test:offline',
        'db:check',
        'db:integrity',
        'build',
        'test:e2e',
        'ops:backup:test',
        'ops:restore-test',
        'exec',
        'ops:continuity-readiness',
        'ops:continuity-restore-drill'
    )
    $actualGateRecords = @(Get-Content -LiteralPath $fakeGateInvocations)
    $actualGates = @($actualGateRecords | ForEach-Object { ($_ -split '\|', 2)[0] })
    Assert-True -Condition ($actualGates.Count -eq $expectedGates.Count) -Message (
        "Expected $($expectedGates.Count) pinned gate invocations, got $($actualGates.Count)."
    )
    for ($index = 0; $index -lt $expectedGates.Count; $index++) {
        Assert-True -Condition ($actualGates[$index] -eq $expectedGates[$index]) -Message (
            "Gate $index used '$($actualGates[$index])'; expected '$($expectedGates[$index])'."
        )
    }
    $expectedNodePath = [IO.Path]::GetFullPath($fakeGateNode)
    $expectedNodeDirectory = [IO.Path]::GetFullPath($fixtureRoot)
    Assert-True -Condition (
        @($actualGateRecords | Where-Object { $_ -notmatch ("\|node=" + [regex]::Escape($expectedNodePath) + "\|") }).Count -eq 0
    ) -Message 'At least one gate did not receive the pinned Node path through NODE.'
    Assert-True -Condition (
        @($actualGateRecords | Where-Object { $_ -notmatch ("\|npm_node_execpath=" + [regex]::Escape($expectedNodePath) + "\|") }).Count -eq 0
    ) -Message 'At least one lifecycle gate did not receive npm_node_execpath for the pinned Node.'
    Assert-True -Condition (
        @($actualGateRecords | Where-Object { $_ -notmatch ("\|path_first=" + [regex]::Escape($expectedNodeDirectory) + "\|") }).Count -eq 0
    ) -Message 'At least one nested gate did not put the pinned Node directory first on PATH.'
    Assert-True -Condition (
        @($actualGateRecords | Where-Object { $_ -match '\|args=install --frozen-lockfile\|' }).Count -eq 1
    ) -Message 'The optional install gate did not retain the frozen-lockfile arguments.'
    Assert-True -Condition (
        @($actualGateRecords | Where-Object { $_ -match '\|args=exec vitest run tests/operations/continuity-backup\.test\.ts\|' }).Count -eq 1
    ) -Message 'The deterministic continuity test gate did not retain its exact Vitest command.'
    $logDirectories = @(Get-ChildItem -LiteralPath $logRoot -Directory -Force)
    Assert-True -Condition ($logDirectories.Count -eq 1) -Message (
        "Expected one quality-gate evidence directory, got $($logDirectories.Count)."
    )
    $logFiles = @(Get-ChildItem -LiteralPath $logDirectories[0].FullName -File -Force)
    Assert-True -Condition ($logFiles.Count -eq $expectedGates.Count) -Message (
        "Expected one log per gate, got $($logFiles.Count)."
    )
    $expectedLogFiles = @(
        'install.log',
        'format-check.log',
        'lint.log',
        'typecheck.log',
        'unit.log',
        'reporting.log',
        'integration.log',
        'invariants.log',
        'security.log',
        'offline.log',
        'db-check.log',
        'db-integrity.log',
        'build.log',
        'e2e.log',
        'backup-test.log',
        'restore-test.log',
        'continuity-test.log',
        'continuity-readiness.log',
        'continuity-restore-drill.log'
    )
    $actualLogFiles = @($logFiles | ForEach-Object Name | Sort-Object)
    $expectedLogFiles = @($expectedLogFiles | Sort-Object)
    Assert-True -Condition (
        @(Compare-Object -ReferenceObject $expectedLogFiles -DifferenceObject $actualLogFiles).Count -eq 0
    ) -Message (
        "Quality-gate log names changed unexpectedly: expected $($expectedLogFiles -join ', '), got $($actualLogFiles -join ', ')."
    )
    $capturedLogOutput = (($logFiles | Get-Content -Raw) -join "`n")
    Assert-True -Condition ([bool]($capturedLogOutput -match 'simulated gate')) -Message (
        'Pinned gate output was not captured in the gate evidence logs.'
    )

    $previousFailureGate = $env:JA_QUALITY_GATE_TEST_FAIL_GATE
    $previousFailureInvocationPath = $env:JA_QUALITY_GATE_TEST_INVOCATIONS
    try {
        $env:JA_QUALITY_GATE_TEST_FAIL_GATE = 'lint'
        $env:JA_QUALITY_GATE_TEST_INVOCATIONS = $fakeGateInvocations
        $failedGate = Invoke-QualityScript -Arguments @(
            '-NodeExecutable', $fakeGateNode,
            '-PnpmModule', $pnpmModule,
            '-LogRoot', $failureLogRoot
        )
    } finally {
        $env:JA_QUALITY_GATE_TEST_FAIL_GATE = $previousFailureGate
        $env:JA_QUALITY_GATE_TEST_INVOCATIONS = $previousFailureInvocationPath
    }
    Assert-True -Condition ($failedGate.ExitCode -ne 0) -Message 'A failed gate unexpectedly returned success.'
    Assert-True -Condition ($failedGate.Output -match 'Gate failed: lint') -Message (
        "The failed gate did not identify lint: $($failedGate.Output)"
    )
    $failureLogDirectories = @(Get-ChildItem -LiteralPath $failureLogRoot -Directory -Force)
    Assert-True -Condition ($failureLogDirectories.Count -eq 1) -Message (
        "Expected one failed-run evidence directory, got $($failureLogDirectories.Count)."
    )
    $failureLogFiles = @(Get-ChildItem -LiteralPath $failureLogDirectories[0].FullName -File -Force)
    Assert-True -Condition ($failureLogFiles.Count -eq 2) -Message (
        "Expected format-check and lint logs for the failed run, got $($failureLogFiles.Count)."
    )
    $lintFailureLog = Join-Path $failureLogDirectories[0].FullName 'lint.log'
    Assert-True -Condition (
        (Get-Content -Raw -LiteralPath $lintFailureLog) -match 'simulated gate failure: lint'
    ) -Message 'The failing gate output was not captured before the quality gate stopped.'

    $qualitySource = Get-Content -Raw -LiteralPath $qualityScript
    Assert-True -Condition ($qualitySource -notmatch '46d4feb73308ba3e784dae2d6e54abf2929e30ee00') -Message (
        'The production gate contains a workstation-specific pnpm content hash.'
    )
    Assert-True -Condition ($qualitySource -notmatch 'Álvaro Schwiedop') -Message (
        'The production gate contains a workstation-specific username.'
    )

    Write-Host 'run-quality-gates runtime tests passed.' -ForegroundColor Green
} finally {
    if (Test-Path -LiteralPath $testRoot) {
        Remove-Item -LiteralPath $testRoot -Recurse -Force -ErrorAction SilentlyContinue
    }
}
