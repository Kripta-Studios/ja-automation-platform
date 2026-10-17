# Current manual renderers

Current PDF rendering uses the repository Playwright installation and a shared launcher. Set `JA_MANUAL_CHROMIUM_EXECUTABLE_PATH` to pin a system Chromium when a downloaded Playwright browser is unavailable. The Owner reference and eight role courses must be rebuilt in the order documented in `scripts/bbs-role-manuals/README.md` so the Owner course and its combined role PDF share the same current chapters.

`docs/manuals/render-current-guide.mjs <name>` converts a current Markdown companion to HTML and PDF. `scripts/manuals-refresh/render-html-guide.mjs <name>` renders a maintained HTML guide to PDF, verifies image decoding and reports page count, byte size and SHA-256. For example:

```sh
export JA_MANUAL_CHROMIUM_EXECUTABLE_PATH=/path/to/chrome # optional
node docs/manuals/render-current-guide.mjs Project_to_Invoice_Quick_Guide_EN
node docs/manuals/render-current-guide.mjs Digital_Workers
node scripts/manuals-refresh/render-html-guide.mjs Role_Workflows
```

These renderers are local and read-only with respect to portal data. They do not capture authenticated application screenshots or alter historical PDF evidence.

Run `python scripts/manuals-refresh/verify-current-artifacts.py` after the current builders to strict-read all 12 current PDFs, confirm every page has extractable text, record page counts and SHA-256 values, and compare the Owner reference’s six final invoice-annex page streams and six native attachments with `docs/evidence/sota-ux-20261017/manuals/owner-baseline.json`. The result is `current-artifacts.json` beside the baseline and PDF verifier report.
