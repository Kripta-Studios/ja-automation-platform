# Packet QA-B operations handoff

The final targeted browser run passed against the final primary-built portal artifact with real Better Auth logins backed by the operations worktree's isolated disposable fixture database. No production database, account, deploy, or business submit was used. The app artifact was copied from `/home/kripta/ja-navigation-assistant-20261007/apps/portal/{.svelte-kit/output,build}`; this QA agent did not invoke a build.

## Final run

From `/home/kripta/ja-assistant-qa-operations-20261007`, with `PATH=/opt/jaautomation/runtime/node/bin:$PATH` and `NODE_OPTIONS=--experimental-transform-types`:

```sh
pnpm exec playwright test --config=playwright.qa-operations.config.ts --grep='worker typo query opens time entry|project manager can cancel assistant navigation|project manager selects only current authorized project records'
```

Result: 6 passed, 0 failed, 0 skipped, 0 flaky, one worker, 43.8 seconds. The six cases are Worker and project-manager journeys at phone 390×844 and tablet 768×1024.

| Role            | Locale / phrase                                                | Browser outcome                                                                                                                                                                   |
| --------------- | -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Worker          | EN `log timee`                                                 | Matcher status was “Matching tasks”; keyboard selection opened the time-entry form at `/time` with `assistantSurface=time-create`.                                                |
| Worker          | EN `record expense` while the time form had an unsaved summary | The localized dirty-form confirmation appeared; dismissing it kept the route and draft. Escape closed the assistant and restored focus to the draft field.                        |
| Project manager | ES `registrar horas`, then `añadir gasto`                      | Opened the time-entry form; canceling the expense navigation kept the manager's draft and restored focus.                                                                         |
| Project manager | PT `ver relatórios e ficheiros do projeto`                     | Report-record choices exactly matched rows in the current authorized project projection; an unassigned fixture project was absent. Selection opened that project's reports panel. |
| Project manager | ES `editar asignación de trabajador`                           | Opened the scoped assignment form with its start-date field focused.                                                                                                              |

All six browser evidence attachments recorded no business POSTs, console errors, or page errors. Routes, locale, query, width, and visible destination are captured in `final-evidence/*.json`. Screenshots are in `playwright-final-results/`; the machine-readable Playwright report is `playwright-final-results.json` and HTML report is `playwright-final-report/`.

## Files and evidence

- QA sources/config: `sources/playwright.qa-operations.config.ts`, `sources/tests/e2e/navigation-assistant-qa-operations.spec.ts`, `sources/tests/e2e/auth.ts`, and `sources/apps/portal/src/lib/portal/assistant/matcher.ts`.
- Final journey JSON: `final-evidence/` (six files).
- Final browser screenshots and failure artifacts, if any: `playwright-final-results/`.
- Earlier broad matrix evidence: `playwright-results.json`, `playwright-results/`, and `playwright-report/`.
- Source commit at worktree creation: `830b32a8`. The synced final matcher SHA-256 was `137a9e1d17bc2c0573bd6cf0ec6d2d168cae430c00a8b8483b15dc418e6c359d`.

## Prior diagnostic and scope

The first broad run used the pre-final matcher and reported 4 passed / 4 failed across Worker, manager, PM, and Auditor at both widths. PM project-record/report selection and Auditor read-only finance/audit journeys passed at both widths. The Worker failure reproduced unsupported `log timee` falling back to the permitted browse list; this was addressed in the primary matcher, and the final latest-artifact Worker journey now passes. The manager failure was a QA expectation that looked for English text in the Spanish confirmation; the assertion was localized. An intermediate long scenario also exceeded its 60-second test budget after reaching the next locale; it was split into short focused final cases. A temporary focus assertion was initially placed before Escape; moving it after assistant close made the expected focus-restoration check pass.

This packet's final rerun focused on Worker and project-manager behavior per the root's request. Auditor latest-artifact coverage and the remaining role/language matrix are covered by the root's final suite; this packet's earlier Auditor run is preserved as supporting evidence. No root feature change is required based on this packet.
