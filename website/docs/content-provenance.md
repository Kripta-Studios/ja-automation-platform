# Content Provenance — J&A Automation Website

## Source Material

All historical company, project, service, and team information on this website is derived from:

1. **The V2 Website Specification** (`J_A_AUTOMATION_MODERN_WEBSITE_SPEC.md`) — the primary design and content authority for this build.
2. **The existing public J&A Automation website** at `https://www.j-aautomation.com/en/`.
3. **Supplied production image and brand assets** — 12 files treated as approved production assets.

## Project Data

The historical project archive (approximately 40 records spanning 2007–2019) was migrated from the legacy website content export into typed TypeScript data structures (`content/projects.ts`).

### Important Notes

- Project records largely stop at 2019. No 2020–2026 projects have been fabricated.
- The content model is ready for new project entries to be added without restructuring.
- Project photography is treated as **sector/capability photography** unless specific project provenance is documented. No image is falsely captioned as depicting a named client project.
- Grammar and spelling corrections have been applied while preserving engineering meaning.

## Client Names

Client names (BMW, Ford, Mercedes-Benz, Coca-Cola, Heineken, Avon, Petrobras, etc.) reflect published project experience and do not imply current vendor partnership or endorsement.

### Client logo assets

The homepage uses transparent PNG logos for the 12 companies named in the historical project archive. J&A Automation does not claim ownership of these trademarks or imply endorsement.

| Local asset                                | Source page                                                                      | SHA-256                                                            |
| ------------------------------------------ | -------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `public/brand/clients/ambev.png`           | `https://blog.aevo.com.br/aevo-innovate-o-desafio-livre-de-plastico/ambev-logo/` | `88d6576dc3aeef4cf573d412f93ee9f96f4cbe711b44cc88cd706f6a7f5287ec` |
| `public/brand/clients/avon.png`            | `https://commons.wikimedia.org/wiki/File:Avon-logo.svg`                          | `2d7ce3a37ef856036cb5469c611bde01c795c48b38d78ab53083e769b7d88361` |
| `public/brand/clients/bmw.png`             | `https://commons.wikimedia.org/wiki/File:BMW.svg`                                | `ae083185ccd31e102d1eaa3f6b68fc3102d97cb8a3460bf26f8bc811c469ee6e` |
| `public/brand/clients/campari.png`         | `https://www.pngplay.com/image/549182`                                           | `228c4af0f3be7df5d80a9f48a6297ef3fa45858bf3b5db0a9a86dcfb43a36ca3` |
| `public/brand/clients/coca-cola.png`       | `https://commons.wikimedia.org/wiki/File:Coca-Cola_logo.svg`                     | `50b26f2e2892b25a0f056dadd3041c64b512d626f584fb843255fa3a88d0bbad` |
| `public/brand/clients/ford.png`            | `https://commons.wikimedia.org/wiki/File:Ford_Motor_Company_Logo.svg`            | `23488b0fbe5692ea67d89a748229a0a1c6329f92b28372f7d37e558ad18e8fc5` |
| `public/brand/clients/grupo-boticario.png` | `https://seeklogo.com/vector-logo/210899/grupo-boticario`                        | `7dcaf9c5edeac55b05672eebf3cb05470bd3f2d32b7e453939a8286ae380952c` |
| `public/brand/clients/heineken.png`        | `https://commons.wikimedia.org/wiki/File:Heineken_Logo.svg`                      | `04833ce73f99988997ad1c36a57d8440fcebae8bd05dfa8d581ca29245e26dad` |
| `public/brand/clients/mercedes-benz.png`   | `https://commons.wikimedia.org/wiki/File:Mercedes-Benz_Logo_2010.svg`            | `8c1653a92a2c33f86d9a3fb81c5e779ae9d1b96e6efb4783425d7e1ab2385b7f` |
| `public/brand/clients/petrobras.png`       | `https://commons.wikimedia.org/wiki/File:Petrobras_horizontal_logo.svg`          | `1c9adbbebac0ee450a1bc5ec8790accacf3d2f78beaa6fa6c4efc15d274069f1` |
| `public/brand/clients/sc-johnson.png`      | `https://en.logodownload.org/sc-johnson-logo/`                                   | `61839a51a214138457dcf102b2f137d1542597c84b72cf54560baf90e9f9c6f7` |
| `public/brand/clients/unilever.png`        | `https://toppng.com/show_download/463368/unilever-logo-vector`                   | `b1ee8fab9dfd7f530200283d15d4c41a98be099d5ad2cd473482c077394deb04` |

Downloaded on 2026-08-19. Wikimedia SVGs were rendered to PNG. The Grupo Boticário and Unilever source previews contained flat backgrounds; deterministic pixel processing removed those backgrounds without changing the logo shapes. Every final file has an alpha channel and at least one fully transparent pixel.

## Team Data

Role-capability counts are as published by J&A Automation. They are not summed into a single employee count because roles may overlap.

## Aquarex

Aquarex content is positioned at a high level. No recovery percentage, chemistry, membrane/filtration technology, flow rate, temperature, pressure, ROI, chemical savings, waste reduction, or certification claims have been invented.

## Image Rights

All supplied images are treated as approved production assets per the specification.
