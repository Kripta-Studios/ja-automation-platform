# Content Provenance — J&A Automation Website

## Source Material

All historical company, project, service, and team information on this website is derived from:

1. **The V2 Website Specification** (`J_A_AUTOMATION_MODERN_WEBSITE_SPEC.md`) — the primary design and content authority for this build.
2. **The existing public J&A Automation website** at `https://www.j-aautomation.com/en/`.
3. **Supplied production image and brand assets** — the original archive assets plus the
   client-approved 2026-08-27 logistics additions recorded below.

## Project Data

The historical project archive (approximately 40 records spanning 2007–2019) was migrated from the legacy website content export into typed TypeScript data structures (`content/projects.ts`).

### Important Notes

- The migrated historical archive largely stops at 2019. Three 2025–2026 project records were
  added from client-approved `new-ja-data` supplied on 2026-08-27; no other current projects are
  asserted.
- The content model is ready for new project entries to be added without restructuring.
- Project photography is treated as **sector/capability photography** unless specific project provenance is documented. No image is falsely captioned as depicting a named client project.
- Grammar and spelling corrections have been applied while preserving engineering meaning.

## Client Names

Client names (Amazon, Mercado Libre, Shopee, BMW, Ford, Mercedes-Benz, Coca-Cola, Heineken, Avon,
Petrobras, etc.) reflect published or client-approved project experience and do not imply current
vendor partnership or endorsement.

### Client logo assets

The homepage uses WebP derivatives of transparent PNG logos for the companies named in the historical
project archive and the approved 2026-08-27 additions. J&A Automation does not claim ownership of
these trademarks or imply endorsement. The source PNGs remain in the repository for provenance and
regeneration; they are not referenced by the public UI.

| Source PNG                                 | Source page                                                                      | Source PNG SHA-256                                                 | Derived WebP SHA-256                                               |
| ------------------------------------------ | -------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------ |
| `public/brand/clients/ambev.png`           | `https://blog.aevo.com.br/aevo-innovate-o-desafio-livre-de-plastico/ambev-logo/` | `88d6576dc3aeef4cf573d412f93ee9f96f4cbe711b44cc88cd706f6a7f5287ec` | `b59b0e66f0bee9c166d463f5f25008a005f525ac070a17957b79c779b93bbeaf` |
| `public/brand/clients/avon.png`            | `https://commons.wikimedia.org/wiki/File:Avon-logo.svg`                          | `2d7ce3a37ef856036cb5469c611bde01c795c48b38d78ab53083e769b7d88361` | `25d29486b23c742ea3c5cbd988d7cabe99b9502b8097db5ec2bab8e6f2e168dc` |
| `public/brand/clients/bmw.png`             | `https://commons.wikimedia.org/wiki/File:BMW.svg`                                | `ae083185ccd31e102d1eaa3f6b68fc3102d97cb8a3460bf26f8bc811c469ee6e` | `6280b8171d14adc79de5c981af818233d18ff42a9181f54e5838f8a50c1b92ba` |
| `public/brand/clients/campari.png`         | `https://www.pngplay.com/image/549182`                                           | `228c4af0f3be7df5d80a9f48a6297ef3fa45858bf3b5db0a9a86dcfb43a36ca3` | `243a3de29729cca250cbac49f440051467f1fb8daea4e1b04d43ba5debfdf272` |
| `public/brand/clients/coca-cola.png`       | `https://commons.wikimedia.org/wiki/File:Coca-Cola_logo.svg`                     | `50b26f2e2892b25a0f056dadd3041c64b512d626f584fb843255fa3a88d0bbad` | `be01a7528b5b98ff0d460863c65a5e9852270c6760fc2aaf12f805806fb52ec3` |
| `public/brand/clients/ford.png`            | `https://commons.wikimedia.org/wiki/File:Ford_Motor_Company_Logo.svg`            | `23488b0fbe5692ea67d89a748229a0a1c6329f92b28372f7d37e558ad18e8fc5` | `032f840d6cdcf7745be94f513362b94755194f5a17877430448dc6f5fe08db17` |
| `public/brand/clients/grupo-boticario.png` | `https://seeklogo.com/vector-logo/210899/grupo-boticario`                        | `7dcaf9c5edeac55b05672eebf3cb05470bd3f2d32b7e453939a8286ae380952c` | `dc05cd474de3bbcfc297f11877562dcc048a303ccecd565491fb2b8578c5465d` |
| `public/brand/clients/heineken.png`        | `https://commons.wikimedia.org/wiki/File:Heineken_Logo.svg`                      | `04833ce73f99988997ad1c36a57d8440fcebae8bd05dfa8d581ca29245e26dad` | `1f6517f1d7ece3381fddfbc7b508e9e78da117b2c0e0346b8bf6ee27848add7f` |
| `public/brand/clients/mercedes-benz.png`   | `https://commons.wikimedia.org/wiki/File:Mercedes-Benz_Logo_2010.svg`            | `8c1653a92a2c33f86d9a3fb81c5e779ae9d1b96e6efb4783425d7e1ab2385b7f` | `aeec215fb99476081538fa7a16de042504c13ec8fac637c10fd424ab5128ad3f` |
| `public/brand/clients/petrobras.png`       | `https://commons.wikimedia.org/wiki/File:Petrobras_horizontal_logo.svg`          | `1c9adbbebac0ee450a1bc5ec8790accacf3d2f78beaa6fa6c4efc15d274069f1` | `f014912c26e987c44eb7520669ac0ffda2ba07039da7652743312db426be899a` |
| `public/brand/clients/sc-johnson.png`      | `https://en.logodownload.org/sc-johnson-logo/`                                   | `61839a51a214138457dcf102b2f137d1542597c84b72cf54560baf90e9f9c6f7` | `19bc1ea58268dd082df85b8caacb37c9fb5ea83763c42bf81f87fb7bb706364d` |
| `public/brand/clients/unilever.png`        | `https://toppng.com/show_download/463368/unilever-logo-vector`                   | `b1ee8fab9dfd7f530200283d15d4c41a98be099d5ad2cd473482c077394deb04` | `9ca41fa42af466d209e4832f14e28dc1ddcbe180ed8ca8748ad50beba11b7984` |

Downloaded on 2026-08-19. Wikimedia SVGs were rendered to PNG. The Grupo Boticário and Unilever source previews contained flat backgrounds; deterministic pixel processing removed those backgrounds without changing the logo shapes. Every final file has an alpha channel and at least one fully transparent pixel.

### Approved 2026-08-27 logistics additions

The following three project records and four visual assets were supplied and approved for this
website packet on 2026-08-27. The project copy is stored under `source: 'new-ja-data'`; it is not
represented as part of the migrated legacy archive. The client marks and the warehouse photograph
were supplied as production assets without an external attribution URL in the repository. The
warehouse photograph is representative sector photography and is not captioned as a photograph of
any named client project.

| Item                                               | Asset role                                               | Source SHA-256                                                     | Derived WebP SHA-256                                               |
| -------------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------ |
| `public/brand/clients/amazon.png`                  | Amazon client mark, 640×193                              | `f2fc212a44188f7e0e2cd2a55d839bc396b4020171f0c6eac7eac954ef1c3a7e` | `bc4e3e898554152f634659431629a813159cc69d5bb6b66ea196ad20d441ffa4` |
| `public/brand/clients/mercado-libre.png`           | Mercado Libre client mark, 640×266                       | `c998ce722147ae8c047b70db428db959b6f868b49a42a6725399b4f4fd9791ef` | `c7350168b210d38c988491aba99819341bf8103fc11b63f9cb3bd863ae6e983f` |
| `public/brand/clients/shopee.png`                  | Shopee client mark, 450×640                              | `f808241761847a7a85fc4cc7848f91a7dd903b68fca88cd3ec707e90ac03b7d8` | `96065ef4049b3bafc4ff2e2537b4ff080565f05bd0557498e6d1a73855497839` |
| `public/images/industries/warehouse-logistics.jpg` | Representative warehouse/logistics photography, 1376×768 | `c0566ab1e8947602ac8d4fbda6a7efdb9b2660167eda66c955291f3a7dfe5714` | `f9dab02954520d68e300727d15b25260a763e81d4227d2f2843e64b8d0915195` |

All four additions are included in `scripts/optimize-website-images.mjs`. Sharp 0.35.3 keeps their
source dimensions because `withoutEnlargement: true` is explicit for both photo and logo profiles.
All 15 client-logo PNG/WebP pairs have an alpha channel and at least one fully transparent pixel;
the public UI references only the WebP derivatives.

### Public raster WebP derivatives

The public UI references the following deterministic WebP derivatives. They are generated with
`pnpm images:optimize` using Sharp 0.35.3, with photos capped at 1920px and logos capped at 640px;
`withoutEnlargement: true` preserves smaller source dimensions. PNG and JPEG source files remain
available for regeneration and are not referenced by the public UI.

| Derived asset                                        | Output profile                   | SHA-256                                                            |
| ---------------------------------------------------- | -------------------------------- | ------------------------------------------------------------------ |
| `public/images/hero/hero-robotics.webp`              | 1900×900, quality 82             | `bd351303738b074dda11aa318660b831b6734b157ba28a4ae69b19de47477c86` |
| `public/images/hero/hero-food-beverage.webp`         | 1900×900, quality 82             | `a6aeee393b551775a169e4975effbc27eca4b04be728932483000fa03ac364f9` |
| `public/images/hero/hero-energy-process.webp`        | 1234×800, quality 82             | `3ee3feee376d16fbe1dad0279b9ef02c70475bb40a35bc61d32717753c49f446` |
| `public/images/industries/automotive-body-shop.webp` | 1900×900, quality 82             | `d11ddc27ea6f263258bb2fe280840c42377b3779a3a95e99e1d8597ec9af4f95` |
| `public/images/industries/cosmetics-filling.webp`    | 1234×800, quality 82             | `10a4676ee312a88f6ba69a751dd19e588f535da8b22b63d6d4f92e2bc3c7edc1` |
| `public/images/industries/robotics-cell-square.webp` | 1000×1000, quality 82            | `0aa3038cf107591fabe5916823211d0b11368839d1558cca38c3983676e048de` |
| `public/images/industries/warehouse-logistics.webp`  | 1376×768, quality 82             | `f9dab02954520d68e300727d15b25260a763e81d4227d2f2843e64b8d0915195` |
| `public/images/capabilities/assembly-engines.webp`   | 1900×900, quality 82             | `b93dd458876b0df98b6c50882d0d716aa1766bdec734316eab64cfce0d7f9ceb` |
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

All supplied images are treated as approved production assets per the specification and the
2026-08-27 website packet. The three added client marks and the representative warehouse image have
no external attribution URL embedded in this repository; their source/derived hashes above are the
integrity record for the approved files.
