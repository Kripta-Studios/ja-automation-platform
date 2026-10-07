# REVIEW-C — navigation assistant integration signoff

Reviewed 2026-10-07 against deployed base `aa3b2f269a3a2202cdeff55338022a823956d065`, feature commit `830b32a8`, and the final working diff. This is a bounded read-only review of the assistant rollout; it is not a whole-application Client Essential `CLIENT READY` verdict. I did not launch a browser, build, test, deployment, or production write.

## Verdict

**SOURCE READY for the user-authorized assistant deployment.** No unresolved source-level authorization, privacy, route, record-projection, matcher, or draft-preservation blocker was found. The final primary suite passed **96/96 browser cases** with no failures, skips or flakes; the final focused unit/security/continuity suite passed **87/87**. The root confirms the final portal build and typecheck exited successfully. Publication remains contingent on packaging the exact clean reviewed commit and completing the established production backup, activation, live-account smoke, deployed-source comparison, and checked-lease `main` sync. This signoff does not claim those future production actions have happened.

## Reviewed behavior and boundaries

- The authenticated `/app` layout supplies role, workforce profile and a server-calculated canonical Owner hint. Production canonical Owner requires `owner_admin` and the canonical email; the synthetic Owner allowance is limited to non-production with both fixed fixture tenant/deployment IDs. Existing server action and object guards remain authoritative.
- `tasksForContext` fails closed for unknown roles/profiles, requires canonical Owner for sensitive team/mailbox tasks, and restricts supplier profiles to operational destinations. The catalogue has 120 destinations, including 112 visible to the canonical Owner. Role visibility is navigation guidance, not a server permission grant.
- Record choices come from known fields of the current authorized page projection. The assistant does not parse record IDs from prose or fetch a global directory. Svelte escapes labels. `assistantTaskUrl` admits authored local `/app` routes and opaque selected IDs, rejects external and named-action URLs, and carries only supported language values. The navigation code uses `goto`, disclosure opening, scroll and focus; it does not submit a business form.
- Query text stays in component memory. The assistant has no query network call or browser-storage write. The final matcher handles Portuguese `no projeto` as a preposition in bounded noun constructions while keeping explicit EN/ES/PT negations unsupported. Spanish `en`, English `on/in`, primary time/expense domains and inclusive fuzzy scoring support the contextual and `log timee` cases.
- The launcher and notice layers are 51/52, above ResponsiveSheet 49/50. The final browser matrix clicks the launcher over a dirty draft and checks that canceling navigation preserves the draft; Escape closes the assistant and restores launcher focus. Confirmed-destination checks prevent a canceled `goto` from revealing an old target.
- The final diff adds the matcher/CSS corrections, regression tests, refreshed browser/unit reports and screenshots, sanitized swarm observations, and evidence/checklist text. It contains no migration or persistent-data semantic change. `git diff --check` is clean; no TODO/FIXME or dead placeholder action was found in the new assistant code.

## Evidence and limits

- Final primary Playwright JSON: started 2026-10-07 20:48:34 UTC, duration 473.5 seconds, **96 expected / 0 unexpected / 0 skipped / 0 flaky**, 24 cases at each of 360, 390, 768 and 1440 widths. It covers base roles, restricted supplier profiles, localized matching, role gating, touch/focus, dirty drafts, cold/repeated surfaces and absence of named business-action submissions.
- Final focused unit JSON: **87 total / 87 passed / 0 failed**, including 68 assistant/canonical-Owner checks and 19 security/backup-continuity checks. An earlier loaded run timed out one unchanged security check; the clean rerun passed. The separate historical `client-essential-backup-restore.mjs` fixture still fails its synthetic Owner identity assumption, as the updated evidence states.
- Independent supplier final packet: four profile/viewport cases with 60 localized destination journeys and 48 safety checks. Independent operations packet: **6/6** Worker/PM phone/tablet cases, including typo matching, retained drafts and scoped project records, with zero observed business POSTs/browser errors. The exploratory Owner/Finance packet was interrupted after 10/15 passes; its one confirmed product issue was the mobile launcher layer, which the primary final 96-case matrix verifies after the fix. Its other failures were harness assumptions. The incomplete packet is diagnostic evidence only.
- The root confirms the final portal build and typecheck succeeded. The broader Svelte checker still reports **88 pre-existing errors and 8 warnings**; scoped diagnostics report no errors in the new assistant files or intersecting changed source lines. This is not a clean whole-application Svelte check.
- Predeploy verification of the latest actual production backup reports SQLite integrity `ok`, zero foreign-key violations, 27 documents and three of three days of backup manifest coverage. This is a backup metadata/integrity check, not a postdeployment restore claim.
- The updated assistant evidence and checklist distinguish prior deployed source from this pending rollout and correctly state that scoped assistant verification does not certify every source action or whole-app Client Essential acceptance.

## Remaining release execution

1. Commit the exact reviewed source/test/evidence tree, copy this signoff into the tracked evidence, and package a source-only archive from the clean commit with commit/tree/archive hashes. Keep production receipts external so the deployed source can be matched exactly.
2. Use the established `/usr/local/sbin/jaautomation-zip-deploy` online-backup/rollback flow; preserve the active and two rollback releases/images.
3. Verify production health and six existing real QA account navigation journeys, including logout; compare deployed source bytes with the packaged commit.
4. Sync GitHub `main` to the exact deployed commit with a checked lease and record the production receipts.

No production credentials, database contents or fixture secrets were read for this review.
