# Project Calculation period: candidate browser evidence

- Candidate code: `9b0a4ffe48b6de479101320dc5b27cb2f4844cb3`.
- Actual Chromium against a newly seeded disposable E2E database, with the candidate portal on port 4175. No production writes.
- Run: `PATH=/opt/jaautomation/runtime/node-v24.19.0/bin:$PATH pnpm exec playwright test --config docs/evidence/error-warning-candidate/project-calculation-candidate-browser/playwright.config.ts`.
- Result: 4 tests passed. Owner at 390 px in English, Finance at 1440 px in Spanish and 390 px in Portuguese, plus an Owner enhanced correction retry.

Each role opened invalid calendar, reversed, and duplicate period deep links. All returned a 200 document with the correct stable code, translated explanation and adjacent field error, retained raw dates, a permitted correction instruction, and keyboard focus on the notice. Invalid periods rendered no calculation totals, person rows, or canonical results note. The `correct_field` remedy is an instruction in the notice followed immediately by the correction form; it is not an anchor. Network responses were 200 for the documents and enhanced GETs. Console and page errors were empty. The audit row count stayed at 331 throughout the read-only checks.

On the Owner phone, another reversed date submitted through the enhanced correction form retained the entered dates and focused the notice by 50 ms after it appeared. The notice occupied vertical pixels 340–489 in the 844 px viewport, below the header. The initial scroll position of 32 px was preserved; the short page could not scroll to the requested 300 px. A valid retry removed the problem and restored 10 calculation totals.

The JSON files contain redacted browser state and network status categories. The PNG files show the invalid state after login, with synthetic fixture project data and no credentials or finance amounts. This run did not exercise a concurrent business-state change or an unauthorized role; those scenarios require separate evidence.
