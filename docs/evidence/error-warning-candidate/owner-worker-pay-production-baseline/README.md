# Deployed Worker Pay browser baseline: login rate limit

Attempted read-only production browser scouting on 2026-09-27. The deployed login page responded HTTP 200, but the test accounts remained on `/app/login`. A focused Finance retest confirmed that the authentication POST returned HTTP 429 `application/json` with no browser page error. The browser did not reach `/app/manage/worker-pay` or `/app/expenses`; therefore this run provides **no evidence about either route's current error or warning presentation**.

No Worker Pay or Expense business request was made, no form was submitted, and no production record was changed. Authentication retries stopped after the 429 response. The local auth implementation uses a 15-minute window; the production bucket's start time was not observed, so no retry time is claimed.

The redacted [production-results.json](production-results.json) records the confirmed Finance login response. Owner and Worker attempts also remained on the login page but lacked captured POST status, so they are not used to infer the cause. The intended invalid GET and payer-warning baseline remains outstanding.
