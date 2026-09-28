# Finance assignment commercial lock: independent Chromium QA

- Candidate product commit: aa469a8.
- Run date: 2026-09-27.
- Environment: local candidate preview, fresh disposable SQLite database, Chromium; no production access.
- Final result: **PASS, 1/1 browser run.**

## Browser journey and checks

Owner created an Active project and assigned the test Worker through the Projects form. Finance created a customer labor rate through the Finance form, opened **Configure this person**, and selected changed fallback values. While that form remained open, Worker saved a dated time draft through the Time form. Finance's native submission returned HTTP 409 FINANCE_ASSIGNMENT_COMMERCIAL_LOCKED_BY_TIME, rather than a generic validation message. The English notice explained why recorded time locks assignment choices, distinguished worker pay, customer billing, and internal cost, and offered date-effective rule remedies. Clicking **Review worker compensation rules** selected the correct Finance task.

Finance then selected the new customer rate in the rule-reference form at 1440 px Spanish. Native submission again returned HTTP 409 with the same code. A SvelteKit enhanced action request returned HTTP 200 carrying a failure envelope with action status 409 and the same code. A further fallback submission at 390 px Portuguese showed the translated notice. In all three native cases, the selected values, Commercial view, open editor, and keyboard focus were retained. Notice bounds were fully below the sticky header and within the viewport after the form response.

The assignment version, customer-rule reference, fallback flags, and assignment audit count stayed unchanged after every blocked submission. The Manager had no assignment-commercial form on the Finance page; a direct enhanced action request returned FINANCE_ROLE_REQUIRED without leaking the recorded-time conflict. Owner, Worker, Finance, and Manager sessions had zero page or console errors.

## Evidence

- [Redacted observations](results.json): response codes, translated visible text, selected fields, focus and scroll geometry, remedy targets, unchanged database state, and console diagnostics.
- [Browser spec](candidate.spec.ts) and [config](playwright.config.ts).
- Cropped notice images: [Finance EN 390](finance-fallback-phone-390-en.png), [Finance ES 1440](finance-rule-desktop-1440-es.png), [Finance PT 390](finance-fallback-phone-390-pt.png).

The result JSON replaces disposable record IDs with a record placeholder. Images show only the notices, not the full records or credentials. Raw browser traces were not retained because they can contain cookies and form payloads. The first pass was also green; the final pass added a real remedy click and Manager action-level permission check. A pnpm safety check rejected symlinked workspace modules in this isolated worktree, so the run used the installed Playwright CLI and Vite binary directly.

## Reproduction and limits

From this isolated worktree, with its existing dependency links, run the installed Playwright CLI against this folder's config using Node 24 and the local Chromium executable. The config builds and serves the candidate Portal on port 4174, provisions a fresh fixture, and cleans it on exit.

The enhanced check inspected the action envelope with a browser fetch; this form itself uses native submission. The Manager's restricted view and action were checked, but the broader finance role matrix and unrelated Finance actions were outside this focused run. Playwright removed the disposable fixture pointer and lock after exit.
