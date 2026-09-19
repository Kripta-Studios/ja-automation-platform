# Portal role guides

The active detailed sources are `Role_Guide_<persona>_EN.md` and
`Role_Guide_<persona>_PT-BR.md` for Worker, Project manager, Finance administrator,
Owner administrator, Read-only auditor, Supplier coordinator and External technician.
The older `Worker_User_Guide*.md` and `Owner_User_Guide*.md` remain as historical
sources from the previous edition; the current PDFs keep their familiar filenames
for existing Help links. The Employee field guide remains a separate quick guide
for ordinary Workers in EN, ES and PT-BR.

| Persona               | English PDF                                                       | Português (Brasil) PDF                                                         |
| --------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Worker                | [Worker guide](Worker_User_Guide.pdf)                             | [Guia do colaborador](Worker_User_Guide_PT-BR.pdf)                             |
| Project manager       | [Project manager guide](Project_Manager_User_Guide.pdf)           | [Guia do gerente de projetos](Project_Manager_User_Guide_PT-BR.pdf)            |
| Finance administrator | [Finance guide](Finance_User_Guide.pdf)                           | [Guia de administração financeira](Finance_User_Guide_PT-BR.pdf)               |
| Owner administrator   | [Owner guide](Owner_User_Guide.pdf)                               | [Guia do administrador proprietário](Owner_User_Guide_PT-BR.pdf)               |
| Read-only auditor     | [Auditor guide](Auditor_User_Guide.pdf)                           | [Guia do auditor](Auditor_User_Guide_PT-BR.pdf)                                |
| Supplier coordinator  | [Supplier coordinator guide](Supplier_Coordinator_User_Guide.pdf) | [Guia do coordenador de fornecedor](Supplier_Coordinator_User_Guide_PT-BR.pdf) |
| External technician   | [External technician guide](External_Technician_User_Guide.pdf)   | [Guia do técnico externo](External_Technician_User_Guide_PT-BR.pdf)            |

Signed-in users download only their authorized references through
[Help in the portal](https://j-aautomation.com/j-aautomation/app/help). Owner can
view the full role library for training. Worker also receives the short
[EN](Employee_Field_Guide_EN.pdf), [ES](Employee_Field_Guide_ES.pdf) and
[PT-BR](Employee_Field_Guide_PT-BR.pdf) field guides.

All illustrations are PNG screenshots taken through a real Chromium browser
against an isolated synthetic portal with a real signed-in account for each
persona and language. They are not drawn UI or production customer records.
`validation/current-capture.json` records capture time, source digest, route,
viewport and SHA-256 for every PNG. Both language builds reject a manifest that
does not match the current application source or whose screenshots fail their
integrity check. At least one fresh capture is required for each of the fourteen
persona-language combinations. The Spanish Worker quick guide uses explicitly
labelled English example screenshots; it does not claim an ES role capture.
Native date/time inputs in these unaltered Chromium screenshots may use the
browser or operating system's regional format even when the portal labels and
validation are in PT-BR.

After application code and translations are frozen, run from the repository root
with Node 24.19.0 and pnpm 11.22.0:

```bash
pnpm playwright test tests/e2e/manual-current-capture.spec.ts --project=desktop
node --experimental-strip-types scripts/generate-user-manuals.ts
node --experimental-strip-types scripts/generate-user-manuals.ts --locale=pt-BR
node --experimental-strip-types scripts/generate-client-ready-manuals.ts
```

The generator uses Playwright Chromium to render A4 tagged PDFs with an
English/Portuguese cover, contents, practical steps and captioned screenshots.
`manual-build.json` and `manual-build-PT-BR.json` retain source and output hashes.
`validation/pdf-quality.json` records checks for all 17 current PDFs against
those hashes, including page count, embedded fonts, images and extractable text.
Use `pdfinfo`, `pdffonts` and `pdftotext` to inspect page count, embedded fonts and
extractable text. The portal image copies only the catalogued PDFs; downloads
require a live session and a matching persisted role/supplier profile.
