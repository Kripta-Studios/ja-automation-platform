# Owner invoice date edits: production browser verification

October 5, 2026 Europe/Madrid (October 4 UTC). Functional checks used one live browser/page, Owner, English, 1280×720. All participating agents used GPT-6.1 Sol. The application tested was `0f32319aa8c2c888d47740dab220ff35cf1c08e8`, archive `49355e708d0f2b12864889a9c72ce9be8378130be5b0eb2583974ef7d6ef97a5`.

## Observed workflow

The register offered one existing unissued Draft, invoice `01a0f855-365a-742b-a6b8-9771065b4558`, project `C-0020-P-004`. It is an existing business draft, not a synthetic QA fixture. No invoice was created, approved, issued, sent, paid, voided or deleted.

| Check | Actual browser result |
| --- | --- |
| Original editor | Fourteen labelled controls, native validity true; invoice date October 1, empty explicit due date, 30-day terms. Preview due date October 31. |
| Date-only probe | Exactly one enabled **Save Details** click changed only invoice date to October 2. Success feedback appeared and the document rendered October 2 / November 1. |
| Persistence | Ordinary Billing departure and reopening retained all 14 controls; only invoice date differed from the original. Explicit due date remained empty. |
| Invoice conservation | All 11 complete line rows remained identical, including 68 hours, USD 3,325.00 total, zero discount/tax and Draft identity. |
| Project health | Complete public Overview before/after the probe matched, excluding time, focus and geometry. Identity, client, Active state, schedule, timezone, PO context, operational counts and displayed contribution stayed unchanged. |
| Restoration | Exactly one restoration Save returned invoice date to October 1. Ordinary departure/reopen restored the complete original editor and preview, including calculated October 31 due date. |
| Session cleanup | Original Billing filter/scope restored; only URL query parameter order differed. Owner context restored, fresh Signout followed by settled Login, then actual No open tabs closure. |

The cycle used **58 calls: 33 investigation / 25 restoration**, exactly two Saves, no retry, no private login helper and no native tool errors. One offline comparison-parser error was corrected without changing originals or calling the browser; it is not an application bug. The first post-Signout read retained transient Owner DOM while its wrapper reported login loading; the next original independently established settled Login. No custom wait or repeated Signout was used.

Root independently recomputed full control, row, project and restoration comparisons and viewed all four unedited PNGs. Probe/restoration images show both changed/restored dates legibly. The first preview image frames the controls, with the invoice below the viewport; offscreen totals and remaining fields are supported by full public DOM, not those cropped images.

## Limits and retained effects

Payment terms, purchase reference, bank/contact fields and all other controls were left unchanged. Their changed-source writeback branches were not tested here. No mobile check, PDF generation/download/parity, console-wide audit, issued-document mutation, payment, concurrency, other role or whole-project/app correctness certificate is claimed. No new source fix was required by the selected invoice-date cycle.

Source review establishes that successful saves append audit history, advance invoice versions, clear PDF metadata to pending and update the planned issue date; an initially null planned date can become initialized. Those effects are not rewound. Restoration means exact original visible editable values and public invoice/project state; it is not a backend rollback or side-effect-free claim. Hidden versions, jobs, private payloads and database contents were not inspected.

## Immutable evidence

Originals remain under `/home/kripta/ja-audit-20261002/reverification/finance-auditor`:

- `W121_OWNER_INVOICE_EDIT_NATIVE_RECEIPT.md`: SHA256 `185496b513262b19b3a8ced5b79bd95e5f5f3071685de537b4959f42965d9b9b`.
- `W121_OWNER_INVOICE_EDIT_NATIVE_RECEIPT.safe.json`: SHA256 `1cd1e6a6251c205f041229057c82b798cbddbbfb6e19a232e3e39c0668eaf141`.
- `W121_OWNER_INVOICE_EDIT_ORDERED_EVIDENCE_MANIFEST.safe.json`: SHA256 `7d1a8f21f9d3f1352407f114320b3885948124a43143292df2097c0d4e0a944d`.
- Root closure: SHA256 `40be150dce9edd0da6f3668493238bf2ffc5c5e49de62e0fb0735ef8950f9e55`; ZIP triggers restored first and cleanup timer second before close inspection; all three active and Chrome/profile guards clear at closure.
- Root originals preflight: SHA256 `7877ce99f7add370f6211d5363ca23c7fb9ba996c2ba6a10b92707153648d74a`.

This verification adds **zero UX/bug credit**. Accepted counts remain **75 UX / 69 bugs**; original coverage remains **47 scoped / 55 NOT_RUN / 0 whole-compound PASS**. W120's separate assignment error was only reproduced, remains unfixed and is parked. The requested next step is publish/deploy completed changes, selected cache/expired-backup cleanup, then STOP. This pre-release evidence does not itself claim the subsequent publication or activation; those need their actual operational receipt.
