---
name: luna-first-routing
description: Classify J&A implementation work into A/B/C complexity and maximize safe Luna Max production implementation. Use before delegating implementation packets or when deciding between Luna Max, Sol Medium and Sol High.
---

# Luna-First Routing

## Principle

Prefer the least expensive/capable tier that can own the work **correctly**, but do not equate “Luna” with trivial work. Luna Max may own large, multi-file, production-facing and backend vertical slices when the semantic contract is stable.

## A → Luna Max (default)

Route to a Luna write profile when:

- inputs/outputs, lifecycle and invariants are already defined;
- ownership can be bounded without concurrent hot-file conflicts;
- failures can be caught by deterministic tests/browser evidence/reviewer;
- the agent is implementing rather than inventing ambiguous cross-domain truth.

Examples: frontend/components/forms, CRUD, stable API/server wiring, responsive migrations, report/industrial/business UI, deterministic adapters, tests, fixtures, docs, mechanical refactors, additive/mechanical migrations under an explicit migration contract, dataset/model-registry tooling under an explicit point-in-time contract.

## B → Sol Medium

Use a Sol domain lead only when the implementation itself must reason about unresolved non-local invariants: finance/accounting/billing truth, RBAC policy, cross-domain lifecycle, idempotency/job semantics, offline conflict semantics, leakage-sensitive temporal semantics, or migration meaning.

**Mandatory downward delegation:** once a B agent defines stable contracts, split remaining A work and send it to Luna Max.

## C → Sol High

Architecture, dependency DAG, cross-domain contracts, irreducibly risky strategy, conflict resolution, final integration/sign-off.

## Anti-patterns

Do NOT escalate to Sol because:

- the feature is important;
- it is production code;
- it touches backend code;
- it spans many files;
- it is a complete vertical slice;
- Luna would need to write a lot of code.

Escalate only for semantic/invariant ambiguity or irreducible cross-domain risk.

## Review separation

A Luna implementer must not be the independent Luna reviewer. Spawn a separate reviewer profile/instance.
