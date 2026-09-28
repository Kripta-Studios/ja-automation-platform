# Billing readiness recovery browser QA

On 2026-09-26, the isolated release candidate passed the disposable Playwright billing readiness journey at 390 px and 1440 px: **2/2 tests passed**. The test kept an invoice wizard open while its selected billing stream was disabled in the fixture database. Both roles received a typed `BILLING_READINESS_STREAM_UNAVAILABLE` 409, a localized notice and permitted setup remedy, retained period dates, focus on the notice, and no page or console errors.

Command, using the pinned Node 24 runtime:

```sh
PATH=/opt/jaautomation/runtime/node-v24.19.0/bin:$PATH corepack pnpm exec playwright test tests/e2e/error-warning-billing-readiness-api.spec.ts --project=phone-390 --project=desktop --reporter=line
```

The first run passed the phone case and stopped on a Spanish test locator that omitted “la” from the actual translated remedy label. After correcting that locator in the test, the final run passed both viewports in 50.2 seconds. This was a test assertion correction; the product code was unchanged between runs.

The four paired PNG/JSON files contain only cropped problem notices and reduced test outcomes from synthetic fixture data. The visible correlation IDs were generated for these disposable requests. No cookies, credentials, request bodies, customer records, raw network captures, or Playwright traces are included.
