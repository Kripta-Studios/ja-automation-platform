# Stale worker assignment recovery

The exact candidate browser run passed **4/4 cases** on 2026-09-26: Owner and
Manager at 390 px and 1440 px. It used Playwright's disposable database and
local preview with pinned Node 24:

```sh
pnpm exec playwright test tests/e2e/error-warning-assignment-stale-worker.spec.ts --project=phone-390 --project=desktop --reporter=json
```

Each case deactivated a worker after the assignment form was opened, then
confirmed the typed `PROJECT_ASSIGNMENT_WORKER_UNAVAILABLE` response, a focused
and visible validation summary, retained project/worker/dates, a disabled
stale-worker option, a blocked repeat submit, and a successful assignment of
an active replacement without an assignment for the inactive worker.

The eight PNG files show only the cropped problem notice and generic worker
option. The four JSON files record reduced assertions and console counts;
four console resource errors per case came from the disposable offline-disabled
fixture, with zero page errors or other console errors. Screenshots and JSON
were inspected before staging. They contain no worker names, project details,
credentials, cookies, raw responses, or browser traces.
