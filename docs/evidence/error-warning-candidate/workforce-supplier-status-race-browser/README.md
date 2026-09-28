# Owner workforce profile after supplier deactivation: browser QA

All runs used actual Chromium with a disposable local SQLite database and Portal preview. No production origin was contacted. Owner used the Supplier UI to create two QA suppliers. In a second Owner tab, the Worker specialist editor selected the first supplier and External technician. Owner then removed that supplier through the Supplier directory confirmation sheet while the editor remained open. The stale profile form was submitted natively; no requests were intercepted.

## Diagnostic at `f61a510`

The native response was HTTP 409 with `ACCESS_WORKFORCE_SUPPLIER_INACTIVE`, retained Worker/profile/Supplier values, and no generic validation copy. The localized notice was focused; an inline Supplier field error, disabled inactive selection, and role-safe Review supplier status link were present. The remedy opened the inactive Supplier directory in the selected language. The rejected save added no profile or Worker audit write. Choosing the second active supplier then saved successfully with one Worker audit event. All three viewports had no page or console exceptions.

The fixed error toast obscured the notice for more than two seconds: **293 × 96 px overlap** at 390 px English, **309 × 108 px** at 1440 px Spanish, and **333 × 96 px** at 430 px Portuguese. The toast was gone after nine seconds. Cropped `baseline-f61a510/*notice.png` screenshots show the wording and remedy obscured. The baseline therefore failed the visible-wording criterion despite the successful action and field checks.

## Retest at `7b12479`

The portal was rebuilt once from the frozen commit. The same UI race passed **3/3** browser tests in 50.5 seconds:

| Viewport and locale   | Notice bounds | Toast bounds while visible | Vertical overlap |
| --------------------- | ------------- | -------------------------- | ---------------- |
| 390 × 844, English    | 452–644 px    | 660–768 px                 | **0 px**         |
| 1440 × 900, Spanish   | 629–760 px    | 776–884 px                 | **0 px**         |
| 430 × 932, Portuguese | 540–732 px    | 748–856 px                 | **0 px**         |

The zero-overlap state persisted after two seconds. The focused notice and entire remedy were readable above the toast and phone navigation. The typed 409, translated inline Supplier error, retained External technician and disabled inactive Supplier selection, Specialists tab and Worker query, inactive directory remedy, unchanged profile/audit after the rejection, successful alternate-supplier save, and empty page/console exception arrays all remained correct.

The [reusable browser spec](candidate.spec.ts) and [config](playwright.config.ts) run the three viewports against the standard disposable fixture. Redacted `*results.json` files preserve network, focus, viewport, DB/audit, remedy, recovery, and toast geometry. Cropped images contain only the notice area. Fixture identifiers are replaced with `[qa-id]`; no credentials, cookies, or raw traces are stored. This evidence covers an Owner editing a Worker account; other workforce roles and enhanced submission were outside this focused race.
