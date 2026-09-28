# Architecture Rules

1. One deployable modular monolith; modularity comes from boundaries, not network hops.
2. Route/UI layers orchestrate; business invariants live in domain/services/repositories.
3. Domain modules do not import portal components.
4. Finance/report artifacts depend on domain snapshots/contracts rather than portal UI state.
5. Jobs are durable/idempotent and expose state; user requests do not lie about completion.
6. Private storage is accessed through authorized, path-safe abstractions.
7. Shared UI contains primitives/tokens, not domain business rules.
8. Shared DB infrastructure contains connection/migration/transaction helpers, not every domain query.
9. Prefer explicit state machines/lifecycle functions over scattered status string assignments.
10. ML/data-readiness infrastructure is deferred post-core unless explicitly commissioned. Existing point-in-time records must still preserve historical known-state semantics and must not be corrupted by Essential work.
