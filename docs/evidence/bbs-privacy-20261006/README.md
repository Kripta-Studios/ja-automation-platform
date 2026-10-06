# Role-manual confidentiality revision · 6 October 2026

The previous non-Owner warnings named confidential business concepts, including client pricing, company costing and margins. A warning can itself disclose information. All eight current role manuals were rebuilt after reviewing their prose, tables, captions and screenshot references.

## Result

Business pricing comparisons, costing and margin explanations are confined to the Owner course. Operational courses describe work, plans, reports, own statements and receipts directly. Comparative compensation examples and broad My Pay captures were removed from operational guides. Finance and Auditor retain authorized invoice, collection, settlement and payment procedures without project costing or margin explanations. Existing historical artifacts were preserved unchanged in the Owner course.

The portal now delivers only reviewed role courses to non-Owner personas. Older mixed reference families, the Employee guide, the broad BBS invoice lab and all their legacy download aliases require Owner. English fallback uses the same authorization. Owner retains the historical reference library. This restriction concerns portal delivery; repository files and historical evidence are not protected by portal authorization. Application permissions for financial workspaces were not changed in this revision.

## Verification

- Independent read-only reviews passed for the five operational PDFs and the Finance/Auditor PDFs. Previously identified sensitive images were removed; replacement PM, Worker and Help captures came from the native authenticated isolated browser.
- Six privacy regression tests passed, covering warnings, cross-domain comparisons, personal tasks, sensitive screenshot references and Owner-only material.
- Twelve catalog/download unit tests passed. Portal typecheck, production build and scoped lint passed.
- [Strict PDF verification](pdf-verification.json) passed for all eight PDFs: instruction coverage, task bookmarks, image hashes, no blank pages, no Owner-only economics in non-Owner extracted text and no non-Owner attachments. The Owner's six native attachments and six invoice annex pages remain byte-identical to the original course.
- [Native Help verification](help/verification.json) passed in eight role sessions at 1440, 768, 390 and 360 pixels. Canonical downloads match the rebuilt PDFs. Each role was checked against all eight current IDs plus twelve Owner-only historical canonical/alias IDs; disallowed downloads return 404, anonymous downloads return 401. Spanish Help displays the English fallback.
- [Capture manifest](capture-manifest.json) identifies new role screenshots. The PM upload form was filled without a file or save/upload; the Worker Ready panel was read from an existing statement. No production business records were created for this revision.

Production publication and read-only artifact verification are recorded separately in the deployment receipt after cutover. These checks validate this confidentiality revision; they do not claim a fresh execution of every workflow in every manual.
