# Production deployment — supplier workforce — 2026-09-09

The supplier workforce feature and Portuguese/English manuals were pushed to GitHub and activated
in production. The Owner appoints coordinators per installation; coordinators add technician
personnel records and submit actual hours; restricted accounts retain operational reports without
financial access. New technician records do not automatically create login credentials.

## Released artifacts

- Feature commit: `c6a61791f729b7f9a9b3fdbb6496fe3cedf527d4`.
- Compatible recovery baseline: `6480e6326e1d1416270e6b6b51f64e16b93dc6ef`.
- Branch: `codex/v3-production-completion-orchestrated-20260819`.
- Feature archive SHA-256: `79ce1b6007a8456125d0283dc38ac73d921a00297071f5791dab0512acf83ee8`.
- Baseline archive SHA-256: `57674ace6c1a4ce89c01b00eaaaf62fdf506ee40eb187fa5f10b31a4c31c7c1f`.
- Active release: `/opt/jaautomation/releases/ja-automation-79ce1b6007a8456125d0283dc38ac73d921a00297071f5791dab0512acf83ee8`.
- Portal image: `sha256:e9d66864f9fb317db4dca294a0ff9ec5b5bf269ba206b48e29848471d54ca2f8`.
- Site image: `sha256:3f647f6e2832e84bf5f13050f8836fe7899e425740bbb9a03f1b497b4e2fc7c0`.
- Source digest used by the manual captures: `6e2c2aa09be5e12756912c1f37b064f7934a6730660807badf9a804e128bb19e`.

## Activation and recovery

Baseline activation completed at 17:06:55 CEST; feature activation completed at 17:08:37 CEST.
An outer Caddy maintenance gate protected the initial schema upgrade, and the original Caddyfile
was restored byte-for-byte afterward. ZIP deployment watchers were paused during activation and
both the path and timer were restarted. Jobs and backup timers are active.

The first build attempt selected a different Docker builder and was canceled before backup or
application activation. The helper was restarted with the classic builder. Baseline extraction
permissions differed from the prebuild and required rebuilding; the feature archive was extracted
with matching prebuild permissions and every archive file was verified byte-for-byte. Its build
reused the tested image layers. The deployed portal filesystem layers exactly equal those of the
image tested with real synthetic authentication; Compose adds only its builder label.

The retained schema-42 baseline denies supplier-profile application requests with HTTP 503, so a
code rollback cannot expose financial data through the previous application. Schema-41 code must
only be restored together with the pre-upgrade database and private artifacts while writers are
stopped. Both complete deployment backups were checked against their database and document hashes:

- `/var/backups/jaautomation/2026-09-09T150640834Z-506264ad-c641-4b0c-ab43-96776b473f2f`: database SHA-256 `33adbb121914895c5814c5bb357714a45a570d74053b615c99bd3a7ce8e38949`, 29 private documents, all hashes verified.
- `/var/backups/jaautomation/2026-09-09T150819289Z-5a83a23e-b446-4035-8f43-e788912a19e3`: database SHA-256 `d4cdd7c32a605e3136730e07745235c1bf35475fd4b84821ad18d839dde9dd8d`, 29 private documents, all hashes verified.

## Verification

- Production schema 42; SQLite integrity `ok`; zero foreign-key errors.
- Portal and site containers healthy; jobs container running with successful `jobs.cycle` records.
- `deployment/scripts/verify-vps.sh` passed after both activations, including public login/site,
  local readiness, service-actor configuration and unsigned outbox rejection with HTTP 401.
- Final focused suite: 49 tests in 4 files; workspace typecheck and ESLint passed.
- Broad suite: 1,388 tests in 203 files passed before the final bounded authorization correction;
  the final focused regression suite verifies that correction separately.
- Authenticated Owner/coordinator/external-technician workflows passed at 360, 390, 768 and 1440 px.
  Final-source desktop manual capture and supplier workflow both passed. Tests cover approval,
  actual PDF/CSV generation, isolation, financial denials and live installation revocation.
- An isolated Docker production-copy probe authenticated a synthetic Worker, verified operational
  time HTTP 200 and financial routes HTTP 403 for both restricted profiles, and kept production
  users and records untouched. The deployed image has the same filesystem as this tested image.
- Fresh independent review returned `ship`; the parent verified no repository/artifact mutations
  across the behaviorally read-only review. The host did not enforce read-only isolation.

The production database still contains four historical failed localized-PDF variants and three
historical dead-letter jobs, visible before this feature activation. This receipt does not classify
those historical records as repaired or claim every preexisting application issue is resolved.

## Manuals to share

| Recipient | English | Portuguese | Pages |
|---|---|---|---|
| Owner / Antonny | [Owner guide](manuals/Owner_User_Guide.pdf) | [Guia do Owner](manuals/Owner_User_Guide_PT-BR.pdf) | 17 each |
| Workers / supplier coordinator | [Worker guide](manuals/Worker_User_Guide.pdf) | [Guia do trabalhador](manuals/Worker_User_Guide_PT-BR.pdf) | 12 each |
| Field quick reference | [Field guide](manuals/Employee_Field_Guide_EN.pdf) | [Guia de campo](manuals/Employee_Field_Guide_PT-BR.pdf) | 6 each |

The Spanish field guide is also retained. All seven PDFs were regenerated from authenticated
synthetic captures, checked by text extraction and representative visual rendering, and matched
by SHA-256 against both the released archive and the running production portal:

| PDF | SHA-256 |
|---|---|
| `Employee_Field_Guide_EN.pdf` | `d119e5e85dc20f0cee1ad83793365e9d6c4e100e879809d0704eac2b91bd74d3` |
| `Employee_Field_Guide_ES.pdf` | `b95da16cb2a9785c1acee707935a395fa6f84912b333aa9dd399da96aa43a560` |
| `Employee_Field_Guide_PT-BR.pdf` | `19331759230cc9545115e87b3f535dd961cff9ffc77e1a38613636386295151e` |
| `Owner_User_Guide.pdf` | `f2d495a296e7ff19fa60edb686c98af285b70fac3de0a69326ab9b2d638719d5` |
| `Owner_User_Guide_PT-BR.pdf` | `c00ecfeadb79d8eb21695b467d50442e23d2e471453e63fa8080b027cb985a27` |
| `Worker_User_Guide.pdf` | `cfdf7a6170bf93f410f50e8f198636d8f76557fd360aebcc232ee3f806bd0c43` |
| `Worker_User_Guide_PT-BR.pdf` | `9f32129333fdb3f76951ec66ff59d2358b160490dd70385fc6d414b2bd43a7fb` |

## Storage cleanup

Canceled builder cache cleanup reported 2.206 GB reclaimed. After deployment, obsolete preflight
image tags and dangling images were removed; dangling-image cleanup reported another 4.328 GB.
Completed isolated production-copy fixtures and temporary build directories were removed.
The filesystem available-space increase measured across the final cleanup was
23,165,272,064 bytes (21.57 GiB), leaving 27.84 GiB available.
Current production images, the actual schema-42 rollback images, pre-upgrade rollback images,
both complete deployment backups, production files/database and Navidrome were retained.
