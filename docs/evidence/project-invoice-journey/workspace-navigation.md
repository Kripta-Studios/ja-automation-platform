# Workspace navigation and save context — 9 October 2026

User-requested follow-up: navigation shortcuts across roles must reveal and center
the intended panel or form. Native contact/profile/client saves must return to the
working record and editor instead of an obsolete pixel position or page edge.

The app layout now reconciles explicit fragment and action destinations across
initial loading, SvelteKit navigation and reused routes. It opens enclosing native
disclosures and safe, explicitly controlled conditional editors. Long forms keep
their opening title or first field visible. Existing sheets and error/recovery
focus retain ownership. Filters retain their position; native Back/Forward retain
historical scroll rather than re-centering a destination.

Native POST context contains the authenticated actor/role, path, action, allowed
record identifiers and stable form/section identifiers, with a two-minute expiry.
It contains no entered values, notes, passwords, rates or other commercial data.
The capture runs after form handlers and excludes enhanced, invalid and canceled
submissions. Restoration reopens the actual editor with server-loaded values.
Native responses retain allowed UI query context. Creation/deletion returns to
its containing results section. Trusted user interaction and route changes
cancel delayed restoration, including its pending storage context.

Client and Team directories preserve a selected authorized record across paging
and a retained search, including a name changed by a save. Supplier shallow action
switches and remedy links target the specific authorized action instead of the
generic workspace header. No broader data is fetched; role projections and
existing business actions remain authoritative.

Real browser testing exposed two important history distinctions: native clicked
fragments emit popstate but are explicit navigation, and SvelteKit's fragment
focus reset emits an identical-destination popstate. The shared controller treats
these separately from Back/Forward. The auditor mobile case reproduced the second
failure; its original native alignment and the corrected centering were measured.

Validation includes portal TypeScript/build, scoped ESLint/Prettier and 42 passing
unit/integration tests. The independent read-only review found no release blocker.
Browser validation: 32 workspace cases passed at 360×800, 390×844, 768×1024 and
1440×900 across Owner, Finance, PM, Worker, Auditor, external technician and
supplier coordinator. It covers actual contact/client/team saves, off-page and
repeated-fragment navigation, native history scroll, enhanced Worker saves,
validation ownership, nested billing disclosures and Supplier action buttons.

The final identity alias extension was additionally verified with four real
Finance saves, one per viewport: the second of two identical-action forms writes
its dated reimbursement revision and assignment version, leaves the first
unchanged, and returns to the exact second form with server-loaded data. The
existing five project-shortcut/containing-invoice cases also passed on the final
build, including canonical draft editing/discard and issued protection. Total:
41 passing browser cases. One browser worker at a time; all mutations occur in
isolated disposable fixtures. Private screenshot/run artifacts are retained under
`/tmp/workspace-navigation-final-{32,finance-4,prior-5}`.

Production release results are recorded in `workspace-navigation-deployment.json`.

Production activated `7048c449ac708e6b5c52ce4a3051b52a7f0d6920` on 9 October 2026. Portal readiness and Docker health pass; jobs run the same image. The public
navigation asset returns HTTP 200 and matches the final build hash. Login returns
200; the anonymous invoice composer retains HTTP 401. Database integrity is `ok`,
foreign-key violations are zero, migration 76 is unchanged, and all five deployment,
job, backup and cleanup timers are active.

The first activation automatically reverted because free disk space fell below
the existing 1 GiB readiness threshold. Reproducible Docker build cache and one
obsolete processed source release were removed, restoring sufficient space before
the successful retry. Live business data, documents, all retained daily backups
and rollback container images were preserved. The production checks are read-only.
