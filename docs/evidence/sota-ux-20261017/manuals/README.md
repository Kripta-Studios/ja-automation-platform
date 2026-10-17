# Current manual build and verification · 17 October 2026

This release refreshes twelve current PDF assets from maintained English source: eight role courses, the extended Owner invoice reference, the project-to-invoice quick guide, Digital Workers reference, and Role Workflows map. The eight role courses are current English editions; Spanish and Portuguese Help surfaces identify English fallback, while historical translated PDFs remain dated archives. The catalog’s historical `manualRevision` stays `2026-09-22`; the eight courses and extended Owner reference carry the current `2026-10-17` revision.

`current-artifacts.json` is the per-file manifest with page count, landscape pages, byte count, SHA-256, strict-read status and text-on-every-page result. `pdf-verification.json` records role-specific instruction blocks, bookmarks, figure hashes, page totals, extracted-text checks, and the combined Owner checks. `owner-baseline.json` captures the pre-refresh Owner reference and combined manual page/annex/attachment baseline. `archives.json` is maintained by the separate historical-cover refresh and records its original-page preservation checks.

| Current PDF                                   | Pages | SHA-256                                                            |
| --------------------------------------------- | ----: | ------------------------------------------------------------------ |
| `BBS_Auditor_Manual_EN.pdf`                   |    47 | `5675eec996a8feebc4f5d0769571edcf8d049911563fc5c482083b3821ea297e` |
| `BBS_Crew_Chief_Manual_EN.pdf`                |    71 | `f9f48675f8ace8a16b09fc39151bff160a2f9b2068bba2dce3a22f46075d6a0a` |
| `BBS_External_Technician_Manual_EN.pdf`       |    60 | `f2a6bba6c1abce44ae766a874f3af36febe6a4f92e2343eaf9da00ecf09c5e2c` |
| `BBS_Finance_Manual_EN.pdf`                   |    77 | `387fb505cfe4f4e4765555fb9deb9a1326bca70fbd743b4b47f35039849a864d` |
| `BBS_Owner_Manual_EN.pdf`                     |   276 | `95e65271031e003dad785924b1511139e18d88ad06fc2078d38fd0cf83e3dce3` |
| `BBS_Project_Manager_Manual_EN.pdf`           |    85 | `de532a17732b777f653c879b113fb54903947ff0d3db0aa0d6776f927ffe229f` |
| `BBS_Supplier_Coordinator_Manual_EN.pdf`      |    64 | `9d7bb96f8e6e362789bb2a67dfbfea9af531cfb78a455a94fe2c5fb84a2ce6cd` |
| `BBS_Worker_Manual_EN.pdf`                    |    87 | `56ef137dd8d2377c6009fea902547a823872bdef7e7532cd55807211926d6149` |
| `BBS_Project_to_Client_Invoices_Guide_EN.pdf` |   219 | `46e538fe1346e1d072d8c76a81bc2b0468c3eb3c9605bbb0d99dc1297d02150d` |
| `Project_to_Invoice_Quick_Guide_EN.pdf`       |     5 | `3889e135efb831e574d6ff493965c471824f6b52524131849321c80918750c98` |
| `Digital_Workers.pdf`                         |     4 | `b4ce381db556d3b2e6c3ea11a2dfff5989c4a428c6f1781f3743b36fb0578fcc` |
| `Role_Workflows.pdf`                          |     3 | `f33a628be00c55b07725dc4173cec3c431522c11fec16f00441ba2fe9ecabb83` |

The extended Owner reference grew from 216 to 219 pages. Its six final invoice-annex page content streams and all six native PDF attachments match the pre-refresh baseline byte-for-byte; the combined Owner manual remains 276 pages with the same annexes and attachments. The role renderer reported zero missing images and zero page overflows for all eight courses. The Owner renderer reported zero missing images and zero overflows; all 12 final PDFs passed strict parsing and contained extractable text on every page. Cover and current-workflow pages were visually spot-checked from rendered PDFs at 1200-pixel scale for clipped text, figure placement and footer collisions.

Privacy and behavior checks passed with pinned Node 24: `scripts/bbs-role-manuals/privacy.test.mjs` (8/8 assertions), and the Help/catalog/download test set (4 files, 20 tests). The Owner PDF verifier passed strict reads, outline/page references, instruction text, image hashes, annex/attachment checks, and no-draft-mark checks on original final invoices. Current manual sources contain no credentials; training examples are identified as isolated and synthetic. The 25 historical PDF notice covers were checked separately: all original 327 body page streams and 256 annotations/internal destinations were preserved, with page counts unchanged.

Reproduce the current PDF checks after the builders listed in [manual renderer instructions](../../../../scripts/manuals-refresh/README.md):

```sh
/opt/jaautomation/runtime/node/bin/node --test scripts/bbs-role-manuals/privacy.test.mjs
/opt/jaautomation/runtime/node/bin/node node_modules/vitest/vitest.mjs run \
  apps/portal/src/lib/i18n/help-workflows.test.ts \
  tests/unit/astra-manual-catalog.test.ts \
  tests/unit/manual-download-retry.test.ts \
  tests/security/astra-manual-download.test.ts --no-file-parallelism
BBS_PDF_VERIFICATION_OUTPUT=docs/evidence/sota-ux-20261017/manuals/pdf-verification.json \
  /home/kripta/ja-manual-refresh-evidence-20261011/venv/bin/python scripts/bbs-role-manuals/verify.py
/home/kripta/ja-manual-refresh-evidence-20261011/venv/bin/python scripts/manuals-refresh/verify-current-artifacts.py
```

These checks operate on local repository files. They do not authenticate to production or mutate production records. No production credentials or screenshots are included in this evidence directory.
