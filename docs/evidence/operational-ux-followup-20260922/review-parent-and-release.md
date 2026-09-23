# Independent review of parent changes and release procedure

Reviewed on 2026-09-23 against the active `b30ae7b55a3f8afbe25aeae50e627f0b2c717439a898326932406cc197536d02` release. This reviewer did not implement the reviewed changes, run browser tests, alter production, or deploy. The only reviewer write is this evidence file.

## Verdict

**SHIP, conditional on the planned browser/manual and release gates.** No blocking correctness, authorization or data-loss issue was found in the parent-owned source changes or adapted deployment procedure. One small caption correction was requested before rendering the manuals: the Portuguese activity-inbox caption must use the actual UI labels **Todas/Não lidas**, rather than **Todos/Não lidos**. The Markdown instructions already use the correct labels.

## Source and documentation findings

- `ResponsiveSheet.svelte`: the delta against the active release excludes controls under `.searchable-select-popover` from the unsaved-values snapshot. The original select remains outside that popover and stays in the snapshot. The searchable selector implementation appends an auxiliary search input inside the dialog, making its query a confirmed source of false dirty state. Selecting an option still changes the original select and emits its normal input/change events. Popup Escape prevents propagation before the sheet's document handler; the change does not bypass protection for actual edits.
- `sheet-change-tracking.spec.ts`: exercises searching without selecting, unchanged original project value, closing without a confirmation, and a real category change whose dismissed confirmation retains the value. This is appropriate regression coverage for the reported false positive; actual pass status requires the coordinator's browser run.
- Seven manual Markdown updates describe the latest-50 notification scope, explicit individual marking, authorized links, UTC agenda interpretation, unknown-save verification and the distinction between a discard guard and persistent recovery. These match the relevant source. No instruction grants broader account scope or equates reading a notice with business approval. Validation-summary and Time-save statements depend on the independently owned follow-up implementations and their pending tests.
- `manual-current-capture.spec.ts`: adds inbox captures only for the five internal personas whose navigation exposes that destination. The existing synthetic fixture and per-context login remain in use. After the illustration's actual time values are entered, the script dismisses the picker, explicitly accepts the sheet's discard confirmation and waits for the form to disappear before navigating. It does not disable the production guard or save the synthetic illustration to production.
- `manual-pdf.ts`: the new caption key matches the new screenshot key and supports EN/ES/PT. Existing runtime-source identity and output/source hash binding remain active. Capture/PDF generation must run after runtime edits settle, because `readManualSourceIdentity` includes those runtime files.

## Release and preservation procedure

Inspected `/tmp/ja-followup-package.py`, `/tmp/ja-followup-deploy.sh`, `/tmp/ja-followup-postdeploy.py`, `/tmp/ja-followup-live-smoke.mjs` and the reusable `/tmp/ja-ux-preservation.py`.

- The package uses a separate Git index, stages the established allowlist, records its source tree and hashes each archive file. It does not change the user's normal index. Its receipt and target ZIP use a new follow-up name, avoiding collision with the active release's archive.
- The deploy wrapper validates the exact archive SHA, pauses only the deployment watcher path/timer, refuses an active scan, invokes the installed deployer, and checks that the activated symlink matches the expected digest. On failure it preserves the candidate outside the watched directory before restoring watchers, preventing an unintended automatic retry. The installed deployer matches the active release's version and provides the existing backup, health and rollback behavior.
- Post-deployment verification checks all archive manifest files, matches runtime source to the worktree, verifies the unrelated container IDs and Caddy PID, healthy web services, running worker and at least two error-free worker cycles. The separate preservation script verifies financial-table/private-file hashes plus SQLite integrity and foreign keys. Run these checks and the 12 public browser checks after actual activation; the scripts' presence is not evidence that those checks have passed.
- Syntax checks passed: `bash -n` for the wrapper, Python AST parsing for package/postdeploy/preservation scripts, and `node --check` for the live-browser script. These are static checks only.

## Cache-cleanup receipt

`cache-cleanup.json` is internally consistent. Its 50 authorized IDs match the 50 audited pre-cleanup records; every record has `InUse=false` and `Shared=false`. Removed IDs equal that exact set. The receipt's protected before/after objects are identical for images, containers, volumes, active link and release directories. It preserves the first no-op filter attempt rather than hiding it, then records the successful exact-ID attempt. Free space increased from 10,789,384,192 to 20,807,962,624 bytes; a fresh read-only `df` also showed approximately 20 GB available. No broader image, volume, release or data prune is evidenced or required by this review.

## Remaining evidence for the coordinator

Confirm the caption correction, narrow browser regressions at 360/390/768/1440, fresh authenticated synthetic captures and all nine PDF bindings, applicable type/lint checks, and actual deployment/backup/preservation/live-health receipts. This review does not certify the full Client Essential contractual acceptance journey.
