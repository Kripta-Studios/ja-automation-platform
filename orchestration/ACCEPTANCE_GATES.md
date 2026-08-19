# Acceptance Gates

## Gate 0 — Baseline
- exact branch/HEAD recorded
- baseline tests recorded
- known UI/export bugs reproduced or mapped

## Gate 1 — Decomposition
- typecheck/build green
- no behavior regression
- hot-file ownership reduced
- no circular/duplicate domain rules

## Gate 2 — P0 defects
- every FIX-* regression covered
- mobile QA pass
- finance integrity pass
- spec auditor pass for P0

## Gate 3 — Industrial
- lifecycle/RBAC/version/audit tests pass
- field/mobile workflows pass

## Gate 4 — Business
- finance/lifecycle integrity pass
- import/export failure modes pass
- operations centers reflect real job/artifact state

## Gate 5 — Data readiness
- leakage reviewer pass
- reproducible snapshots/export manifests
- unvalidated models clearly disabled/experimental

## Gate 7 — Release
- full quality gates green
- traceability mandatory scope PASS
- security + finance + spec independent reviews pass
- final Sol/high integration reviewer READY
