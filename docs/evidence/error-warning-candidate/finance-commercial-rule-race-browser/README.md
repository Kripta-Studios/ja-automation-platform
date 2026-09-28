# Finance stale commercial rule: independent browser QA

Candidate product commit: `d17af6e`. Environment: disposable local SQLite database and portal preview, real Chromium sessions, no production access. The portal was built once. Final run: **3/3 browser tests passed** in 38.0 seconds.

| Viewport and locale | Native stale-rate POST | Enhanced-format action | Focus after two animation frames |
| --- | --- | --- | --- |
| Finance 390 × 844, English | 409 `FINANCE_ASSIGNMENT_COMMERCIAL_RULE_UNAVAILABLE` | HTTP 200 envelope, failure status 409 and same code | Notice 86–439 px, safe area 78–756 px |
| Finance 1440 × 900, Spanish | Same | Same | Notice 492–784 px, safe area 80–884 px |
| Finance 430 × 932, Portuguese | Same | Same | Notice 492–844 px, safe area 78–844 px |

## Browser journey

Owner created a clearly named QA project with one Worker assignment through the Projects form. Finance created an open-ended customer labor rate through the Finance form. Two independent Finance browser sessions opened **Configure this person** and selected that rate. Owner then deactivated the same QA rate through the rendered **Client labor rates** form while both Finance forms remained open. One Finance session submitted the stale selection as a native form; the second sent the SvelteKit enhanced action format from its still-open form. No requests were intercepted.

The native failure named the selected rule's lost coverage across the assignment's dates and scope in each language. The Commercial view, open editor, and selected rate remained. The notice offered three role-safe links to customer rates, worker compensation rules, and internal cost rules. The network response contained the stable code and no generic “Check the submitted values” copy. The enhanced-format response likewise contained a failure envelope with status 409 and the same code. The assignment's version, rate references, and audit-event count did not change after either blocked submission. Owner and both Finance sessions had no page or console exceptions, and there was no horizontal overflow.

Immediately when the native response became available, focus was still on `BODY` and the notice was below the viewport. After two browser animation frames, the `ProblemNotice` `ASIDE` had keyboard focus and was fully visible, clear of the sticky header and fixed phone navigation; this state persisted at 250 ms. The first exploratory run asserted too early and failed on that timing. The repeat measurement and complete run passed. A separate 430 px project-fixture timeout in the exploratory run did not recur; all three final runs created their prerequisites through the UI.

## Evidence and limits

Redacted per-viewport `*results.json` files record response shape, translated copy, three remedy targets, retained selection, focus, viewport geometry, unchanged assignment/audit, and diagnostics. Redacted `*focus-debug.json` files record the immediate, two-frame, and 250 ms states. Cropped `*notice.png` screenshots show only the notices. Disposable identifiers are replaced with `[qa-id]`; no cookies, credentials, or raw traces are retained. The enhanced request checks the SvelteKit action envelope from an unsubmitted second form; it does not exercise a client-side `use:enhance` transition. The test did not click the three remedy links or test selection after refreshing the rate list.

The reusable [browser spec](candidate.spec.ts) and [config](playwright.config.ts) require a portal build before preview. They use the standard disposable global setup and do not write production data.
