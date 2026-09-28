# Orchestration helper scripts

- `audit-spec-coverage.py`: authoritative Client Essential checklist gate; historical RTM/deferred roadmap rows are not release blockers.
- `detect-cross-agent-conflicts.py`: simple changed-path ownership guardrail; refine mapping after the architecture phase.
- `run-quality-gates.ps1`: executes the repository's pnpm test/build gates and logs output.
- `build-completion-report.py`: produces `artifacts/CLIENT_ESSENTIAL_COMPLETION_REPORT.md` from git, latest logs and the Essential checklist.
- `create-agent-worktrees.ps1`: optional worktree bootstrap for independent implementation streams.
- `build-release-and-upload.ps1`: runs the pinned Node 24 production builds, creates a source ZIP from a clean reviewed commit, verifies its shape and SHA-256, and uploads it atomically to the configured VPS. See `docs/RELEASE_ZIP_DEPLOY.md`.

These scripts assist Codex; they do not replace human/Codex semantic review.
