# Integration handoff

Candidate: `codex/digital-workers-20261011`, based on `27e57872`, in
`/home/kripta/ja-digital-workers-20261011`.

Production remains `workflow-06bdf74560f71ee0c488`. This branch has not been deployed.
The separate UX candidate is `codex/ux-workflow-refresh-20261011` in
`/home/kripta/ja-ux-refresh-20261011`.

## Shared files and integration

The UX candidate's tracked working-tree patch passed `git apply --check` against
this candidate on 11 October. That is a textual compatibility check, not combined
runtime validation. The shared backend file is `packages/database/src/repository.ts`:
the UX change adds project timezone to billing-rule rows, while this branch adds
a notification DTO adapter. Preserve both. This branch leaves the UX agent's
PortalShell, PortalChrome, project, billing/invoice, finance, login, navigation and
shared style files untouched.

This candidate adds assistant task catalogue entries for the new routes. The UX
navigation owner can integrate a permanent Digital workers entry when combining
the branches. The routes already work through Find a task and direct navigation:

- `/j-aautomation/app/workflow`
- `/j-aautomation/app/workflow/capture`
- `/j-aautomation/app/workflow/cases/<case-id>`

Independent visual review found that the existing fixed **Find a task** launcher
can overlap cards or the invoice-draft button at some phone/tablet scroll positions.
The matrix successfully operates the controls, and scrolling moves them clear.
The UX owner should check launcher placement in the combined PortalChrome;
this branch does not edit that owned component.

## Release prerequisites

1. Integrate both candidates in a release worktree and rerun their role/browser
   journeys. Our isolated test config uses **5174**; the UX worktree owns **4174**.
2. Build the final portal/jobs image, including the added local Poppler, Tesseract
   English/Spanish/Portuguese and util-linux packages. For a native VPS release,
   ensure those same binaries and language data are installed in its runtime.
   The host verification used
   installed English OCR. Validate the other image language packs in the final image.
3. Take the normal database plus private-artifact backup, apply registered additive
   migration **77**, and run integrity/upgrade and restore checks. Preserve the
   migration contract manifest and its matching exported hash.
4. Verify the existing automatic business-notification job picks up due work items.
   This branch adds no normal-user job-processing button or external email sender.
5. Coordinate a single release/cutover and record its receipt. No production
   database, symlink, service or deployment action was changed for this work.

There are no new external credentials or LLM API keys. Dictation remains optional
and requires an already installed browser language pack; it never falls back to
cloud transcription. Full offline attachment synchronization, model interpretation
of contracts/emails and generated report prose are not included.

Use [the evidence ledger](README.md) for the actual validation results and
[the operating guide](../../manuals/Digital_Workers.md) for role workflows.
