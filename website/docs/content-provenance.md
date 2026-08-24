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

The homepage uses WebP derivatives of transparent PNG logos for the 12 companies named in the historical project archive. J&A Automation does not claim ownership of these trademarks or imply endorsement. The source PNGs remain in the repository for provenance and regeneration; they are not referenced by the public UI.

| Source PNG                                 | Source page                                                                      | Source PNG SHA-256                                                 | Derived WebP SHA-256                                               |
| ------------------------------------------ | -------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------ |
| `public/brand/clients/ambev.png`           | `https://blog.aevo.com.br/aevo-innovate-o-desafio-livre-de-plastico/ambev-logo/` | `88d6576dc3aeef4cf573d412f93ee9f96f4cbe711b44cc88cd706f6a7f5287ec` | `b59b0e66f0bee9c166d463f5f25008a005f525ac070a17957b79c779b93bbeaf` |
| `public/brand/clients/avon.png`            | `https://commons.wikimedia.org/wiki/File:Avon-logo.svg`                          | `2d7ce3a37ef856036cb5469c611bde01c795c48b38d78ab53083e769b7d88361` | `25d29486b23c742ea3c5cbd988d7cabe99b9502b8097db5ec2bab8e6f2e168dc` |
| `public/brand/clients/bmw.png`             | `https://commons.wikimedia.org/wiki/File:BMW.svg`                                | `ae083185ccd31e102d1eaa3f6b68fc3102d97cb8a3460bf26f8bc811c469ee6e` | `6280b8171d14adc79de5c981af818233d18ff42a9181f54e5838f8a50c1b92ba` |
| `public/brand/clients/campari.png`         | `https://www.pngplay.com/image/549182`                                           | `228c4af0f3be7df5d80a9f48a6297ef3fa45858bf3b5db0a9a86dcfb43a36ca3` | `243a3de29729cca250cbac49f440051467f1fb8daea4e1b04d43ba5debfdf272` |
| `public/brand/clients/coca-cola.png`       | `https://commons.wikimedia.org/wiki/File:Coca-Cola_logo.svg`                     | `50b26f2e2892b25a0f056dadd3041c64b512d626f584fb843255fa3a88d0bbad` | `be01a7528b5b98ff0d460863c65a5e9852270c6760fc2aaf12f805806fb52ec3` |
| `public/brand/clients/ford.png`            | `https://commons.wikimedia.org/wiki/File:Ford_Motor_Company_Logo.svg`            | `23488b0fbe5692ea67d89a748229a0a1c6329f92b28372f7d37e558ad18e8fc5` | `032f840d6cdcf7745be94f513362b94755194f5a17877430448dc6f5fe08db17` |
| `public/brand/clients/grupo-boticario.png` | `https://seeklogo.com/vector-logo/210899/grupo-boticario`                        | `7dcaf9c5edeac55b05672eebf3cb05470bd3f2d32b7e453939a8286ae380952c` | `42e8896afdf31a2c1a40e505f7bd65a7092b71742765b66b161de99e1e127639` |
| `public/brand/clients/heineken.png`        | `https://commons.wikimedia.org/wiki/File:Heineken_Logo.svg`                      | `04833ce73f99988997ad1c36a57d8440fcebae8bd05dfa8d581ca29245e26dad` | `1f6517f1d7ece3381fddfbc7b508e9e78da117b2c0e0346b8bf6ee27848add7f` |
| `public/brand/clients/mercedes-benz.png`   | `https://commons.wikimedia.org/wiki/File:Mercedes-Benz_Logo_2010.svg`            | `8c1653a92a2c33f86d9a3fb81c5e779ae9d1b96e6efb4783425d7e1ab2385b7f` | `aeec215fb99476081538fa7a16de042504c13ec8fac637c10fd424ab5128ad3f` |
| `public/brand/clients/petrobras.png`       | `https://commons.wikimedia.org/wiki/File:Petrobras_horizontal_logo.svg`          | `1c9adbbebac0ee450a1bc5ec8790accacf3d2f78beaa6fa6c4efc15d274069f1` | `f014912c26e987c44eb7520669ac0ffda2ba07039da7652743312db426be899a` |
| `public/brand/clients/sc-johnson.png`      | `https://en.logodownload.org/sc-johnson-logo/`                                   | `61839a51a214138457dcf102b2f137d1542597c84b72cf54560baf90e9f9c6f7` | `19bc1ea58268dd082df85b8caacb37c9fb5ea83763c42bf81f87fb7bb706364d` |
| `public/brand/clients/unilever.png`        | `https://toppng.com/show_download/463368/unilever-logo-vector`                   | `b1ee8fab9dfd7f530200283d15d4c41a98be099d5ad2cd473482c077394deb04` | `9501c47937848a1eb4a89bbd221cbe49d6768216996f4f750442c053381822fb` |

Downloaded on 2026-08-19. Wikimedia SVGs were rendered to PNG. The Grupo Boticário and Unilever source previews contained flat backgrounds; deterministic pixel processing removed those backgrounds without changing the logo shapes. Every final file has an alpha channel and at least one fully transparent pixel.

### Public raster WebP derivatives

The public UI references the following deterministic WebP derivatives. They are generated with `pnpm images:optimize` using Sharp 0.35, with photos capped at 1920px and logos capped at 640px. PNG and JPEG source files remain available for regeneration and are not referenced by the public UI.

| Derived asset                                        | Output profile                   | SHA-256                                                            |
| ---------------------------------------------------- | -------------------------------- | ------------------------------------------------------------------ |
| `public/images/hero/hero-robotics.webp`              | 1920px wide, quality 82          | `74e0791aa567eee90cf276769b9a3df6ea3a7b1f4d0fb572d125df488741843a` |
| `public/images/hero/hero-food-beverage.webp`         | 1920px wide, quality 82          | `f9ee1cad9f951332801fe27d0542dfe57f619cff82d27e7507675088eca38ef7` |
| `public/images/hero/hero-energy-process.webp`        | 1920px wide, quality 82          | `848d7060a181cdeb057b3a5e1696deded90bc2572cd2b515662c746766472aa6` |
| `public/images/industries/automotive-body-shop.webp` | 1920px wide, quality 82          | `081b3fc13e20cd1bea7450717f871d3a01d12d72208fde4a43cdf32bfd857ac9` |
| `public/images/industries/cosmetics-filling.webp`    | 1920px wide, quality 82          | `01f5fba51031704de79e069181aa50eefb9881aac6ff466389a78c1526e688af` |
| `public/images/industries/robotics-cell-square.webp` | 1920px wide, quality 82          | `72696c205bab2417ac1e8622a5634753115eb64387f93a70077bf0aa51f06965` |
| `public/images/capabilities/assembly-engines.webp`   | 1920px wide, quality 82          | `da05808c317b111bf75c4767029bc0832d8e1df451d56e0443002c9bacc688b9` |
| `public/brand/logo-jaautomation.webp`                | 640px max, quality 90            | `a33d9d7325330330b7512a61cb4e65853b0f6e4f8f75550b78231123b06376b8` |
| `public/brand/lines.webp`                            | Lossless-quality WebP, no resize | `a16241327ab40426475d958c54c4bb97abc950dbd81f15c2acd7ae8e75ebb1bc` |

## Team Data

Role-capability counts are as published by J&A Automation. They are not summed into a single employee count because roles may overlap.

## J&A Automation company mark

The supplied official PNG company mark remains unchanged for the portal shell and server-side
invoice/report PDF renderer. The public website uses the deterministic WebP derivative above; the
reporting package ships the original PNG bytes so generated PDFs do not depend on a browser or a
public URL.

| Local asset                                       | SHA-256                                                            |
| ------------------------------------------------- | ------------------------------------------------------------------ |
| `public/brand/logo-jaautomation.png`              | `26ede6564559b55c08f3f24fc061e58f18179085460428c9ef0205243cf91b57` |
| `packages/reporting/assets/logo-jaautomation.png` | `26ede6564559b55c08f3f24fc061e58f18179085460428c9ef0205243cf91b57` |

## Aquarex

Aquarex content is positioned at a high level. No recovery percentage, chemistry, membrane/filtration technology, flow rate, temperature, pressure, ROI, chemical savings, waste reduction, or certification claims have been invented.

## Image Rights

All supplied images are treated as approved production assets per the specification.
