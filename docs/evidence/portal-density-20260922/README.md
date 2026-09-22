# Portal density and progressive disclosure — 2026-09-22

User feedback: panels and subpanels still present too many controls together, with insufficient typographic hierarchy and spacing. This revision changes information presentation and preserves business actions, role restrictions, source records and money semantics.

## Implemented

- Shared SectionCard supports explicit, opt-in native disclosure. It reveals invalid/error content and deep-linked content, expands for printing and restores the previous open state. Children remain mounted so collapsing does not clear entered values.
- Time, Expense and Report registers retain search/project/status controls. Secondary criteria open in one filter panel, initially expanded when active. The separate expense export-scope form is disclosed; filtered export actions stay visible.
- Project creation remains prominent. Client/assignment administration lives under More actions. The primary Owner project register starts expanded, uses existing pagination, and exposes per-project lifecycle forms through Actions. The keyed project loop prevents entered reasons from moving to another record on page/filter changes. Client administration and assignment history are separate disclosures; existing history anchors still work.
- Team assignment history shows a count and expands per person. Completed approvals are secondary; pending review and warnings remain visible. Accounting Pack generation and private document registration open on demand. Planning skill administration is grouped.
- Billing setup reference tables disclose separately. Finance configuration uses a single labelled policy/task selector in place of nine peer buttons.
- Shared spacing tokens increase card padding, section separation, field gaps and action-area separation. Operational form labels use readable mixed case, normal tracking and 14px text. Scoped section metadata/control copy has a 13px minimum. Dense administrative forms use at most two columns and Finance retains one column through tablet width.

## Validation notes

- First desktop pass: filter preservation and validation/print behavior passed. Project workflow audit exposed a legacy delete-button contrast issue; fixed with explicit accessible danger colors.
- Independent review found and corrected duplicate chevrons, missing Team/Billing print expansion, Finance tablet cascade, initial Owner register visibility and cross-project uncontrolled form-state reuse. No business action semantics were replaced.
- An intermediate matrix was interrupted after the explicit Finance task label issue was identified, corrected and covered through exact accessible-name selection. Failures and interruptions are retained, not counted as passes.
- An isolated direct Vite build without deployment identity failed its environment guard. The standard fixture-backed build is used for browser validation; no environment guard was bypassed.

## Confirmed checks

- Responsive/accessibility/workflow matrix: 64 passed at 360, 390, 768 and 1440 pixels.
- Focused units: 187 passed in 24 files. Private manual download security: 4 passed.
- Portal TypeScript and targeted ESLint passed.
- Final pagination regression selector corrected to the actual accessible button name `Next →`; interrupted run retained. Local test servers and fixture lock from that interrupted invocation were removed only after confirming no Playwright owner remained.

Final capture, PDF and production outcomes follow after execution. All authenticated screenshots and mutation checks use disposable fixtures, not production customer accounts.

- Final regression/capture run before last CSS adjustment: 13 passed, 3 capture-only viewport exclusions. Final scoped visual correction rebuilt and verified: 5 passed, 3 capture-only viewport exclusions; 112 screenshots and 196 capture checks.

- Nine active PDFs regenerated (six detailed EN/PT-BR and three quick guides). Verified hashes/source binding, embedded Geist fonts, images and text extraction; 10–14 pages each. Rendered EN/PT-BR navigation pages visually inspected.

## Production verification

Activated 2026-09-22 11:33:26 Europe/Madrid, immutable release `0ba62783814af13aa36f3f9c0e6a6d3394499b12cad478dde89aec79f5dc672f`. Verified 594 runtime/config files byte-for-byte and all 9 container PDFs by SHA-256. SQLite integrity OK, zero foreign-key violations, eight financial table hashes and 59 private files unchanged.

Latest pre-deployment backup verified (59 documents). Two subsequent automatic job cycles passed. Public EN/PT/ES, login and local font URLs return 200. The first six-page live browser check encountered one Caddy EOF/502 at desktop login; it is retained in `production-browser-first.txt`. Both containers had zero restarts/OOM events. A complete second mobile/desktop run passed all six pages with loaded Geist fonts, no overflow and no response/console errors; the underlying cause of the first transient was not established. The preceding release had also recorded this proxy behavior.

Limits: focused visual checks do not replace the complete 32-step business acceptance suite. Historical backup coverage is 14/30 days; the latest backup integrity check passes. Existing four dead-letter jobs and two historical failed localized PDFs remain unchanged. No GitHub push was performed at this deployment stage; subsequent publication is recorded separately in `github-release-20260922`.

Docker build cache cleanup reclaimed 6.861 GB; final Build Cache 0 B. Application images, rollback images and volumes retained. Jobs/backup timers and deployment timer/path are active.
