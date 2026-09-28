# Worker My Pay missing-rule warning browser check

- Candidate workspace: `8669fa3` plus uncommitted warning changes, 2026-09-26.
- Command: `pnpm exec playwright test tests/e2e/worker-pay-missing-rule-warning.spec.ts --project=phone-390 --project=desktop --reporter=line` (Node 24 runtime).
- Result: 2 passed. The Playwright runner created a disposable local database and exercised the real Worker sign-in and `/pay` page at 390 × 844 and 1440 × 900. It was not connected to production.
- Fixture: one active QA project and one assigned Worker per viewport. One time record without an applicable compensation rule showed the singular warning; adding another showed the plural warning. The fixture is discarded by global teardown.
- Both widths showed `WORKER_PAY_MISSING_COMPENSATION_RULE`, stated the excluded record count and the missing or mismatched currency rule cause, and displayed **Contact Finance or an owner** as text without a restricted Finance link. The notice and document stayed within the viewport. Page exceptions: zero.
- The local E2E configuration disables offline identity. `/api/offline/identity` returned HTTP 503 and emitted three generic resource console errors per browser test. The test verifies that every failed response and console resource error belongs to that endpoint; any other error fails the test. This exclusion does not assert that offline identity works.
- Cropped warning screenshots contain only the warning text: [phone singular](phone-390-one.png), [phone plural](phone-390-many.png), [desktop singular](desktop-one.png), [desktop plural](desktop-many.png).
