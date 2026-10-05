# BBS role manuals · 6 October 2026

The role content contract is a JSON file per persona in `content/`:

```json
{
  "role": "worker",
  "title": "Worker · BBS field operations",
  "subtitle": "...",
  "chapters": [
    {
      "id": "time",
      "title": "Record actual hours",
      "route": "Time → Log time",
      "context": "Isolated BBS project · ...",
      "paragraphs": ["Plain text"],
      "steps": ["Plain text"],
      "checks": ["Plain text"],
      "recovery": ["Plain text"],
      "figures": [
        {
          "src": "docs/evidence/bbs-role-manuals-20261006/worker/screenshots/time.png",
          "caption": "Actual worker session · ...",
          "orientation": "landscape"
        }
      ]
    }
  ]
}
```

Use plain text, not HTML. Each procedural chapter explains prerequisites, exact controls, verification, recovery and handoff. Screenshots must come from the stated role, fictional BBS records, and actual application. No credentials or real private records. Native operational transitions happen only in the isolated runtime; financial/supplier records require explicitly scoped training fixtures. Browser manifests record actual outcomes and limitations. Reference procedures remain labelled as reference rather than tested.

Root owns renderer, shared introduction, catalog and integration. Workers own their persona JSON and evidence folders. Every guide distinguishes live portal links from isolated practice; no embedded live credentials.

Build from the repository root with Node 24 and Playwright Chromium:

```sh
python3 -m venv .venv-manuals
.venv-manuals/bin/pip install pypdf==6.19.0
node scripts/bbs-role-manuals/build.mjs
.venv-manuals/bin/python scripts/bbs-role-manuals/assemble-owner.py
.venv-manuals/bin/python scripts/bbs-role-manuals/verify.py
```

The Python steps require pypdf 6.19.0. Keep the virtual environment out of Git. The renderer measures text blocks, splits continuations, places each figure on a dedicated portrait or landscape page, checks missing images, geometry and every instruction block, and produces PDF/portable HTML/Markdown plus SHA-256 evidence. The Owner introduction is followed by the verified 203-page course; its original internal numbering restarts and its six native attachments and invoice annex are retained. Always rerun the renderer before Owner assembly; repeated assembly of an already combined file is rejected.

The eight role guides are English editions. Spanish and Portuguese Help interfaces advertise an English fallback; the historical translated guide families remain separate. No translation completeness is claimed for these new PDFs.
