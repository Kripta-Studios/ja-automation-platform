# Orchestration helper scripts

- `audit-spec-coverage.py`: strict traceability gate.
- `detect-cross-agent-conflicts.py`: simple changed-path ownership guardrail; refine mapping after the architecture phase.
- `run-quality-gates.ps1`: executes the repository's pnpm test/build gates and logs output.
- `build-completion-report.py`: produces a completion-report scaffold from git, latest logs and traceability.
- `create-agent-worktrees.ps1`: optional worktree bootstrap for independent implementation streams.

These scripts assist Codex; they do not replace human/Codex semantic review.
