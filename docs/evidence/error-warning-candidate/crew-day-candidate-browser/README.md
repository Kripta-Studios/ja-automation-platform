# Crew day GET filters: candidate Chromium evidence

Candidate source: `4bed1de`. Date: 2026-09-27. The tests ran against a freshly seeded disposable SQLite database and SvelteKit preview on localhost port 4175. No production records were changed. The Playwright test uses real Chromium and the existing E2E login flow; the Chief grant and revocation were made by the Owner through the browser UI.

## Result

Five checks passed: Owner at 390 px English, 1440 px Spanish, and 390 px Portuguese; Owner native correction and valid retry; and Finance denial. The role-change check found a stale-view defect and intentionally fails until it is fixed.

The Owner checks covered invalid calendar and text dates, duplicate date and project parameters, an unavailable project, a combined duplicate and malformed date, and multiple bad fields. Each returned HTTP 200 with a typed problem, retained the first selected values, focused a visible notice or linked summary, and hid Crew details. The unavailable option stayed disabled and visible. The invalid requests added no audit events. The native correction kept the selected project and date, then a valid retry restored the Owner Crew section. Finance received HTTP 403 before any Crew form or rows were exposed. No page or console exceptions were observed.

The Chief check granted a delegation through the Owner UI, then verified the Chief's valid PT page, invalid date and valid retry. The Owner revoked that same delegation through the UI while the Chief's valid Crew form remained open. The disposable database contained exactly one grant for that Chief/project and its status was `revoked`. Clicking **Show project** with unchanged values kept the old Crew controls visible and made **zero** network requests. The form passed native validity. A forced fresh GET immediately returned HTTP 200 with `CREW_DAY_PROJECT_UNAVAILABLE_CHIEF`, a translated contact-owner remedy, the retained disabled project option and date, a focused visible notice, and no Crew rows. The likely cause is same-document fragment navigation when the GET form submits identical values.

Evidence files include the redacted machine-readable UI/network observations and screenshots of combined/multiple errors, the stale Chief form, and the fresh Chief notice. IDs and email addresses are redacted from JSON. Screenshots contain only disposable demo fixture names. The failed assertion is retained in `candidate.spec.ts` to verify the forthcoming fix.

## Reproduction

From a worktree pinned to `4bed1de`, install dependencies and run:

```sh
pnpm exec playwright test -c docs/evidence/error-warning-candidate/crew-day-candidate-browser/playwright.config.ts
```

The config creates its own disposable database and starts port 4175. Playwright stops the server after the run.
