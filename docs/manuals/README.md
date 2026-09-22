# Portal manuals

Three shared manuals cover the seven operational profiles. Each opens with a role-specific
reading path and links to its chapters. Every procedure identifies who may consult, create,
approve or modify a record; every screenshot identifies the signed-in profile. Reading another
role's procedure does not grant its permissions or access to its records.

| Manual                            | Profiles                                        | English                                          | Português (Brasil)                                   |
| --------------------------------- | ----------------------------------------------- | ------------------------------------------------ | ---------------------------------------------------- |
| Work and projects                 | Worker, Project manager                         | [Download PDF](Work_Projects_Guide.pdf)          | [Baixar PDF](Work_Projects_Guide_PT-BR.pdf)          |
| Supplier operations               | Supplier coordinator, External technician       | [Download PDF](Supplier_Operations_Guide.pdf)    | [Baixar PDF](Supplier_Operations_Guide_PT-BR.pdf)    |
| Administration, finance and audit | Owner, Finance administrator, Read-only auditor | [Download PDF](Administration_Finance_Guide.pdf) | [Baixar PDF](Administration_Finance_Guide_PT-BR.pdf) |

Download the appropriate manual from [Help in the portal](https://j-aautomation.com/j-aautomation/app/help).
Help shows the reading path for the signed-in profile. Owner can open all three manuals for
training. The internal Worker also has the separate quick guide in
[EN](Employee_Field_Guide_EN.pdf), [ES](Employee_Field_Guide_ES.pdf) and
[PT-BR](Employee_Field_Guide_PT-BR.pdf).

The seven previous portal download links still resolve to their shared manual. Access is checked
against the current persisted profile and live session. Supplier profiles retain their own
family even though the underlying account role is Worker. Sharing a manual does not change the
application's financial, project, supplier or personal-data permissions.

## Example exports

[Browse the complete synthetic export collection](examples/README.md) or
[download all examples as a ZIP](examples/all-examples.zip). The collection includes
native PDF, XLSX, CSV, JSON and project-closeout ZIP exports, plus separately labelled
browser print examples in English, Spanish and Brazilian Portuguese. Extract the ZIP
and open `index.html` for a searchable preview gallery. These files contain fictional
data and do not grant access to private application records.

## Sources and illustrations

The active detailed sources are `Functional_Guide_<family>_EN.md` and
`Functional_Guide_<family>_PT-BR.md`, where family is `work-projects`, `supplier-operations` or
`administration-finance`. The earlier individual role sources and PDFs remain historical
editions in this repository; they are neither listed in Help nor copied into the portal image.

Illustrations are unaltered PNG screenshots taken through real Chromium against the running
application with authenticated synthetic accounts. They contain no production customer records.
`validation/current-capture.json` binds every persona, locale, route, viewport and PNG hash to the
runtime source digest. The grouped manuals place relevant screenshots beside their instructions, including the refreshed public website and its portal entry point. The 2026-09-22 edition includes expandable secondary panels, focused filters and task selectors, with embedded Geist typography.
Their captions name the profile actually used, including when the same manual serves several roles.

The Spanish quick guide uses explicitly labelled English example screenshots. Native date/time
inputs may use the browser or operating system's regional format even when portal labels and
validation are in Brazilian Portuguese.

## Regenerate and verify

Freeze the application code and translations first, then run from the repository root with
Node 24.19.0 and pnpm 11.22.0:

```bash
pnpm exec playwright test tests/e2e/manual-current-capture.spec.ts --project=desktop
node --experimental-strip-types scripts/generate-user-manuals.ts
node --experimental-strip-types scripts/generate-user-manuals.ts --locale=pt-BR
node --experimental-strip-types scripts/generate-client-ready-manuals.ts
```

The generator rejects stale runtime digests, PNG hash mismatches, broken chapter links,
screenshots outside a manual's family and missing representation of a family member. Partial
builds retain an existing output only if its runtime digest, exact capture manifest, current
Markdown and PDF hashes still match. Always complete all three generation commands for a release.

The output is **six main PDFs plus three quick guides**. The A4 PDFs contain linked contents,
role routes on the cover, tagged text, outlines and embedded screenshots. `manual-build.json`
and `manual-build-PT-BR.json` record source, output and capture hashes; `validation/pdf-quality.json`
records PDF quality checks. Inspect pages, embedded fonts, images and extractable text with
`pdfinfo`, `pdffonts`, `pdfimages` and `pdftotext`, and visually review the final pages.

Docker copies only these nine catalogued assets. The earlier individual PDFs are historical
references, not additional downloads or permissions.
