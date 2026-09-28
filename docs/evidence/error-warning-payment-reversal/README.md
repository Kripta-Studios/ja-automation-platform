# Worker payment reversal retry browser evidence

The exact candidate run passed **2/2 cases** on 2026-09-26 at 390 px and
1440 px (two cross-project cases intentionally skipped). It used Playwright's
disposable database, local preview, and pinned Node 24:

```sh
pnpm exec playwright test tests/e2e/error-warning-payment-reversal-race.spec.ts --project=phone-390 --project=desktop --reporter=line
```

Each case creates a worker payment in the browser, reverses it once, then
submits a changed command from a stale tab through both enhanced and native
form paths. Both paths return the typed 409
`WORKER_PAYMENT_REVERSAL_RETRY_CONFLICT`, retain date and reason, preserve
project and language context, focus a visible notice, and offer the worker
payments review link. An exact retry reports the existing reversal truthfully;
the database has one reversal event and no duplicate. No runtime console
errors were observed.

The four PNGs are cropped problem notices. The two JSON files contain only
reduced assertion outcomes. Phone crops were checked against the fixed bottom
navigation and visible toasts before capture; all four final images were
visually inspected and are unobscured. No payment identifiers, private worker
data, credentials, raw responses, or browser traces are included.
