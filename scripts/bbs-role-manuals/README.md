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

Business pricing comparisons, costing and margin explanations belong only in the Owner course. A warning that names those concepts is itself a disclosure. Non-Owner instructions explain the role's own task and intended audience directly. `privacy.mjs` checks all source prose, tables and captions and rejects previously reviewed sensitive figures before rendering; `privacy.test.mjs` covers warnings, comparisons and screenshot regressions. PDF verification checks extracted text and attachments as well. Visually inspect new screenshots; text checks cannot read their pixels. The Help catalog serves only the reviewed role courses to non-Owner personas. Older mixed reference families and their aliases are Owner-only archives in the portal.

Build from the repository root with Node 24 and Playwright Chromium:

```sh
python3 -m venv .venv-manuals
.venv-manuals/bin/pip install pypdf==6.19.0
node scripts/bbs-role-manuals/build.mjs
.venv-manuals/bin/python scripts/bbs-role-manuals/assemble-owner.py
.venv-manuals/bin/python scripts/bbs-role-manuals/verify.py
```

The Python steps require pypdf 6.19.0. Keep the virtual environment out of Git. The renderer measures text blocks, splits continuations, places each figure on a dedicated portrait or landscape page, checks missing images, geometry and every instruction block, and produces PDF/portable HTML/Markdown plus SHA-256 evidence. The Owner introduction and course are integrated under one master task contents and continuous reading-page numbers. Original dataset context labels are preserved on imported pages. All eight PDFs receive task bookmarks; the Owner keeps its six native attachments and six unchanged invoice annex pages, whose native pagination remains separate. Always rerun the renderer before Owner assembly; repeated assembly of an already combined file is rejected.

The eight role guides are English editions. Spanish and Portuguese Help interfaces advertise an English fallback; the historical translated guide families remain separate. No translation completeness is claimed for these new PDFs.

The assignment/crew supplement uses `docs/evidence/bbs-planning-20261006/`. It inserts operational chapters next to their related procedures, including dated expected schedules, own/delegated actual hours, PM review, supplier coverage and the goals capability boundary. Owner/PM/Worker figures reused across roles must be cropped to operational data before rendering. Source JSON is authoritative; regenerate all outputs after changing content or an image.

`verify-help.mjs` accepts the isolated loopback runtimes on ports 5179 and 5180. Set `BBS_ROLE_QA_ORIGIN` and `BBS_ROLE_QA_PRIVATE_ROOT` to the matching private training sessions; port 5180 writes the assignment supplement evidence. It verifies role-specific Help libraries, authenticated native downloads, denied role downloads, canonical PDF hashes and responsive layouts. Production publication is a separate read-only check and must not reuse synthetic training cookies.
