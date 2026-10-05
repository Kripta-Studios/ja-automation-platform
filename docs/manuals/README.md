# J&A Automation manuals

**BBS / Owner operating reference · 5 October 2026:** the revised [illustrated BBS guide](BBS_Project_to_Client_Invoices_Guide_EN.md) ([PDF](BBS_Project_to_Client_Invoices_Guide_EN.pdf)) adds Owner access/navigation, setup checkpoints, correction/reporting instructions, financial lifecycle and landscape XLSX examples. Its six final annex pages are genuine application-issued training invoices from an isolated database. Synthetic training approval/payment records do not assert real accountant approval or bank transfers. See the guide’s verification scope and [reproducible builder](../../scripts/bbs-owner-manual/README.md).

**Current deployed-app edition: 24 September 2026.** Start with the [current work guide](Current_Deployed_Workflows_2026-09-24.md) or its [PDF edition](Current_Deployed_Workflows_2026-09-24.pdf). The [role workflow diagram PDF](Role_Workflows.pdf) gives the normal Owner → project team → Worker/Chief → review → Finance → invoice route at a glance; its [HTML source](Role_Workflows.html) is also available. The guide is anchored to live release `zip-d215671b99323d6d8c4ce34b74b4f8e0` and to [nine dated test-account browser screenshots](assets/deployed-2026-09-24/capture-manifest.json). Screenshots show the real displayed UI and the synthetic QA project's actual empty state; they do not certify a completed invoice journey.

| Role                        | Current English instructions                              | Live screenshot focus                                                                                                                                             |
| --------------------------- | --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Owner                       | [Project-to-invoice guide](Role_Guide_owner_EN.md)        | Synthetic project, Team and project-local Billing captured with a Finance test account; Owner-only actions are described, not falsely attributed to that account. |
| Project manager             | [Operational guide](Role_Guide_manager_EN.md)             | Assigned QA project and Team tab. The deployed test-manager UI lacks worker assignment.                                                                           |
| Worker                      | [Time, expense and report guide](Role_Guide_worker_EN.md) | Actual-hours and expense forms on a 390-pixel phone.                                                                                                              |
| Chief / delegated team lead | [Crew guide](Role_Guide_chief_EN.md)                      | Crew hours on a 768-pixel tablet; no test delegation currently exists.                                                                                            |
| Finance administrator       | [Billing guide](Role_Guide_finance_EN.md)                 | One/two-invoice arrangement and the empty invoice register.                                                                                                       |

The current guide records the exact capture account, route, viewport, image hash and deployed image tag. Test credentials are kept in the local, Git-ignored `Portal_Test_Accounts.private.md`; they are **not** embedded in this repository, the guide PDFs or PNGs. No real worker compensation, receipts or mailbox contents are included. Browser phone/tablet viewports are not physical iPhone/iPad Safari verification.

## GitHub role sign-in smoke

The public repository contains a manually triggered, read-only [role sign-in workflow](../../.github/workflows/production-role-smoke.yml). A repository administrator must create a protected GitHub Actions environment named `production-qa`, restrict it to `main`, and require a reviewer before use. Under that environment's **Environment secrets**, add separate email and password secrets from the local `Portal_Test_Accounts.private.md` for these rows:

| Manual row            | Email secret                       | Password secret                       |
| --------------------- | ---------------------------------- | ------------------------------------- |
| Finance Administrator | `JA_QA_FINANCE_EMAIL`              | `JA_QA_FINANCE_PASSWORD`              |
| Project Manager       | `JA_QA_MANAGER_EMAIL`              | `JA_QA_MANAGER_PASSWORD`              |
| Read-only Auditor     | `JA_QA_AUDITOR_EMAIL`              | `JA_QA_AUDITOR_PASSWORD`              |
| Worker 1              | `JA_QA_WORKER_EMAIL`               | `JA_QA_WORKER_PASSWORD`               |
| Supplier Coordinator  | `JA_QA_SUPPLIER_COORDINATOR_EMAIL` | `JA_QA_SUPPLIER_COORDINATOR_PASSWORD` |
| External Technician   | `JA_QA_EXTERNAL_TECHNICIAN_EMAIL`  | `JA_QA_EXTERNAL_TECHNICIAN_PASSWORD`  |

The local private manual also contains the Owner test account for authorized browser QA. The GitHub workflow uses only the six separate role secrets above; it checks those identities, roles, supplier navigation profiles, and sign-outs against the deployed portal. It only navigates to the workspace after authentication and does not submit business forms or cover Owner. Keep the private manual and all working passwords out of Git history, workflow inputs, logs, and artifacts.

Production limits authentication attempts by source address. If the runner receives HTTP 429 during sign-in or sign-out, the smoke waits for the server's `Retry-After` window and retries once; a second 429 fails the run. This keeps the production limit intact.

For a local check, run `node scripts/production-role-smoke.mjs --validate-only` from the repository root with the ignored manual present. The production sign-in check runs only when manually dispatched from GitHub Actions. The application itself does not read or ship these credentials to users.

## Existing portal PDFs and generated examples

The older `Work_Projects_Guide.pdf`, `Supplier_Operations_Guide.pdf`, `Administration_Finance_Guide.pdf`, individual role PDFs, PT-BR guides, and the synthetic [example exports](examples/README.md) remain available as **historical or illustrative editions**. Their embedded screenshots and instructions were generated from earlier local synthetic captures; some wording (notably mandatory start/end time and separate Billing streams) no longer matches this deployed release. Use the current dated guide for the workflow above until those editions are regenerated from a matching release. The portal's Help catalog may still serve an older PDF; that does not make its illustrations current live evidence.

The existing PDF pipeline is `scripts/capture-user-manuals.ts`, `scripts/generate-user-manuals.ts`, `scripts/generate-client-ready-manuals.ts` and `scripts/manual-pdf.ts`. It intentionally requires a current local runtime digest, complete authenticated synthetic capture manifest and image hashes. Do not point the fixture-resetting capture suite at production or regenerate those grouped PDFs from mismatched local code. The new dated PDF is rendered separately from the dated Markdown and the nine read-only production screenshots.

After editing the dated Markdown, regenerate only its companion HTML/PDF with `/opt/jaautomation/runtime/node/bin/node docs/manuals/render-current-guide.mjs` from the repository root. Recheck screenshot hashes against the manifest and inspect the PDF before publishing. This renderer reads the already captured PNGs; it does not log in or change application data.

To report an access or form problem, include the role, route, project number, actual on-screen error and time. Do not send a password, receipt or private customer/worker document in a support message.
