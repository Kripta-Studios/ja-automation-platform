# Browser workflow QA — 2026-10-01, round 5

## Scope and method

Owner-authorized continued browser-only workflow testing on `https://j-aautomation.com/j-aautomation/app`. All functional actions and assertions used the actual Chromium UI: normal sign-in, forms, links, dialogs, rendered records and browser downloads. Source inspection, static checks, copying an online database/files snapshot for an isolated preview and release operations are separate engineering checks. No API scripts, SQL workflow assertions, unit tests or integration workflow tests were used.

Accounts exercised: canonical owner; Worker1/crew chief; recommended project manager; Finance Admin; read-only Auditor; Worker3 without assignment to this synthetic project. Credentials remain in the existing private manual and are excluded here and from the source archive.

Reused synthetic project `C-0047-P-26100104` / `01a0f76d-8a77-72bb-b57c-a9ebcb3e633e` (QA ROLE WORKFLOWS ROUND4 20261001). Production commercial settings and money were not changed during this round. After deployment the synthetic project alias was temporarily saved with a QA value and restored to empty, producing audited versions2 and3. Production gained one explicitly named QA daily report, its review events and an English PDF; no customer invoice was issued and no payment or reimbursement was initiated.

## Reproduced issues and changes

1. **Project editor silently discarded unsaved values.** On live production at390px, Owner changed the budget text and alias, clicked Cancel, and reopened. There was no confirmation; budget reverted to `none` and alias to empty. Enabled the existing ResponsiveSheet changes protection and connected the Cancel button to its guarded close handling. Header close, Escape, internal navigation and native unload use the same existing guard.
2. **Commercial configuration showed codes and required typing budget codes.** Production facts read `tm` and `none`; edit Budget type was a free-text input. Added dedicated localized billing-model and budget-type display domains, corrected daily-minimum wording, and replaced the budget input with the same seven named choices as project creation. An existing unrecognized budget value is retained as a selected option; history and stored values are not reinterpreted. Legacy unknown-value preservation was source-reviewed, not exercised with a fabricated browser fixture.
3. **Unchanged report corrections gave an unhelpful generic error.** On live production, an approved daily report with only a correction reason entered returned “Check the submitted values and try again.” Catch the specific no-operational-change validation for daily/technical reports and return `CORRECTION_CHANGES_REQUIRED`: “Change at least one operational field before creating a corrected draft.” Retain allowlisted input and link “Review report fields” to the correction form rather than reloading the source.

## Actual production workflow before release

- Worker1 created `QA ROUND5 daily report inspection`, ID `01a0f7a1-37b4-74e7-889b-b809dc611e53`. Missing Tasks completed produced a field-local error and summary, retaining entered summary text.
- Cancelling a dirty new-report close kept the entered fields. Double-click Save created exactly one daily report in the scoped register (0→1).
- Next-day plan autosaved to version2; submission retained that fact and became Submitted/version3. Owner double-click Approve resulted in Approved/version4 and one visible approval audit event.
- Worker generated the English PDF: Queued→Ready, then a successful browser download named `Daily-report-C-0047-P-26100104-2026-10-01-QA-ROUND5-daily-report-inspection-v4-en-US.pdf`.
- Assigned PM could read the approved report. Owner project summary showed one report,3.25h actual time and USD55.00 direct cost, unchanged from the prior round.

## Isolated candidate browser verification

Preview `http://127.0.0.1:5182/j-aautomation/app`, using an online production snapshot and copied private files, separate auth secret, disabled SMTP and offline features. Writes below affect that snapshot only.

- Owner Commercial facts/edit:360/390/768/1440, no horizontal page overflow. Named labels and all seven budget options present; EN/ES/PT daily-minimum and budget labels localized.
- Saved model daily-minimum and Revenue budget, reloaded, verified labels and unchanged3.25h/USD55.00. Selected Purchase order and invalid planned end2026-09-30: existing date errors retained both values. Cancelling Cancel and header-close confirmations after failure kept those values; correcting the date and saving succeeded without a discard prompt.
- Dirty budget/alias at360/390/768/1440: cancelling both Cancel and Escape confirmations retained fields. Explicitly accepting discard closed the editor. English, Spanish and Portuguese confirmation text verified.
- Worker daily-report no-change correction at360/390/768/1440 and EN/ES/PT: specific message, retained reason, same-page recovery anchor and no horizontal overflow. No captured page errors.
- Existing QA technical report `01a0ef32-6818-7338-8c44-aa78492c72ce` approved only in the snapshot; no-change correction also returned the specific message and recovery anchor.
- Valid daily-report correction double-click created one redirected draft, ID `01a0f7b1-c406-700e-98ed-3a0c1cb7341a`. The corrected handover appeared in the draft. Withdrawing through the UI returned to the Approved/version4 source with its original handover; withdrawal was not a source deletion.
- Invalid `.exe` attachment produced a clear allowed-file error and retained notes/selection. UTF-8 text attachment then uploaded, displayed once with private evidence metadata and a Download action. The download was clicked; unlike the production PDF, a correctly synchronized download-completion receipt was not captured, so completion is not claimed for this text attachment.
- Finance/Auditor390: readable Commercial facts; neither had Owner project-edit control. Finance retained configuration link; Auditor had no write/configuration link. No captured page errors or horizontal overflow.
- PM390: forced Commercial tab URL fell back to operational Overview, with no Commercial tab or financial projection. PM could read the approved operational report.
- Unassigned Worker3: project access restricted and report showed scoped No results; no report facts or Commercial tab appeared.

Raw screenshots, downloaded production PDF and logs: `/home/kripta/ja-browser-round5-20261001` (private VPS evidence, excluded from source packaging). This is scoped workflow evidence, not exhaustive every-action, issued-financial, offline or full Client Essential acceptance.

## Engineering checks and release

Global workspace typecheck and lint passed after the display/message implementation. Final focused portal typecheck, scoped lint, Prettier check and `git diff --check` also passed. Independent read-only reviewer `/root/review_round5_workflows` returned **SHIP**, no blocking findings in the four round5 source diffs; source, scoped evidence and phone screenshots reviewed. No independent functional test was claimed. Activation and live rechecks follow after completion.


## Activation and actual live recheck

- Release completed **2026-10-01 15:52:26 Europe/Madrid**, archive SHA-256 `4f34490d89e84fe4e3dfaee559fb817ff64644144a12862ac2cacf0f68048cd1`,4676 source files,309689545 bytes. Active path `/opt/jaautomation/releases/ja-automation-4f34490d89e84fe4e3dfaee559fb817ff64644144a12862ac2cacf0f68048cd1`; portal/jobs/site tag `zip-4f34490d89e84fe4e3dfaee559fb817f`. Four installed source hashes match the reviewed workspace files.
- Full production portal/site builds passed. Preview and extra browser contexts were closed before deployment; `COMPOSE_PARALLEL_LIMIT=1 COMPOSE_BAKE=false` serialized builds. Existing portal/site health remained healthy during build. Final portal/site health is healthy, jobs running, jobs/backup timers active. Local/public URL and service-actor checks passed in the deployment script.
- Pre-switch online backup `/var/backups/jaautomation/2026-10-01T135213935Z-5a42b369-7183-431f-bede-0ede73719bdd`,8 documents, databaseSHA-256 `cd5037d5bd3e8618cbb70f32c7b1bbe9baf5add42b7a5848687fd5c0fbf03cf1`. Previous images retained as rollback.
- Live Owner360/390/768/1440: facts read Time & materials/No budget; dropdown works. Cancel, header-close and Escape each prompt. Dismissing retains Purchase order and entered alias; accepting discard closes. No horizontal page overflow or captured page errors. The first combined capture returned transient modal state without its final result; completed checks were repeated with recorded results in `live-browser-results.json`, not inferred from that transient receipt.
- Live Owner390: saved synthetic alias `QA ROUND5 live project save`, reloaded and read it from the edit field at version2; restored empty alias and verified version3. Both saves closed normally with zero discard prompts. Model `tm`, budget `none`, actual time3.25h, contribution−USD55.00/direct costUSD55.00 and one report remain correct.
- Live Worker360/390/768/1440 with EN/ES/PT: unchanged daily-report correction returns the specific operational-change message, retained reason and correction anchor. No horizontal overflow/captured page errors. Existing Approved/version4 source remains unchanged. English PDF downloaded again successfully after activation with the same semantic filename.
- Additional fresh post-activation Finance sign-in was blocked by the existing rate limit with its clear wait-and-retry message. That protection was not weakened or bypassed. Post-activation Finance/Auditor/PM/unassigned-worker replay was therefore not completed; their candidate checks above and PM pre-activation live read are the applicable evidence.

Reviewed fixes are deployed and live Owner/Worker regressions pass. Other acceptance areas remain explicitly outside this round.
