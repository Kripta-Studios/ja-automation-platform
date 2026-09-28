# Finance stale-assignment rule recovery

Disposable candidate browser QA on 2026-09-26 at phone 390×844 and desktop 1440×900: **2/2 active cases passed** (two other-project cases intentionally skipped). The test signs in as Finance, opens a worker compensation rule for an assigned worker, then makes that assignment inactive in the disposable fixture before submitting. The assignment is restored in test cleanup.

Both widths returned HTTP 409 with `FINANCE_RULE_ASSIGNMENT_UNAVAILABLE`. The Spanish cause and role-safe project-owner guidance were visible; the active task, selected worker/project/currency, entered rate, and effective date remained. Focus returned to the project field within the viewport. No compensation-rule row was added, and no browser runtime errors were observed. The remedy is guidance rather than a navigable link because Finance does not receive project-assignment edit access.

The two PNGs crop only the synthetic ProblemNotice. The two JSON summaries omit worker/project IDs, credentials, request bodies, and raw network data. Playwright trace and fixture database are excluded. This proves the stale-assignment path at these widths; other rule errors remain covered by focused contract tests and are not claimed as browser passes here. Release commit: pending.
