# Client timezone candidate browser check

Disposable local Chromium checked the actual New Client form for Owner and Finance at 390 × 844 and 1440 × 900. The test source is [`tests/e2e/client-timezone-validation.spec.ts`](../../../../tests/e2e/client-timezone-validation.spec.ts). No production client was created by this check.

Each role entered a unique QA client with `Invalid/QA` as its timezone. The native form POST returned HTTP 400 and `CLIENT_TIMEZONE_INVALID`. The error named the timezone issue, attached an error beside the timezone input, and kept the client name, code, currency, contact email, billing address, payment terms, notes, and invalid timezone. The validation summary received keyboard focus and was fully inside the viewport after recovery. The disposable database still had zero rows for that name. Replacing the timezone with `Europe/Madrid` returned HTTP 200, displayed a success toast, and inserted exactly one row with that timezone. The four-case run passed again after the scroll fix.

The rejected-state [phone screenshot](owner-phone-390-invalid.png) and [redacted network/interaction summary](owner-phone-390-network.json) illustrate the captured state. The same artifacts exist for Finance and desktop cases. The JSON records HTTP status, code, field, focus, and console counts; it contains no session data or passwords.

## Duplicate client code

A later candidate build was checked through the actual New Client form at 390 × 844 and 1440 × 900. Owner first created a QA client, then entered a second client with the same unique code. Both cases passed: the first POST returned 200, the second returned 409 with `CLIENT_CODE_ALREADY_USED`, an inline `clientCode` error, an explanation, and retained fields. The validation summary had keyboard focus and was visible in both viewports; the database had exactly one row with the code. The response contained no raw SQL constraint text, and there were no page exceptions. See the [phone screenshot](duplicate-owner-phone-390.png) and [redacted result](duplicate-owner-phone-390.json), with matching desktop artifacts.

## Remaining candidate issues

- The disposable fixture disables offline identity, so `/api/offline/identity` returned expected 503 responses and browser resource warnings. The test excludes only this exact endpoint and the expected invalid-form 400 or duplicate-code 409; it still fails on page exceptions and other HTTP errors.

Commands:

- Timezone (four cases): `PATH=/opt/jaautomation/runtime/node-v24.19.0/bin:$PATH corepack pnpm exec playwright test tests/e2e/client-timezone-validation.spec.ts --project=phone-390 --project=desktop --reporter=line`.
- Duplicate code (two cases): `PATH=/opt/jaautomation/runtime/node-v24.19.0/bin:$PATH corepack pnpm exec playwright test tests/e2e/client-timezone-validation.spec.ts --grep 'typed duplicate client-code' --project=phone-390 --project=desktop --reporter=line`.
