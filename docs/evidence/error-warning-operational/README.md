# Operational form recovery browser evidence

Captured 2026-09-25 against disposable Playwright databases. The candidate HEAD was
`2fa2cb61220294fa742273300d829fdedcf54df3`; the relevant uncommitted
implementation diff digest was
`370063e00afc3abda3251ece2e8ef1ef96d0c8e5f107ed401e2bbdb4c6346aca`
(SHA-256 over `git diff --` for the three operational sections,
`form-validation.ts`, `operational-submit.ts`, the time, expense and operations
actions, and `action-message.ts`). The QA spec SHA-256 was
`355aa0f052751b0d1338842da0b68219e9cc796a5b416f5ba8c67664fd276b83`.
This shared worktree also contained concurrent edits outside those paths.

## Results

The tightened six-case run passed five cases. The desktop owner expense case
found a native recovery bug: a description suggestion changed the submitted
description to `Only hours` after the server restored it. After the
implementation owner fixed that state initialization, the **strict desktop
expense case passed in a separate targeted run**. Thus all six distinct cases
passed, across these two candidate snapshots; a single full six-case run after
that fix has not been recorded.

| Area | 390 px | 1440 px | Known failure |
| --- | --- | --- | --- |
| Time | worker passed | owner passed | `TIME_INTERVAL_OVERLAP` |
| Expense | worker passed | owner passed after fix | `EXPENSE_RECEIPT_CONTENT_INVALID` |
| Technical report | worker passed | manager passed | `REPORT_SAFETY_DETAILS_REQUIRED` |

Each case tested a client-side invalid field, an enhanced action failure and a
native action failure. Enhanced actions returned the SvelteKit failure payload
with status 400 inside HTTP 200; native actions returned HTTP 400. Assertions
checked entered values, focus on the error notice, the open sheet, and remedy
text or link. The report case also checked that the Technical / PLC tab remained
selected. Expense checks confirmed that the receipt field clears and the form
asks the user to reattach the file, while text and amount remain. Background
scroll was 0 before and after each native failure; nonzero scroll retention was
not exercised. These are recovery cases, not successful-save or permission
coverage.

The PNGs are sheet-only screenshots with the worker selector masked. The JSON
traces contain only assertion facts and scroll values. Network JSON contains
only status and pathname, without query strings, request bodies, cookies, or
tokens. No raw Playwright trace was retained. `SHA256SUMS.txt` binds the
artifacts to this record.

All six network summaries contain the expected action-path 400 and
`503 /j-aautomation/app/api/offline/identity`; there were no operational
action-path 5xx responses. The 503 comes from the offline identity fixture and
is separate from these action failures. It also produces a visible “Sync failed”
toast alongside the form error. The cases reported no page exceptions or
non-resource console errors.

Reproduce with `pnpm exec playwright test tests/e2e/error-warning-operational.spec.ts
--project=phone-390 --project=desktop --trace=off`, using the repository's
Playwright Chromium executable and disposable database setup.
