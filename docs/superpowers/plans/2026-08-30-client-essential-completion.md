# Client Essential completion plan — 2026-08-30

> This plan executes the remaining repository-grounded `PARTIAL`/`FAIL` work in the authority order defined by `AGENTS.md`. Operational and contractual evidence that requires the production VPS, DNS/email provider, remote backup host, content approval or signed UAT is kept explicit and is never represented as implemented by source code alone.

## Verified starting point

- Pinned Node `24.19.0` workspace typecheck: PASS.
- Current finance regression selection: 9 files / 47 tests PASS.
- Required responsive matrix (360, 390, 768 and 1440; Worker, PM, Finance and Owner): 40/40 PASS in the current session.
- UI focused static regression: 6 files / 39 tests PASS.
- Current verdict remains `NOT READY`; checklist evidence and several acceptance assertions are stale or incomplete.

## Dependency DAG

```text
WP-01 current-tree audits and evidence reconciliation
  ├── WP-02 issued-invoice/PDF immutability migration
  ├── WP-03 remaining finance-integrity findings
  ├── WP-04 current security/RBAC/private-artifact findings
  ├── WP-05 UI_PLAN defects, i18n and navigation warnings
  └── WP-06 stronger 32-step and responsive evidence

WP-02 + WP-03 + WP-04 + WP-05
  └── WP-06 browser journeys and artifact inspection
        └── WP-07 integrated release gates and independent reviews
              └── WP-08 production/external acceptance
```

## Work packets

### WP-01 — Reconcile authority documents and current evidence

- Compare every CORE-01–17 row, Definition of Done item, 32-step acceptance step and UI_PLAN requirement with executable evidence.
- Update the checklist and UI_PLAN with dated commands/results, separating implementation gaps, evidence gaps, conditional Offline/PWA and external blockers.
- Preserve deferred roadmap requirements and restore any UI traceability omitted by the updated UI_PLAN.
- Acceptance: no stale resolved finance finding remains described as open; no item is marked PASS from code presence alone.

### WP-02 — Complete issued invoice and canonical PDF immutability

- Add a safe additive migration protecting every issued snapshot/identity field added after the original trigger.
- Preserve valid lifecycle transitions and one-way PDF generation/retry semantics while making ready PDF metadata immutable.
- Test fresh and populated upgrades, forbidden mutations, allowed transitions and migration contract integrity.
- Acceptance: migration suites and invoice lifecycle/finance suites pass; independent finance review approves the behavior.

### WP-03 — Close remaining finance-integrity findings

- Re-review the former 16 findings against the current 47-test selection.
- Implement only findings still reproducible, with exact minor-unit arithmetic, authoritative source cuts, fail-closed missing costs, bounded credits, causal payment dates and full historical ledger truth.
- Acceptance: focused tests first, then all finance/integration/migration gates; independent finance reviewer returns PASS.

### WP-04 — Close security, RBAC and private-artifact findings

- Re-audit invitation/MFA/session/CSRF/step-up, object authorization, PM/Worker projections, service actors, uploads, scanner fencing and every private download route.
- Fix only confirmed current-tree defects and add regression tests at the HTTP/repository boundary.
- Acceptance: full pinned security suite passes and independent security reviewer returns PASS.

### WP-05 — Finish the updated UI_PLAN

- Fix confirmed public-site logo aspect warning and align sitemap/robots/tests/Caddy documentation on the bare canonical domain.
- Exhaustively close legacy enum/metadata localization in EN/ES (and preserve existing PT public-site behavior).
- Remove remaining SvelteKit native-history warnings using framework navigation APIs.
- Independently inspect WCAG contrast, focus, keyboard, reduced motion, touch targets, mobile cards/forms/navigation and tablet drawers.
- Acceptance: focused UI tests, portal/site typechecks and builds pass; no unexpected browser console warning in the required journeys; independent responsive review approves 360/390/768/1440.

### WP-06 — Strengthen acceptance evidence

- Expand the 32-step journey where it currently asserts only labels: invitation lifecycle; client/project archive/restore; configurable rules consumed by finance; Work/Travel/Standby/overtime and audited correction; expense approval and dual states; report sign-off/version binding; all-in versus reimbursable billing; immutable invoice/PDF; partial/full payments; numerical ledger/Accounting Pack reconciliation; authorized and denied private downloads.
- Exercise Owner, Finance, PM and Worker at the required representative widths.
- Preserve Playwright HTML/JSON output and failure artifacts in the release evidence location without committing disposable databases or secrets.
- Acceptance: steps 1–29 and 32 pass locally/deployed as applicable; steps 30–31 consume truthful operations evidence rather than mocks.

### WP-07 — Integrated release gate

- Run formatting/diff checks, clean unit, integration, security, migration, reporting, continuity, database integrity, typecheck and production builds on pinned Node.
- Run the full representative browser suite and inspect generated invoice/report/Worker Statement/Accounting Pack artifacts.
- Route concrete reviewer failures back to the owning packet and rerun the affected gate plus the full release selection.
- Acceptance: repository-owned Client Essential requirements are implemented and evidenced; checklist is synchronized with exact results.

### WP-08 — Production and contractual acceptance

- Diagnose `jaautomation-jobs.service` with privileged journal/environment access and record two consecutive automatic timer runs with exit 0 and real queue transitions.
- Execute encrypted replication to a separate host and an isolated restore of SQLite plus issued/private artifacts with integrity checks.
- Validate public form delivery behind Caddy with message IDs, approve content/images, verify canonical redirects, and complete real email migration/DNS SPF/DKIM/DMARC send/receive evidence.
- Execute and sign ANEXO D D.1/D.2/D.3 UAT.
- Acceptance: external evidence bundle exists and the release authority can change `NOT READY` to `CLIENT READY`.

## Routing and ownership

- Luna Max owns bounded class-A implementation/test packets and read-only independent reviews.
- Sol lead owns product interpretation, cross-domain integration and final checklist verdict.
- Finance, security, responsive/browser and spec compliance receive independent review after implementation.
- Active agents must not share write ownership; migrations, finance services, portal UI, public website and E2E tests remain separate packets.

## Stop conditions

- Do not fabricate production evidence, signed UAT, credentials, email delivery, remote backup or connectivity decisions.
- Escalate any change that could reinterpret issued history, weaken authorization, or require a production secret/provider contract.
