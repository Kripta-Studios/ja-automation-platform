# J&A Automation — Codex Routing Index

## Mission and release authority

Deliver the production-complete **Client Essential** J&A Automation platform in the current repository, branch, and worktree. This is not an MVP, demo, prototype, or mock.

Read product authority in this order before implementation (validated against the repository and
the user-authoritative local contract on **2026-08-24**):

1. `J_A_AUTOMATION_CLIENT_ESSENTIAL_SPEC_2026-08-22.md`
2. `J_A_AUTOMATION_CLIENT_ESSENTIAL_CHECKLIST_2026-08-22.md`
3. `J_A_Automation_Contrato_Proyecto_EVOCON_ES.html`, the user-authoritative local contract,
   specifically its `ANEXO A` functional scope and `ANEXO D` UAT criteria. These sections provide
   contractual scope and acceptance context after the SPEC/checklist and before UX-only guidance.
4. `UI_PLAN.md` for UX/UI requirements across all sections. It cannot override product, financial,
   security, authorization, or lifecycle semantics in the sources above.
5. this file and the closest nested `AGENTS.md` / `AGENTS.override.md`
6. `J_A_AUTOMATION_UNIFIED_SPEC_V3_LIGHTWEIGHT_2026-08-18.md` as domain and architecture reference
   only where it does not conflict with Client Essential scope
7. `V3_COMPLETION_AUDIT_AND_REMEDIATION_PLAN_2026-08-19.md` for defects relevant to Client Essential scope
8. `PRODUCT_FEATURE_BACKLOG_V3_1_V3_4.md` as **DEFERRED POST-CORE ROADMAP**
9. `CODEX_EXECUTION_PLAN.md`, `REQUIREMENTS_TRACEABILITY_MATRIX.md`, and `MCP_AGENT_MATRIX.md` as
   execution/evidence references subordinate to the authority above

The 2026-08-24 contractual validation confirms that reference hours do not fabricate actual time,
minimum billable and worker-compensation rules are independent, issued invoices are historical
snapshots, and Anexo D's flow/edge-case evidence is required. Documentation updates do not count as
implementation or release evidence.

The client-release verdict is determined only by the Client Essential specification, checklist, applicable production-correctness requirements, and demonstrated evidence. Historical requirements such as all V3.1–V3.4 features, every P0/P1/P2 backlog item, all 207 RTM rows, or the old 42-step V3 scenario do **not** block Client Essential delivery unless a Client Essential requirement directly depends on them.

Deferred roadmap requirements remain documented; they are not deleted or silently reclassified as implemented.

## Production invariants that remain mandatory

- Preserve the modular monolith, SQLite production database, and current lightweight deployment unless Client Essential requirements force a change.
- Do not rewrite working subsystems or decompose files merely because they are large. Decompose only where correctness, security, testing, ownership, or an Essential feature is materially blocked.
- Use deterministic exact-money semantics; never use binary floating point for money.
- Use transactions for multi-write invariants and idempotency for retryable or money-related jobs.
- Preserve auditability and historical truth. Never hard-delete or silently mutate issued/finalized financial history.
- Issued invoices are immutable snapshots; corrections use void/credit/adjustment/replacement lifecycles.
- Prevent duplicate billing and reconcile finance totals to source rows.
- Preserve RBAC, object-level authorization/IDOR protection, worker compensation privacy, step-up protection, safe DTO allowlists, CSRF/session controls, and append-only audit.
- Private artifacts require authorization before final storage and every download, normalized storage keys, validation, and integrity checks where traceability matters.
- Do not silently overwrite PLC backups, reports, invoices, accounting snapshots, or other traceable artifacts.
- Async states must be truthful (`queued`, `running`, `ready`, `failed`); independent formats fail/retry independently; normal users must not manually process jobs.
- Safe migrations and realistic upgrade testing are mandatory when relevant persistent data exists. Prefer additive migrations and preserve old meaning.
- Backup and restore must recover the database plus issued/private artifacts.

## Scope routing

Implement CORE-01 through CORE-17 and the Client Essential 32-step acceptance journey. Treat Offline/PWA as `CONDITIONAL` until the go-live connectivity decision is confirmed.

Do not expand this release into the deferred industrial platform, generic ERP/business platform, broad accounting/provider integration platform, or ML/data-readiness platform listed in the Client Essential specification. Existing implementations in those areas may be preserved and secured, but new work requires either a direct Essential dependency or an explicit post-core request.

## Multi-agent execution

The parent is the Sol lead orchestrator and integration authority. Before parallel implementation:

1. build a dependency DAG from repository-grounded `PARTIAL`/`FAIL` Essential items;
2. assign bounded work packets with requirement IDs, owned/forbidden paths, dependencies, tests, acceptance criteria, and handoff format;
3. classify packets `A → Luna Max`, `B → Sol Medium`, `C → Sol High`;
4. prevent overlapping active write ownership, using worktrees when genuinely useful;
5. require independent review for material finance, security, responsive/browser, and spec-compliance changes;
6. route concrete reviewer failures back to the responsible implementer;
7. integrate and re-test in dependency order.

Use `$ja-v3-completion-orchestrator`, `$luna-first-routing`, `$subagent-work-packet`, `$spec-compliance`, and `$release-gate` when their scope applies. Product-scope interpretation remains with the lead.

## Product and UX rules

- User-facing state must reflect reality; queued is not ready.
- Semantic filenames are required for business artifacts.
- Full mobile navigation labels remain readable; never use first-letter or `font-size: 0` hacks.
- Dense phone forms stack readably; tables need a deliberate mobile representation.
- Forms retain visible labels, understandable validation, keyboard access, visible focus, and usable touch targets.
- Representative Client Essential browser evidence covers 360/390 phone, 768 tablet, and 1440 desktop. Additional widths are risk-based smoke checks, not independent release products.

## Testing and evidence

Run the narrowest relevant tests first, then the applicable repository gates. Client Essential release evidence must cover exact money, commercial treatments, lifecycle/corrections, duplicate billing, invoice immutability, payments/reconciliation, RBAC/IDOR/privacy, file authorization, artifacts/jobs, database integrity/migrations, backup/restore, production build, and representative multi-role browser journeys.

Do not weaken assertions, skip security coverage, hide failures, or mark `PASS` from code presence alone. Update `J_A_AUTOMATION_CLIENT_ESSENTIAL_CHECKLIST_2026-08-22.md` continuously with concrete test/build/runtime/database/browser/artifact evidence. The historical RTM remains traceability and roadmap context; its deferred rows are not the Client Essential verdict.

## Escalation

Escalate instead of guessing when a change could destroy/reinterpret production history, security/RBAC policy is genuinely ambiguous, authoritative Essential requirements conflict, a third-party contract/credential is unavailable, financial history would become mutable, or an active work packet owns the required path. For ordinary ambiguity, choose the safest coherent Essential interpretation, document it, and continue.
