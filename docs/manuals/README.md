# J&A Automation manuals

**Current deployed-app edition: 24 September 2026.** Start with the [current work guide](Current_Deployed_Workflows_2026-09-24.md) or its [PDF edition](Current_Deployed_Workflows_2026-09-24.pdf). The [role workflow diagram PDF](Role_Workflows.pdf) gives the normal Owner → project team → Worker/Chief → review → Finance → invoice route at a glance; its [HTML source](Role_Workflows.html) is also available. The guide is anchored to live release `zip-d215671b99323d6d8c4ce34b74b4f8e0` and to [nine dated test-account browser screenshots](assets/deployed-2026-09-24/capture-manifest.json). Screenshots show the real displayed UI and the synthetic QA project's actual empty state; they do not certify a completed invoice journey.

| Role | Current English instructions | Live screenshot focus |
| --- | --- | --- |
| Owner | [Project-to-invoice guide](Role_Guide_owner_EN.md) | Synthetic project, Team and project-local Billing captured with a Finance test account; Owner-only actions are described, not falsely attributed to that account. |
| Project manager | [Operational guide](Role_Guide_manager_EN.md) | Assigned QA project and Team tab. The deployed test-manager UI lacks worker assignment. |
| Worker | [Time, expense and report guide](Role_Guide_worker_EN.md) | Actual-hours and expense forms on a 390-pixel phone. |
| Chief / delegated team lead | [Crew guide](Role_Guide_chief_EN.md) | Crew hours on a 768-pixel tablet; no test delegation currently exists. |
| Finance administrator | [Billing guide](Role_Guide_finance_EN.md) | One/two-invoice arrangement and the empty invoice register. |

The current guide records the exact capture account, route, viewport, image hash and deployed image tag. [Test credentials](Portal_Test_Accounts.private.md) are published separately in this public repository at the owner's explicit request; they are **not** embedded in the guide PDFs or PNGs. No real worker compensation, receipts or mailbox contents are included. Browser phone/tablet viewports are not physical iPhone/iPad Safari verification.

## Existing portal PDFs and generated examples

The older `Work_Projects_Guide.pdf`, `Supplier_Operations_Guide.pdf`, `Administration_Finance_Guide.pdf`, individual role PDFs, PT-BR guides, and the synthetic [example exports](examples/README.md) remain available as **historical or illustrative editions**. Their embedded screenshots and instructions were generated from earlier local synthetic captures; some wording (notably mandatory start/end time and separate Billing streams) no longer matches this deployed release. Use the current dated guide for the workflow above until those editions are regenerated from a matching release. The portal's Help catalog may still serve an older PDF; that does not make its illustrations current live evidence.

The existing PDF pipeline is `scripts/capture-user-manuals.ts`, `scripts/generate-user-manuals.ts`, `scripts/generate-client-ready-manuals.ts` and `scripts/manual-pdf.ts`. It intentionally requires a current local runtime digest, complete authenticated synthetic capture manifest and image hashes. Do not point the fixture-resetting capture suite at production or regenerate those grouped PDFs from mismatched local code. The new dated PDF is rendered separately from the dated Markdown and the nine read-only production screenshots.

After editing the dated Markdown, regenerate only its companion HTML/PDF with `/opt/jaautomation/runtime/node/bin/node docs/manuals/render-current-guide.mjs` from the repository root. Recheck screenshot hashes against the manifest and inspect the PDF before publishing. This renderer reads the already captured PNGs; it does not log in or change application data.

To report an access or form problem, include the role, route, project number, actual on-screen error and time. Do not send a password, receipt or private customer/worker document in a support message.
