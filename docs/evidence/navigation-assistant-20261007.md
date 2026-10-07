# Navigation assistant — 2026-10-07

User-requested feature: find an authorized task with ordinary language, open its existing workspace, select the right tab or creation surface, reveal the relevant disclosure, scroll and focus. This implementation uses browser-local Fuse.js 7.1.0 and curated English, Spanish and Portuguese phrases. It requires no LLM service or API key. Users enter, review and save through the existing forms.

## Deployed source and GitHub main

The running portal image is `ja-automation-portal:zip-45a05993e2a07add29ae9adb63377cb3`. All **5,868 tracked files** at commit `aa3b2f269a3a2202cdeff55338022a823956d065` matched its deployed release source, with no missing or changed files. GitHub `main` was updated from `94109a6d23be202dd4a3760da99ea8eb6d9fbdd1` using an explicit force-with-lease and verified at that deployed commit. A local backup reference preserves the previous remote head.

The assistant is on `codex/navigation-assistant-20261007`; it has not been deployed or included in `main`. See [deployed-main-sync.json](navigation-assistant-20261007/deployed-main-sync.json).

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

The focused unit suite passed **59 tests**. The portal typecheck, production build, scoped lint/format checks and independent review passed. The browser matrix passed **80/80 checks** across 360×800, 390×844, 768×1024 and 1440×900, using all five base roles and both restricted supplier profiles. Checks include scoped WCAG axe assertions, 44px controls, keyboard focus, localization, cold/repeated requests, prerequisite setup, cancellation, accepted draft reset and zero named business-action submissions. [Browser results](navigation-assistant-20261007/playwright-results.json) and [unit results](navigation-assistant-20261007/unit-results.json) are retained.

A final copy-only adjustment makes the query placeholder use a task permitted for the account; its Svelte component compiled with zero warnings and scoped lint/format checks passed. The browser screenshots precede that placeholder adjustment. This evidence does not certify every source action or whole-app Client Essential acceptance.

The broader Svelte checker still reports **88 existing errors and 8 warnings**. It reports no errors in the new assistant files or intersecting changed source lines; a new optional-string error introduced in a Finance selection handler was corrected. See [the scoped diagnostic comparison](navigation-assistant-20261007/svelte-check-scoped.json). This is not a clean whole-application Svelte check.

Reproduce the browser matrix with Node 24.19.0 and pnpm 11.22.0:

```sh
NODE_OPTIONS=--experimental-transform-types pnpm exec playwright test --config playwright.assistant.config.ts
```

The flag supports the existing TypeScript demo-seed fixture. The runner creates a unique test database/document directory and removes them afterward. Supplier tests temporarily set and restore an isolated fixture account's profile; no production database or artifact is used.
