# BBS Owner manual build

The builder preserves the worked BBS chapters and extends them with Owner operating procedures. Source scripts and selected screenshot/XLSX/final invoice assets are committed; no database, credentials or cookie jar is required to rebuild the guide.

From the repository root, with the repository Playwright installation and Python dependencies available:

```sh
python -m pip install -r scripts/bbs-owner-manual/requirements.txt
python scripts/bbs-owner-manual/build.py
node scripts/bbs-owner-manual/render.mjs
python scripts/bbs-owner-manual/assemble.py
```

Output is `docs/manuals/BBS_Project_to_Client_Invoices_Guide_EN.{pdf,html,md}`. The browser layout report rejects missing images and content extending into page footers. PDF assembly checks exact page counts, numbers, final invoice numbers/totals, absence of draft marks on all final annex pages, and byte-identical embedded/downloaded originals. Appendix content streams are preserved. The two baseline XLSX files show the pre-issue state; any after-lifecycle snapshot is a separately labeled attachment.

To rebuild read-only workbook previews, run `python scripts/bbs-owner-manual/render-workbook-previews.py`, then `node scripts/bbs-owner-manual/render-workbooks.mjs`, before the main build. Values come from native XLSX OpenXML cells, not re-entered examples; browser previews are expressly not Microsoft Excel screenshots.

`original-chapters.py` contains preserved original chapter content, consumed as AST data by the builder. `owner-operating-chapters.py` and `worker-and-export-chapters.py` contain extensions. `editorial-chapters.py` orders the course, labels historical/isolated/reference contexts and adds bounded reference calculations. `financial-completion-chapters.py` records separate synthetic dispatch, correction, weekly closure and Accounting exercises. The Markdown companion includes the complete authored course with its HTML tables and original image paths. `bbs-example-artifacts` contains fictional original workbooks and genuinely application-issued final PDFs from an isolated training database. Synthetic approval/payment data proves training application behavior only. It does not establish real accountant approval, customer signature, email delivery or bank transfer.

Browser evidence lives in `docs/evidence/bbs-owner-completion-20261005`. New account/correction/reporting examples use a separate BBS onboarding lab. The guide labels source-checked broader workflows separately from tested browser journeys. No blanket claim of universal Owner coverage is made.
