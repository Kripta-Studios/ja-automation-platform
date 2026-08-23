# Portal and Report Internationalization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver complete EN, ES, and PT-BR portal localization and immutable per-language PDF variants for invoice, period, Accounting Pack, daily, and technical reports.

**Architecture:** A canonical typed locale catalog replaces DOM-only translation. A repaired B5 migration chain provides lifecycle, revision, durable-job, deployment, and artifact foundations; additive migration 0023 adds immutable localized PDF variants. Portal and reporting surfaces consume explicit locale contracts, while free-form business content remains unchanged.

**Tech Stack:** SvelteKit/Svelte 5, TypeScript, SQLite STRICT migrations, Node `24.19.0`, Vitest, Playwright, Chromium PDF, Kysely/Drizzle declarations.

**Spec:** `docs/superpowers/specs/2026-08-22-portal-report-i18n-design.md`

## Global Constraints

- Local repository databases are authorized as disposable mock data, but must be copied to a recoverable backup directory before rebuilding.
- Preserve all source changes in the dirty feature worktree; never reset, clean, or include unrelated files in a commit.
- Canonical migration order is B5 `0019_lifecycle_security`, `0020_finance_v2`, `0021_accounting_pack_artifacts`, `0022_report_registry`, followed by `0023_localized_pdf_variants`.
- Never fake B5 tables, service actors, artifact readiness, or migration evidence merely to satisfy tests.
- Store locales as `en|es|pt`; accept `pt-BR`; emit document tags `en-US|es-ES|pt-BR`.
- Never translate user-entered text, identifiers, names, project/client content, or invariant technical terms listed in the design spec.
- Issued/finalized business truth and ready artifacts are immutable; retries are idempotent and per variant.
- Money remains exact integer minor units; locale affects presentation only.
- Every behavior change follows RED → GREEN and receives independent review.
- Implementers are Luna Max unless a task explicitly freezes a Sol-owned semantic contract; reviewers are independent from implementers.

---

### Task 1: Rebuild the canonical mock-database baseline

**Files:**
- Preserve as evidence: `migrations/0019_legal_entity_lifecycle.sql`, `migrations/0020_audit_immutability.sql`
- Create/modify: `migrations/0019_lifecycle_security.sql`
- Create/modify: `migrations/0020_finance_v2.sql`
- Create/modify: `migrations/0021_accounting_pack_artifacts.sql`
- Create/modify: `migrations/0022_report_registry.sql`
- Modify: database schema declarations under `packages/database/src/schema/`
- Test: `tests/integration/database.test.ts`
- Test: `tests/integration/lifecycle-security.test.ts`
- Test: `tests/integration/durable-job-security.test.ts`

**Interfaces:**
- Consumes: frozen contracts in `.superpowers/sdd/CODEX_EXECUTION_PLAN/wp-b5-contract.md` and the I18N-ARCH-13 contract recorded in the approved spec context.
- Produces: canonical schema version 22, `deployment_identity`, service-actor bindings, fenced job/job-run contract, client/project lifecycle history, correction/revision contracts, Accounting Pack revisions/per-format artifacts, and period-report revisions.

- [ ] **Step 1: Preserve disposable DBs and conflicting SQL**

Resolve every repository-local `*.db`, `*.sqlite`, `-wal`, and `-shm` path. Verify each absolute path remains under the repository. Move active databases and the two conflicting SQL files into a timestamped `data/pre-i18n-rebuild-*` backup directory with a SHA-256 manifest.

- [ ] **Step 2: Run the existing RED characterization**

```powershell
pnpm exec vitest run tests/integration/database.test.ts tests/integration/lifecycle-security.test.ts tests/integration/durable-job-security.test.ts tests/security/b5-route-boundaries.test.ts
```

Expected before implementation: failures identifying the version collision, missing B5 tables/columns, missing lifecycle operations, and unsafe service execution boundary.

- [ ] **Step 3: Implement canonical migrations 0019–0022**

Implement the exact additive schemas, CHECK constraints, foreign keys, append-only triggers, transition guards, durable execution identity, per-format artifact status, and revision ownership described by the frozen B5 contract. Each SQL file inserts exactly its own version into `schema_migration`; no migration rewrites historical rows in place.

- [ ] **Step 4: Align declared schema and repositories**

Expose the new schema through domain modules and compatibility façades. Implement `transitionClient`, `transitionProject`, `deleteDraft`, `createCorrectionDraft`, submitted-report preservation, and unforgeable durable execution context without exporting a service-principal constructor.

- [ ] **Step 5: Verify fresh and populated upgrade behavior**

```powershell
pnpm exec vitest run tests/integration/database.test.ts tests/integration/lifecycle-security.test.ts tests/integration/durable-job-security.test.ts tests/security/b5-route-boundaries.test.ts
pnpm --filter @ja/database typecheck
```

Expected: all selected suites pass against fresh and representative populated fixtures; schema version is exactly 22.

### Task 2: Establish typed locale catalogs and coverage gates

**Files:**
- Modify: `apps/portal/src/lib/portal-i18n.ts`
- Create: `apps/portal/src/lib/i18n/catalog.ts`
- Create: `apps/portal/src/lib/i18n/format.ts`
- Create: `apps/portal/src/lib/i18n/context.ts`
- Create: `apps/portal/src/lib/i18n/controlled-values.ts`
- Test: `apps/portal/src/lib/i18n/*.test.ts`
- Test: `tests/regression/portal-i18n-coverage.test.ts`

**Interfaces:**
- Produces: `normalizePortalLocale`, `documentLanguage`, `createTranslator`, `formatPortalDate`, `translateControlledValue`, and exact catalog parity.

- [ ] **Step 1: Write RED catalog and static-copy tests**

Tests must fail when ES/PT omit an EN key, when a translated value equals EN outside the invariant allowlist, when `pt-BR` fails normalization, or when a Svelte user-facing literal is absent from the catalog/allowlist.

- [ ] **Step 2: Run RED tests**

```powershell
pnpm exec vitest run apps/portal/src/lib/i18n tests/regression/portal-i18n-coverage.test.ts
```

- [ ] **Step 3: Implement catalog and format helpers**

Create exact EN/ES/PT dictionaries, parameter interpolation, controlled enum maps, and locale-aware date/number/duration formatting. Retain `translatePortalDom` only as a compatibility adapter backed by the canonical catalog.

- [ ] **Step 4: Run GREEN tests**

Run the command from Step 2 and require zero missing keys and zero unauthorized untranslated literals.

### Task 3: Localize portal shell, navigation, and extracted sections

**Files:**
- Modify: `apps/portal/src/lib/PortalChrome.svelte`
- Modify: `apps/portal/src/lib/PortalShell.svelte`
- Modify: `apps/portal/src/lib/portal/sections/*.svelte`
- Modify: relevant `apps/portal/src/styles/portal/*.css`
- Test: `tests/regression/portal-i18n-shell-sections.test.ts`

**Interfaces:**
- Consumes: Task 2 translator/context.
- Produces: explicit localized shell/sections and semantic localized replacements for CSS pseudo-content.

- [ ] **Step 1: Write RED component coverage tests**

Assert representative copy for navigation groups, logout/search/offline, time, reports, expenses, projects, planning, approvals, billing, finance, documents, notifications, profile, and audit in all three locales.

- [ ] **Step 2: Run RED tests**

```powershell
pnpm exec vitest run tests/regression/portal-i18n-shell-sections.test.ts
```

- [ ] **Step 3: Migrate components to explicit translation**

Pass `locale`/`translate` through stable component props or shared context. Translate controlled values before display. Replace `content: 'OPEN'` and similar CSS copy with accessible DOM text.

- [ ] **Step 4: Run GREEN tests and portal typecheck**

```powershell
pnpm exec vitest run tests/regression/portal-i18n-shell-sections.test.ts
pnpm --filter @ja/portal typecheck
```

### Task 4: Localize standalone pages, authentication, and action feedback

**Files:**
- Modify: `apps/portal/src/routes/app/login/**/*.svelte`
- Modify: `apps/portal/src/routes/app/invite/**/*.svelte`
- Modify: `apps/portal/src/routes/app/{projects,reports,time,expenses,billing,notifications}/**/*.svelte`
- Modify: `apps/portal/src/app.html` or root layout/server locale bootstrap
- Modify: `apps/portal/src/lib/server/actions/*.ts`
- Modify: `apps/portal/src/routes/app/[section]/+page.svelte`
- Test: `tests/regression/portal-i18n-standalone-actions.test.ts`

**Interfaces:**
- Consumes: Task 2 translator and message-key contract.
- Produces: locale bootstrapping without English flash and `{messageKey, messageParams}` action feedback.

- [ ] **Step 1: Write RED standalone/message tests**

Cover login, MFA, invitation, every detail family, print labels, `<html lang>`, action success, validation, autosave, passkey, and failure feedback.

- [ ] **Step 2: Run RED tests**

```powershell
pnpm exec vitest run tests/regression/portal-i18n-standalone-actions.test.ts
```

- [ ] **Step 3: Implement locale bootstrap and message keys**

Resolve `?lang`, persisted locale, and browser locale consistently. Set the document tag before visible copy. Return stable message keys from server actions and translate them at the page boundary.

- [ ] **Step 4: Run GREEN tests and build**

```powershell
pnpm exec vitest run tests/regression/portal-i18n-standalone-actions.test.ts
pnpm --filter @ja/portal typecheck
pnpm --filter @ja/portal build
```

### Task 5: Complete five PDF renderers in three locales

**Files:**
- Modify: `packages/reporting/src/exports.ts`
- Modify: `packages/reporting/src/index.ts`
- Modify: `packages/invoice-templates/src/index.ts`
- Create: focused reporting locale/catalog modules under `packages/reporting/src/`
- Test: `tests/reporting-i18n.test.ts`

**Interfaces:**
- Consumes: normalized locale and immutable snapshots.
- Produces: deterministic `invoicePdf`, `periodReportPdf`, `accountingPackPdf`, `dailyReportPdf`, and `technicalReportPdf` for EN/ES/PT.

- [ ] **Step 1: Write RED 5×3 renderer tests**

Generate all fifteen PDFs, validate `%PDF-`, extract text, assert localized titles/labels/statuses/metrics/basis descriptions, assert correct HTML language metadata where inspectable, and assert source free text remains byte-for-byte represented.

- [ ] **Step 2: Run RED tests**

```powershell
pnpm exec vitest run tests/reporting-i18n.test.ts
```

- [ ] **Step 3: Implement typed report copy**

Replace English metric keys, basis prose, source counters, and `Template` text with semantic codes and locale catalogs. Add daily/technical renderers and normalize `pt-BR` to `pt` while formatting with `pt-BR`.

- [ ] **Step 4: Run GREEN reporting tests**

```powershell
pnpm exec vitest run tests/reporting-i18n.test.ts tests/reporting-artifacts.test.ts
pnpm --filter @ja/reporting typecheck
```

### Task 6: Add immutable localized PDF variants

**Files:**
- Create: `migrations/0023_localized_pdf_variants.sql`
- Modify/create: localized-artifact domain modules under `packages/database/src/domains/`
- Modify: `packages/database/src/index.ts`
- Modify: schema declarations under `packages/database/src/schema/`
- Test: `tests/integration/localized-pdf-variants.test.ts`
- Test: `tests/security/localized-pdf-variants-security.test.ts`

**Interfaces:**
- Consumes: Task 1 revision/deployment/job contracts and Task 5 renderers.
- Produces: I18N-ARCH-13 `LocalizedPdfOwner`, request/list/retry/claim/complete/fail/download contracts.

- [ ] **Step 1: Write RED migration, lifecycle, IDOR, and failure-isolation tests**

Cover fresh/populated migration, three variants from one snapshot, partial unique identities, immutable ready rows, retry transitions, append-only attempts/incidents, isolated locale failure, storage-path/hash checks, and authorization for all five owner families.

- [ ] **Step 2: Run RED tests**

```powershell
pnpm exec vitest run tests/integration/localized-pdf-variants.test.ts tests/security/localized-pdf-variants-security.test.ts
```

- [ ] **Step 3: Implement migration and domain service**

Implement the exact `localized_pdf_variant`, attempt, incident, trigger, index, backfill, semantic filename, storage key, status, and repository API contracts frozen by I18N-ARCH-13. Use canonical snapshot hashing for new rows and legacy-verbatim hashing for backfill.

- [ ] **Step 4: Run GREEN tests and DB checks**

```powershell
pnpm exec vitest run tests/integration/localized-pdf-variants.test.ts tests/security/localized-pdf-variants-security.test.ts
pnpm db:check
pnpm db:integrity
```

### Task 7: Wire localized jobs, APIs, and portal controls

**Files:**
- Modify: `packages/reporting/src/artifact-jobs.ts`
- Modify: B5 runner/domain job modules
- Create: localized PDF API routes under `apps/portal/src/routes/app/api/`
- Modify: relevant portal actions/loaders and report/invoice/pack/source pages
- Test: `tests/integration/localized-pdf-jobs.test.ts`
- Test: `tests/security/localized-pdf-downloads.test.ts`
- Test: `tests/e2e/portal-i18n-pdf.spec.ts`

**Interfaces:**
- Consumes: Tasks 1, 5, and 6.
- Produces: one fenced job per locale variant, truthful status/retry UI, and authorized downloads.

- [ ] **Step 1: Write RED job/API/browser tests**

Assert 202/409/404/200 semantics, no filesystem touch before authorization, step-up requirements, one-locale failure isolation, locale selector defaulting to portal language, and download of all five PDF families in all three languages.

- [ ] **Step 2: Run RED tests**

```powershell
pnpm exec vitest run tests/integration/localized-pdf-jobs.test.ts tests/security/localized-pdf-downloads.test.ts
```

- [ ] **Step 3: Implement job and UI integration**

Create `localized_pdf_variant_render` jobs with capability/fence context. Publish atomically, verify hash/length, record manifests via CAS, and render independent language cards/buttons without claiming queued variants are ready.

- [ ] **Step 4: Run GREEN tests**

Run Step 2 plus the focused Playwright spec against a disposable seeded database.

### Task 8: Documentation, exhaustive QA, and independent review

**Files:**
- Modify: `README.md`
- Modify: `docs/SHOWCASE_ACCESS.md`
- Modify: `REQUIREMENTS_TRACEABILITY_MATRIX.md`
- Modify: relevant environment/deployment examples
- Create: quality evidence under `artifacts/quality-gates/i18n/`

**Interfaces:**
- Consumes: all prior tasks.
- Produces: synchronized documentation and release evidence.

- [ ] **Step 1: Update documentation and traceability**

Document locale behavior, report variants, immutable lifecycle, storage/runner requirements, semantic filenames, retry states, and local demo access.

- [ ] **Step 2: Run browser matrix**

Verify owner, finance, manager, and worker at 360×800, 390×844, 430×932, 768×1024, and 1440×900 in EN/ES/PT-BR. Capture residue scans, accessibility, console/network, and PDF screenshots/text evidence.

- [ ] **Step 3: Run independent reviews**

Dispatch separate Luna Max reviewers for translation completeness, PDF/finance integrity, security/RBAC, and responsive browser QA. Route every concrete failure back to the responsible implementer before final integration.

- [ ] **Step 4: Run final gates**

```powershell
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm test:reporting
pnpm test:integration
pnpm test:invariants
pnpm test:security
pnpm test:offline
pnpm db:check
pnpm db:integrity
pnpm build
pnpm test:e2e
```

Require fresh evidence and distinguish repository-preexisting/unrelated failures from regressions. Final sign-off is Sol/high and may not declare READY with any mandatory failure.

