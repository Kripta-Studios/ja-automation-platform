# Navigation assistant — 2026-10-07

User-requested feature: find an authorized task with ordinary language, open its existing workspace, select the right tab or creation surface, reveal the relevant disclosure, scroll and focus. This implementation uses browser-local Fuse.js 7.1.0 and curated English, Spanish and Portuguese phrases. It requires no LLM service or API key. Users enter, review and save through the existing forms.

## Source identity and release

Before this assistant rollout, the running portal image was `ja-automation-portal:zip-45a05993e2a07add29ae9adb63377cb3`. All **5,868 tracked files** at commit `aa3b2f269a3a2202cdeff55338022a823956d065` matched its deployed release source, with no missing or changed files. GitHub `main` was updated from `94109a6d23be202dd4a3760da99ea8eb6d9fbdd1` using an explicit force-with-lease and verified at that deployed commit. A local backup reference preserves the previous remote head.

That earlier synchronization is recorded in [deployed-main-sync.json](navigation-assistant-20261007/deployed-main-sync.json). This source includes the assistant and the swarm-discovered fixes. The production package is created from a clean reviewed commit and identifies its commit, tree and archive manifest in `RELEASE-BUILD.txt` and `RELEASE-MANIFEST.sha256`. Activation, live-account checks, deployed-source comparison and the subsequent checked-lease update of GitHub `main` are recorded separately in `/home/kripta/ja-assistant-swarm-20261007/`; the predeployment checks below do not themselves certify activation.

## Inventory and capabilities

[The interactive role inventory](../navigation-assistant-role-inventory.html) and [source-action CSV](../navigation-assistant-actions.csv) cover **190 form-action declarations and 52 HTTP method declarations** in the deployed source. These counts include aliases, downloads, authentication, public and internal routes; they are not 242 distinct business commands. Each source row identifies its source location, mapped task or nearest context, permission caveats and navigation coverage. The inventory includes required, optional and conditional input analysis for project, client, time, expense, daily-report and technical-report creation.

The runtime catalogue contains **120 task destinations**:

| Account context      | Visible tasks |
| -------------------- | ------------: |
| Canonical Owner      |           112 |
| Other Owner          |           102 |
| Finance Admin        |            56 |
| Project Manager      |            38 |
| Internal Worker      |            24 |
| Supplier Coordinator |            22 |
| External Technician  |            19 |
| Read-only Auditor    |             8 |

These are navigation capabilities. Existing server guards still enforce record state, source ownership, assignment, date, delegation, supplier grants and canonical identity. Unknown roles or workforce profiles receive no tasks. Worker and PM searches do not expose financial administration tasks; supplier profiles receive their restricted operational destinations. Auditors receive business reads and their own account/notification controls.

## Behavior and boundaries

- A single authenticated launcher opens the task dialog throughout the portal, including detail and supplier pages. Ctrl/Cmd+K opens it; Ctrl/Cmd+Shift+K retains the existing section finder.
- Search ranks permitted tasks, handles common typos and searches all three languages. Ambiguous requests present choices. Unsupported or negated commands explain the limit and leave navigation unchanged until the user selects a permitted task.
- Record choices come only from existing authorized page projections. When the desired records are absent, the assistant opens their register and explains that the user must select the record there. It does not fetch a global directory or extract record IDs from prose.
- Navigation validates authored local routes and opaque selected IDs. It opens existing surfaces and disclosures, focuses visible fields, respects reduced motion and preserves the selected language. It never clicks a business action, fills arbitrary values, submits a form or performs a financial mutation.
- Creation surfaces react to cold links, repeated requests and browser history. Invoice prerequisites open the existing billing-stream setup. Dirty forms retain their draft when navigation is canceled; accepted project-context changes reset milestone and schedule drafts. Native dialogs retain keyboard focus and Escape dismisses the assistant above a form without discarding it.
- Commands are held in component memory and are not sent to a matching service or persisted. Ordinary authenticated app navigation still uses its existing server loaders.

## Validation

The final focused suite passed **87/87 tests**: 68 assistant/canonical-Owner checks plus 19 deployment-Owner security and backup-continuity checks. The final portal build and typecheck, scoped lint/format checks and source review passed. The final integrated browser matrix passed **96/96 checks** across 360×800, 390×844, 768×1024 and 1440×900, using all five base roles and both restricted supplier profiles. Checks include scoped WCAG axe assertions, 44px controls, keyboard focus, localization, cold/repeated requests, prerequisite setup, cancellation, accepted draft reset and zero named business-action submissions. [Browser results](navigation-assistant-20261007/playwright-results.json) and [unit results](navigation-assistant-20261007/unit-results.json) are retained.

Three independent Playwright agents used separate disposable accounts/databases and different role/phrase matrices. The supplier rerun passed four profile/viewport cases containing 60 localized destination journeys and 48 unsupported, denied, negated or ambiguous-command checks. The operations rerun passed six Worker/PM cases on phone/tablet, including `log timee`, retained drafts and authorized project selection; its earlier Auditor/PM read-only checks also passed. Sanitized observations are retained under [swarm/](navigation-assistant-20261007/swarm/).

The exploratory Owner/Finance packet passed 10 of 15 executed cases, with five failures and nine not run after interruption. Its finance selector/localized-heading failures were harness issues, and it exposed a real mobile launcher layering defect. The launcher now sits above an open form; the final 96-case matrix verifies pointer access and canceled-draft preservation at all four widths and covers Owner/Finance behavior. Portuguese `no projeto`, Spanish `en el proyecto`, contextual time/expense intent and the `timee` typo were also corrected and tested with explicit match-status assertions. Earlier parallel runs were interrupted by VPS resource pressure; a single-browser final run completed cleanly. Those incomplete runs are diagnostic evidence, not acceptance counts.

The unchanged standalone `client-essential-backup-restore.mjs` fixture failed its historical deployment-Owner identity guard. The actual latest production backup separately verified SQLite integrity `ok`, zero foreign-key violations, 27 documents and complete three-day manifest coverage; the 19 security/continuity unit checks passed. A loaded initial unit run timed out one security check; the final clean 87-case rerun passed. This scoped evidence does not certify every source action or whole-app Client Essential acceptance.

The broader Svelte checker still reports **88 existing errors and 8 warnings**. It reports no errors in the new assistant files or intersecting changed source lines; a new optional-string error introduced in a Finance selection handler was corrected. See [the scoped diagnostic comparison](navigation-assistant-20261007/svelte-check-scoped.json). This is not a clean whole-application Svelte check.

Reproduce the browser matrix with Node 24.19.0 and pnpm 11.22.0:

```sh
NODE_OPTIONS=--experimental-transform-types pnpm exec playwright test --config playwright.assistant.config.ts
```

The flag supports the existing TypeScript demo-seed fixture. The runner creates a unique test database/document directory and removes them afterward. Supplier tests temporarily set and restore an isolated fixture account's profile; no production database or artifact is used.
