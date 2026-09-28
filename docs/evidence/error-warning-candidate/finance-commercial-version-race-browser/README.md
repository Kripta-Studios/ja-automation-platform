# Finance commercial assignment version race: independent browser QA

Candidate product commit: `695d3cf`. Environment: disposable local SQLite database and portal preview, real Chromium sessions, no production access. The portal was built once. Final result: **3/3 browser tests passed** in 42.8 seconds.

| Viewport and locale | Fallback stale POST | Rule-reference stale POST | Focus and notice bounds |
| --- | --- | --- | --- |
| Finance 390 × 844, English | 409 `FINANCE_ASSIGNMENT_COMMERCIAL_VERSION_CHANGED` | Same | Fallback 178–516 px; references 85–423 px, safe area 78–756 px |
| Finance 1440 × 900, Spanish | Same | Same | Fallback 280–515 px; references 312–548 px, safe area 80–884 px |
| Finance 430 × 932, Portuguese | Same | Same | Fallback 181–519 px; references 275–612 px, safe area 78–844 px |

## Actual browser journey

Owner created a QA project and Worker assignment through the Projects form. Finance created two valid, open-ended customer rates through the Finance form. Three independent Finance sessions opened the same assignment editor. Session B saved a worker-pay fallback change while A held a different internal-cost fallback choice at the old `expectedVersion`. A's native submission returned 409 and the stable version-changed code; a second stale session's enhanced-format request returned HTTP 200 with a SvelteKit failure envelope carrying action status 409 and the same code. No requests were intercepted.

The failed form kept A's two attempted fallback values. The comparison showed B's current saved worker-pay fallback **On** versus A's **Off**, and current internal-cost fallback **Off** versus A's **On**. The notice said the attempted changes were not saved and offered one role-safe **Review updated record** link. Save was disabled until review. Clicking the link reloaded the selected assignment, restored B's current values and enabled Save. It did not submit A's values or add an audit event.

The sessions then reloaded at the new version. B selected the first customer rate and saved it; A held the second rate at the old version. Native and enhanced stale submissions again returned the typed 409. The comparison showed the current saved 71.25 rate versus A's attempted 75.50 rate, while marking unchanged worker-pay and internal-cost rule choices as matching. A's selected rate remained in the form; Save was disabled. Clicking **Review updated record** loaded B's first rate and enabled Save without another write.

Across English, Spanish, and Portuguese, the Commercial view and editor stayed open on failure. The `ProblemNotice` received keyboard focus and was visible between sticky header and phone navigation, with no horizontal overflow. Assignment versions advanced only for B's two successful saves (1 → 2 → 3); the stale native/enhanced requests and review clicks left the assignment and audit count unchanged. Owner and Finance browser sessions had no page or console exceptions. Native response bodies contained the stable code and no generic “Check the submitted values” copy.

## Evidence and limits

Redacted `*results.json` files record network status/code, localized notice and comparison copy, retained choices, remedy href, focus and viewport bounds, assignment/audit checks, and diagnostics. Cropped `*fallback.png` and `*references.png` images show only the notices. Fixture identifiers are replaced with `[qa-id]`; no credentials, cookies, or raw traces are retained. The enhanced request checks SvelteKit's action envelope from a separate stale form; it does not exercise a client-side `use:enhance` transition. This run covers assignments still visible in the current commercial summary; a concurrent assignment-date change that removes the row from that summary is outside its scope.

The first exploratory run was blocked by two test-harness mistakes: a generated cost-center suffix sometimes failed the required trailing-digit rule, and the editor helper clicked an already-open `<details>` during phase two. Both were corrected in the evidence-only spec, then all three final browser runs passed on the same built product commit.
