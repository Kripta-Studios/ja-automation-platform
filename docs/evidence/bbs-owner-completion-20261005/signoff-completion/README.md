# BBS-SIGNOFF-02 — synthetic training acceptance lifecycle

**SYNTHETIC TRAINING ONLY. No actual customer signature, customer acceptance, accountant approval, dispatch or external transaction occurred.** All actions ran as the Owner in the isolated loopback clone. Fictional signer: `TRAINING ONLY Customer Representative`, `training-customer@example.test`. The PDF begins with **SYNTHETIC TRAINING - NOT CUSTOMER SIGNATURE**, then includes the unchanged native v2 report pages. Fixture SHA-256: `9eb7b6d7a6c28832d1b3f74cdcf7a7f27fbd8fcf3af5fd937bc1237557e6603b`.

| Step | Actual control and observed result | Screenshot caption |
|---|---|---|
| Training upload | Open BBS Owner onboarding lab customer period; Ready for signature; choose marked synthetic PDF, fictional Signer name/identity, signature date 5 October 2026; Record verified signed-copy evidence. | 01: Synthetic training upload, not an actual customer signature. |
| Training accepted state | UI displays Verified evidence, fictional signer, server verification time and exact v2/hash binding. | 03: Synthetic training acceptance-state exercise; no actual customer acceptance. |
| Invalidation | Invalidate sign-off disclosure; Reason for invalidation explicitly SYNTHETIC TRAINING ONLY; Confirm invalidation. | 04: Synthetic training invalidation reason and action. |
| History retained | UI reads Invalid / superseded and says previous conformity retained for audit. Read-only receipts confirm immutable v2 snapshot/signature evidence reference and original native PDF bytes remain preserved. | 05: Invalidated synthetic training acceptance; previous record retained. |
| Replacement | Reports > Client Sign-off > Refresh period reports disclosure > Open period refresh. Same project/date, English; Hours, activity and selected technical reports; select BBS LAB simulated control bench; Refresh reports. Current container becomes v3 / Review required / Needs report. | 06: Replacement version after synthetic training invalidation; approval and PDF readiness must be repeated. |

Refreshing the identical Hours and activity summary did not change the version. Selecting the existing approved simulated Technical report changed the output to v3. The replacement retained **12.0 hours, two approved 6-hour time sources, one Daily report** and added one selected Technical report. Superseded 8-hour sources were not counted. The approved v2 conformity retains its original snapshot/hash and native PDF; the legacy period container now points to v3. This is a replacement snapshot version, not a separate legacy period row.

The isolated clone's existing document policy committed this known synthetic fixture as `not_scanned`. No pending document-scan job existed, and no scanner override, direct database write or fabricated scanner result was used. A wait for a pending-scan indicator was a harness expectation mismatch; accepted-state verification succeeded on a fresh page. Application page/console/HTTP diagnostics were clean.

Observed limitation: the selected Technical report's change details in the replacement period page display a raw structured JSON value. No product source was changed in this evidence task. The native replacement PDF lists one Technical source but its Detail cell is blank; the page displays raw JSON. PDF/customer content with selected technical details should be reviewed for readability before real delivery.

The external private browser script uses the existing private cookie jar; no credential or global Team dump is included in this packet. Public evidence is scoped screenshots, SHA manifests and sanitized lifecycle receipts.

Replacement readiness also passed: Approve customer report > Generate report; guarded isolated artifact runner processed two expected v3 jobs with zero failures; fresh page reads **Ready for signature**, exact **v3/hash**. Native English Download succeeded. Screenshot 07 caption: **Replacement v3 ready after synthetic training acceptance invalidation; no actual customer acceptance.** No synthetic acceptance was added to v3. Its native PDF still contains 12 hours and the same two 6-hour sources; one selected Technical source is added. Old v2 native PDF bytes remain preserved with their original hash.

The six screenshots omit the top 72 pixels of fixed global navigation to remove the actual account name. No business control or state was altered. Capture hashes and sanitized read-only history receipts are included.

The explicitly marked [synthetic training fixture](fixtures/BBS-LAB-SYNTHETIC-TRAINING-NOT-CUSTOMER-SIGNATURE.pdf) is included for reproducibility. Its first page disclaims customer signature/acceptance; the remaining page is the unchanged customer-safe native v2 report. It is never a real signed customer document.
