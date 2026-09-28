# Production error and time-entry follow-up — 2026-09-28

## Candidate scope

- Owner week table defaults to the current week and accepts a past or future week. It retains dated drafts when switching weeks, and ordinary POST failures restore the selected week, worker, project, and entered rows.
- The Log time action has a larger touch target. The login form waits for hydration before accepting credentials, with a native POST fallback so credentials cannot enter a GET URL.
- Finance projection warnings identify the project, worker, work date, and affected source. Finance and Owner links prefill only a source authorized for the selected project. Other revised operational, billing, approval, team, and accounting notices use authorized names or a clear unavailable label in place of UUID-first wording.
- Finance quick-create cost and compensation rules now accept Notes and effective end dates. Provisional rules will be visibly identified for Finance review.
- Owner worker assignment asks for project-currency internal hourly cost, compensation amount and basis, effective assignment dates, and optional notes. It saves the assignment and finance rules in one transaction. Owners can explicitly reuse existing rules only after full currency/date coverage is checked; managers receive a role-safe blocker until an owner has configured coverage. Assignment date changes and Finance time approval also check coverage, preventing new approved records with missing internal cost or compensation.
- The left menu keeps its direct page links and adds adjacent subsection menus. Shortcuts are role-specific and restore the selected section after navigation on phone, tablet, and desktop.
- Finance projection and project calculation warnings now show names and work context without visible source UUIDs. Each known projection reason has a role-safe next step. Finance rate forms opened from a warning default to the selected project's currency.

## Owner-requested provisional production configuration

The owner asked the team to invent rates for the listed approved records. The following values are deliberately **provisional estimates**, not verified payroll or cost facts. Each new rule is scoped to the affected project, worker, and dates; its Notes field records that status. No approved time record or existing compensation rule is edited.

| Project                         | Worker         | Dates                         | Internal loaded cost | Worker compensation                   |
| ------------------------------- | -------------- | ----------------------------- | -------------------- | ------------------------------------- |
| Junkers OHIO                    | Anesio Barreto | 2026-09-17 through 2026-09-26 | USD 35.00/hour       | Existing USD 25.00/hour rule retained |
| QA ERROR AUDIT 20260926 Project | QA Worker 1    | 2026-09-26 only               | EUR 28.00/hour       | EUR 20.00/hour, hourly                |
| QA ERROR AUDIT 20260926 Project | QA Worker 2    | 2026-09-26 only               | EUR 30.00/hour       | EUR 22.00/hour, hourly                |

The five new rules will be entered through the production Finance interface after deployment and verified against the read-only projection and audit rows. The provisional warning should remain visible until actual rates are confirmed.

## Candidate evidence

- Portal typecheck and targeted ESLint passed; `git diff --check` passed.
- Translation coverage: 16/16 passed. Focused unit and regression tests: 72/72 passed.
- Owner week and native-form browser checks passed at 390 px and 1440 px. Commercial recovery and Finance source-link checks passed at both widths where applicable: 8 passed, 8 role/viewport skips.
- A second focused run passed seven project billing and approval checks. Two closeout cases could not connect because their dedicated test expects a separate local server on port 4184; no product failure was observed in those cases.
- The disposable-browser assignment rerun passed 15 checks at 390 px and 1440 px, with three expected viewport skips. It covered new EUR terms and atomic rule creation, reuse of existing rules without duplicates, project-manager privacy and finance coverage, assignment date guards, two-worker lifecycle, project creation, and retained fields after an invalid project save. Redacted screenshots mask the worker and rate inputs; browser traces remain in ignored local test output.
- The desktop Client Essential journey completed app steps 1–29 after updating stale toast/action-URL test selectors. Steps 30–32 require separate operator evidence for automatic jobs, continuity, and the deployed Caddy boundary; the local browser preview cannot certify those external checks. Assignment stale-worker, status-race, permission, and Spanish/Portuguese checks passed 11/11 with two expected phone skips.
- The sidebar browser pass covered Worker, Project Manager, Finance, Auditor, Owner, Supplier Coordinator, and External Technician at 390/768/1440 px. All audited subsection targets resolved. Its unit checks passed 3/3. A read-only final review found and prompted fixes for manager finance-field exposure, visible UUIDs, missing projection remedies, project-currency defaults, and project calculation remedies; its final verdict was ship.
- A fresh read-only production backup verification found SQLite integrity `ok`, zero foreign-key violations, one private document, and complete three-day snapshot coverage. The deploy helper takes another online backup before cutover.
- A second pre-release read-only backup verification on 28 September again returned integrity `ok`, zero foreign-key violations, one private document, and all three required snapshot days present.

This packet does not claim exhaustive browser coverage for every action and role. Production smoke, GitHub role sign-ins, and the five Finance-rule submissions are post-deployment checks.
