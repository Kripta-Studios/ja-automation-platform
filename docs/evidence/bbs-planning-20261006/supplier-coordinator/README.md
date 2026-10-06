# Supplier Coordinator dated team-work browser evidence

Executed 2026-10-06 in an isolated BBS training copy with the genuine Supplier Coordinator account. October 23 work is explicitly fictional. All writes used native visible forms; SQL was used read-only to verify persisted states. No production data or financial configuration changed.

## Browser results

- Native login/application root opens **Supplier team**. No internal Today agenda or Planning calendar. Direct Planning returns friendly Access restricted / 403 and a Supplier recovery link.
- **Record team hours → Add visible to selection → Same hours for everyone → Actual hours 1 → Save selected drafts** created two distinct 60-minute October 23 sources for the two existing fictional supplier technicians, with coordinator attribution.
- Native success message: **Batch saved: 2 drafts · BBS · Ejemplo de manual · 2026-10-23 · 2 team hours**.
- The prior report period was October 1–6, so the new drafts initially fell outside the filtered view. Setting From/To to October 23 exposed both existing drafts; no duplicate save was needed.
- **Select up to 100 drafts → Submit selected to J&A** explicitly submitted exactly those two sources. Submission success and each Submitted state were visible.
- Authorized Owner operationally approved both sources. Refreshed Operational report totals **2 actual hours**, with one approved hour per technician and Recorded by the Supplier Coordinator. External Technician's same-filter report totals only their own one hour.
- Dated negative test: Work date November 1 lies beyond October 31 coverage. Native form removed eligible technicians, cleared selection and disabled **Save selected drafts**. No POST was sent for the blocked save; read-only SQL confirmed zero synthetic November 1 sources.
- UX limitation: empty eligible personnel currently uses a generic **No matching records. Change the search or status filter** hint. The manual explains checking Work date/assignment/authorization first, rather than assuming search is the cause.
- Desktop 1440, tablet 768 and phone 390 Operational report views loaded with zero application/console errors on positive pages. Intentional 403 produced ordinary failed-resource console output.
- No client rates, internal costs, billing, financial reports or compensation controls were exposed in these operational views. Screenshots contain only fictional supplier personnel and operational activity, with no credentials.

## Synthetic sources

| Technician | Source ID | Final state |
|---|---|---|
| BBS ROLE LAB External Technician | `01a110b9-384b-74fe-858c-cef80ea7afb1` | Approved, 60 minutes |
| BBS ROLE LAB Coordinator-recorded Technician | `01a110b9-384d-74ca-9265-db197291d165` | Approved, 60 minutes |

Both have October 23 work date. Screenshots 03–06 and 09–10 are deliberately retained as Draft/Submitted checkpoints; screenshot 11 is the later approved report. Original BBS October 2–5 invoicing history was preserved.

## Interpretation / handoff

Supplier authorization, project membership, internal published plans and actual sources are distinct. Supplier Coordinator cannot publish or accept an internal goal/plan. Own Daily Tasks completed/Open items/Next-day plan are narrative context, not a task status or automatic time entry. Existing coordinator Daily procedure is retained; the parallel External Technician packet demonstrates the same native fields through PM approval. Supplier hours go to authorized J&A Owner review; ordinary PM Time queue excludes supplier hours, while PM may review permitted operational Reports.

## Final stable build smoke

After the completed rebuild containing the Owner/PM publish/edit form state fix, a fresh native Supplier Coordinator login and approved October 23 team report passed at 1440 desktop and 390 phone. The two-hour total, two authorized technician sources, restricted navigation, friendly Planning/Today 403 and absence of page-level horizontal overflow were rechecked. Zero JavaScript page errors. See `final-build-smoke.json` for the timestamp and results. No business mutations were made. The Owner/PM site/expertise form fix does not expand supplier permissions.
