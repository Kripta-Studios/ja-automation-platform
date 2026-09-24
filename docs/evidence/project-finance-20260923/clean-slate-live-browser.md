# Clean-slate deployed browser acceptance

Date: 2026-09-24, completed at 12:25 UTC (14:25 CEST). Public origin: `https://j-aautomation.com/j-aautomation/app/projects`. Deployed portal/jobs image: `ja-automation-portal:zip-d215671b99323d6d8c4ce34b74b4f8e0`; site image has the same release tag. Portal and site containers were healthy at the final check. This is evidence for the post-cutover release, not an isolated local fixture.

The authenticated owner ran `tests/production/clean-slate.acceptance.spec.ts` against the public origin with `JA_PRODUCTION_CLEAN_SLATE=1`, one viewport project at a time so temporary records could not affect the retained-record assertions. The test checked that the visible Projects screen contained exactly the retained IMPC client and two BBS example projects. It then created a fresh client and project through the browser with the required cost center and optional fields blank, opened and reloaded the project, and deleted both temporary records through the browser. It also checked for horizontal document overflow at each viewport width.

| Playwright profile | Engine / width | Result |
|---|---|---|
| `desktop` | Chromium desktop | 2 passed |
| `phone-360` | Chromium 360 px | 2 passed |
| `phone-390` | Chromium 390 px | 2 passed |
| `tablet-768` | Chromium 768 px | 2 passed |
| `iphone-webkit-390` | WebKit 390 px | 2 passed |
| `ipad-webkit-768` | WebKit 768 px | 2 passed |

**Total: 12 passed, 0 failed, 0 skipped.** WebKit emulation checks the browser engine and viewport; this run did not use physical Apple devices.

After the runs, read-only checks of the production SQLite database found `client=1`, `project=2`, `invoice=0`, `time_entry=0`, `expense=0`, and zero daily, period, or technical reports. No `QA clean-slate browser` client or project names remained. `PRAGMA quick_check` returned `ok` and `PRAGMA foreign_key_check` returned no rows. Identity counts were `user=118`, `account=118`, and `mail_identity=99`. No mail operation was performed.

The test used the existing private owner browser state; no passwords, cookies, personal pay details, or invoice issue/send operations are included in this evidence.
