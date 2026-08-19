---
name: architecture-decomposition
description: Safely decompose J&A megafiles into modular-monolith domain modules/components without behavior loss. Use when splitting PortalShell, portal CSS, repository.ts or v3-repository.ts; not for unrelated small changes.
---

# Architecture Decomposition

1. Characterize existing behavior/tests and hot dependencies before moving code.
2. Extract by cohesive domain, not arbitrary file-size chunks.
3. Keep public contracts stable or migrate callers atomically.
4. Prefer small mechanical extraction commits before functional changes where practical.
5. Avoid circular imports and duplicate business rules.
6. Keep shared UI tokens/primitives separate from domain presentation.
7. Keep shared DB infrastructure separate from domain repositories/services.
8. Re-run typecheck and affected tests after each extraction tranche.
9. Do not combine a risky migration, huge refactor and unrelated feature in one unreviewable change.
