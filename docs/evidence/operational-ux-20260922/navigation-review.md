# Independent navigation review — 2026-09-22

Verdict: **ship** for the reviewed navigation changes. No concrete blocking defect found.

Reviewed the current working-tree diffs in `portal-navigation.ts`, `PortalChrome.svelte` and the navigation/shortcut integration in `PortalShell.svelte`. This reviewer did not implement these changes; the Today agenda is excluded from this review.

- Personal Notifications destinations are limited to the five recognized internal roles and omitted whenever a workforce profile is present. This matches `section-load.ts` and the supplier guard in `hooks.server.ts`; the persisted profile reaches both shell and standalone chrome through server data. Existing server authorization remains authoritative.
- `activeNavItem` chooses one existing navigation object using the closest route and its `view`, independently of filters, sorting and language. Both sidebar and mobile navigation use that result. Clients/Team no longer also mark the mobile Projects link, and the two Finance destinations no longer both become current. Supplier report and team routes remain distinct.
- Ctrl/⌘K has one registered owner, `SectionNavigator`. The former global-search handler and lifecycle registrations were removed. The existing modal guard, keyboard handling and native dialog focus behavior remain in place.
- The new header icon has a localized accessible name, visible focus and a 44×44 target. It is hidden below 521 px while full Notifications labels remain available in Account and the section navigator. No new phone header width is consumed. Actual responsive rendering is covered by the lead's browser matrix, not asserted from this source review.

Verification performed: `pnpm exec vitest run tests/unit/portal-navigation.test.ts` — **35/35 passed** on the pinned Node 24 runtime. Inspected the new browser scenarios without running another browser instance. No source edits made; this review document is the only file written during the review.
