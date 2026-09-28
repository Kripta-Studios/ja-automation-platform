# Crew stale delegation browser rerun

Candidate: `7f5153c`. Actual Chromium, 390 px, Portuguese, disposable SQLite and local SvelteKit preview on port 4175. The Owner granted a Crew Chief and then revoked the only grant for that Chief/project using the browser UI. The Chief had the valid Crew filter open before revocation.

The unchanged **Show project** submission still failed to refresh the Crew data. The form passed native validity, and the hidden `filterRefresh` UUID was already present in the current URL from the preceding valid correction. Submitting changed only `viewportScrollY` from `0` to `300`; no GET request appeared in the browser network events, the URL retained the same `filterRefresh` value, and the page continued to show the Chief's stale Crew controls. A forced fresh GET returned HTTP 200 with `CREW_DAY_PROJECT_UNAVAILABLE_CHIEF`, the translated PT contact-owner remedy, a disabled retained project option, a visible focused notice, and no Crew rows. The grant row was `revoked` in the disposable DB. No browser console or page exceptions were observed.

The 1440 px repeat was deferred after the concrete 390 px failure. The machine-readable `chief-390-pt-refresh-results.json` is redacted; screenshots show only disposable demo fixture names. `candidate.spec.ts` retains the failing assertion for the next product fix.

This run used the already built preview for `7f5153c` to avoid another build while disk space was constrained. The local Playwright fixture lock and disposable DB were removed after the interrupted preliminary run; no other agent's fixture or port was touched.
