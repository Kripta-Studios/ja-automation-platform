param(
    [string]$BaseBranch = 'codex/v3-production-completion-orchestrated-20260819',
    [string]$ParentDir = '..\ja-agent-worktrees'
)

$ErrorActionPreference = 'Stop'
$roles = @(
    'frontend',
    'backend',
    'finance-reporting',
    'industrial',
    'business',
    'data-readiness'
)

New-Item -ItemType Directory -Force -Path $ParentDir | Out-Null
foreach ($role in $roles) {
    $branch = "codex/ja-v3-$role"
    $path = Join-Path $ParentDir $role
    if (Test-Path $path) {
        Write-Warning "Skipping existing worktree path: $path"
        continue
    }
    $exists = git show-ref --verify --quiet "refs/heads/$branch"; $code = $LASTEXITCODE
    if ($code -eq 0) {
        git worktree add $path $branch
    } else {
        git worktree add -b $branch $path $BaseBranch
    }
}

git worktree list
