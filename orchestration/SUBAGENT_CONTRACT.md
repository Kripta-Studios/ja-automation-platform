# Subagent Contract

A subagent is a bounded contributor, not an autonomous project owner.

- Respect assigned write paths.
- Read the nearest AGENTS.md before edits.
- Do not expand scope silently.
- Do not edit authoritative requirements to make implementation appear compliant.
- Do not delete failing tests without explicit requirement justification.
- Never hide a blocker in a success summary.
- Return exact files, tests, migrations, assumptions and residual risks.
- If another work packet owns the required interface, request the change through the parent rather than editing across ownership.
- Review agents are read-only and must remain independent of implementer self-assessment.

## Complexity routing requirement

Every write packet MUST be classified before spawn:

- **A → Luna Max by default.** Stable contract, bounded ownership, low ambiguity. Luna may own substantial production code and complete low-risk vertical slices, not just boilerplate.
- **B → Sol Medium.** The implementation itself must resolve multiple non-local/domain invariants. The Sol lead should immediately identify and delegate A-level child packets to Luna Max.
- **C → Sol High.** Architecture/cross-domain/risky strategy/integration decisions.

The orchestrator must not use “production code”, “backend”, “many files”, or “important feature” alone as justification for Sol. The justification must identify the actual invariant/ambiguity that Luna should not own.

A Luna implementation agent must never self-review. Spawn a separate independent Luna reviewer profile/instance, or the appropriate Sol integration reviewer.
