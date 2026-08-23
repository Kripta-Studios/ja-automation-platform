# Portal and Report Internationalization Design

**Date:** 2026-08-22  
**Status:** Awaiting implementation approval  
**Locales:** English (`en`), Spanish (`es`), Brazilian Portuguese (`pt-BR`, stored internally as `pt` for compatibility)

## Objective

Provide complete, consistent internationalization across the authenticated portal and all report PDFs. Selecting a language must update navigation, forms, statuses, validation feedback, standalone detail pages, print views, and newly generated PDF artifacts without translating user-entered business content.

## Scope

### Portal UI

- Replace reliance on exact DOM text matching with an explicit typed translation catalog.
- Cover PortalChrome, PortalShell, extracted sections, login, MFA, invitations, and all standalone detail pages.
- Translate labels, headings, help text, buttons, placeholders, ARIA labels, empty states, controlled statuses, roles, categories, record types, and action feedback.
- Preserve names, project/client content, comments, descriptions, invoice numbers, identifiers, currencies, and technical product terms such as PLC, HMI, SCADA, FAT, SAT, MFA, TOTP, PDF, XLSX, CSV, and JSON.
- Set `document.documentElement.lang` to `en`, `es`, or `pt-BR` immediately and avoid an English hydration flash.
- Persist the user selection and propagate it to standalone pages and report-generation controls.

### Server feedback

- Replace user-facing English response messages with stable message keys and interpolation parameters.
- Localize messages at the portal boundary using the current locale.
- Keep logs, audit event codes, domain errors, and stored business values language-neutral.

### PDF reports

- Support explicit generation in English, Spanish, and Brazilian Portuguese for invoice, period report, Accounting Pack, daily field report, and PLC/technical report PDFs.
- Localize titles, controlled labels, metric names, statuses, dates, number formatting, and financial basis descriptions.
- Preserve source-record free text exactly as entered.
- Use full document language tags: `en-US`, `es-ES`, and `pt-BR`.
- Default report language to the active portal locale while keeping an explicit selector.

## Immutable artifact model

PDF language variants must coexist. Generating one language may not overwrite or invalidate another language or a previously issued/finalized artifact.

Each variant is identified by:

```text
business artifact id + artifact type + locale + template version + snapshot hash
```

The persistence contract will store, at minimum:

- owning report, invoice, or Accounting Pack identifier;
- normalized locale (`en`, `es`, `pt`);
- template version;
- source snapshot hash;
- storage key, SHA-256 hash, byte length, lifecycle state, error detail, and timestamps.

Storage keys and semantic filenames include locale and template version. Downloads authorize the owning business artifact first and then resolve one ready language variant. Failed or queued variants never masquerade as ready, and one failed locale does not affect another.

Issued invoice history and finalized report/pack snapshots remain immutable. A locale variant is a deterministic rendering of the same immutable snapshot, not a mutation of business truth.

## Architecture

### Shared locale package

Create a focused portal internationalization module with:

- `PortalLocale = 'en' | 'es' | 'pt'`;
- `normalizePortalLocale()` accepting aliases including `pt-BR`;
- complete, parity-checked dictionaries;
- `t(locale, key, params?)` for copy and interpolation;
- controlled-value helpers for roles, statuses, time categories, expense categories, availability, billing streams, and artifact states;
- locale-aware date, duration, number, and money formatters.

The English catalog is the canonical key set. ES and PT-BR must have exact key parity. A narrow allowlist covers intentionally invariant technical tokens.

### Svelte integration

Expose locale and translation functions through a shared Svelte context/store used by shell and standalone pages. Components render translations explicitly. The current DOM translator remains temporarily as a compatibility bridge but is not the source of truth for migrated content.

CSS pseudo-element copy such as `OPEN` becomes semantic DOM content so it can be localized and accessed by assistive technology.

### Reporting integration

The reporting package owns a typed report-copy catalog separate from portal navigation copy. Renderers receive an explicit normalized locale. Controlled financial descriptions are represented by stable semantic codes and translated only at rendering time.

An additive artifact-variant persistence contract will be defined by a Sol domain lead because migration numbering and existing B5 reservations are unresolved. Once frozen, all schema, repository, renderer, route, UI, fixture, and test implementation leaves are delegated to Luna Max.

## Data and migration safety

- No existing artifact row, storage object, snapshot, invoice, report, or Accounting Pack is deleted or repurposed.
- Existing single-language artifacts are backfilled as the locale stored in their snapshot, defaulting to `en` only when historical locale is absent.
- The migration must be additive and tested against a realistic populated database.
- Migration numbering must not silently reuse or rename the currently conflicting `0019`/`0020` files or the B5-reserved sequence.
- If no safe migration version can be established, portal translation may proceed, but persistent multi-language artifact variants remain blocked and must not be simulated with overwrites.

## Testing and acceptance

### Automated tests

- Catalog parity: EN, ES, and PT-BR contain the same keys.
- Static Svelte scan: no unregistered user-facing string outside the documented allowlist.
- Controlled-value coverage for every stored enum displayed to users.
- Action-message tests verify stable message keys and localized rendering.
- Renderer tests generate every PDF type in all three locales and extract text to verify localized labels.
- Variant tests generate EN, ES, and PT-BR from the same immutable snapshot and verify distinct records, storage keys, valid PDFs, hashes, and no overwrite.
- Failure isolation tests prove one locale failure does not block ready variants.
- Authorization tests cover every variant download.

### Browser QA

Use owner, finance, manager, and worker roles at 360x800, 390x844, 430x932, 768x1024, and 1440x900. Verify all portal sections, login/MFA/invitation, detail pages, action feedback, print views, keyboard access, no language flash, and no English residue in ES/PT-BR except the invariant allowlist.

### PDF QA

Render and visually inspect invoice, period, Accounting Pack, daily, and technical PDFs in EN, ES, and PT-BR. Verify correct document language, no sidebar-only first page, readable pagination, localized controlled copy, preserved free text, and independent artifact lifecycle.

## Delivery DAG

1. Sol/high freezes additive artifact-variant and migration-number contract.
2. Luna Max writes failing catalog, portal, renderer, persistence, authorization, and browser tests.
3. Luna Max implements the shared catalog and portal coverage in non-overlapping component packets.
4. Luna Max implements reporting localization and artifact variants against the frozen contract.
5. Independent Luna Max reviewers audit translation completeness, finance integrity, security, PDFs, and responsive behavior.
6. Sol/high performs final integration review and release-gate classification.

## Out of scope

- Automatic translation of user-entered text or imported customer documents.
- Translating technical product names, codes, identifiers, or audit event codes.
- Rewriting historical snapshots merely to change their display language.
- Resolving unrelated B5 lifecycle or durable-job functionality beyond the migration-number dependency required for artifact variants.

