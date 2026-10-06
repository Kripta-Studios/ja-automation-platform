# External Technician assignment / expected-hours / work-goals browser evidence

Executed 2026-10-06 against an isolated copy of BBS project `C-0050-P-20261005`, using native Playwright browser interactions and the genuine local External Technician account. All October 22–23 work is explicitly fictional. No production data, outward messages, financial rules or financial records were changed.

## Browser results

- Native login and application root redirect to **Time**. Navigation: Time, Expenses, Reports, Operational report, Profile and Help. No Today or Planning destinations.
- Owner separately published October 22 08:00–10:00 UTC / 2 planned hours for the technician. Native Owner worker selection allowed publication. Restricted external profile still has no agenda card; direct `/today` and `/planning` return friendly **Access restricted** / HTTP 403 with a Time recovery link. This is a documented capability limitation.
- Before own recording, October 22 had zero actual hours. Native **Log time → Save draft → Submit** created one 120-minute source. Authorized Owner operational approval succeeded afterward.
- With an effective 480-minute weekday working schedule, October 22 shows Actual **2.00h**, Expected **8.00h**, Difference **−6.00h**. After approval, the weekly variance status is **Needs note**, while the underlying time source remains Approved. Planned 2h did not replace the expected 8h target.
- Native Daily save / Submit for review / genuine PM Approve report succeeded. Saved Tasks completed, Open items and Next-day plan provide narrative goals; they do not create a goal acceptance/completion workflow, shifts, time, customer consent or payment.
- October 23 own Operational report shows only the technician's one coordinator-recorded approved hour. The coordinator sees two authorized technician hours. Another known synthetic technician time source returned friendly Access restricted (403); no other-source content rendered.
- Tablet 768 and phone 390 Time views use readable day cards; desktop 1440 uses the weekly table. Positive operational pages had zero page errors, zero console errors and no HTTP failures. Expected 403 checks generate the browser's ordinary failed-resource console entry; these are intentional authorization outcomes, not an app crash.
- Screenshots contain fictional operational sources and no passwords, cookies, client rates, internal costs, margin or colleagues' pay. No real-world task completion is claimed.

## Synthetic records

| Record | ID | Final state |
|---|---|---|
| Owner published Oct 22 plan | `01a110b9-9c39-74eb-8673-632e9894e83a` | Published, 120 planned minutes |
| Own Oct 22 actual source | `01a110b7-63bd-740b-91e8-f6ae90a7d6be` | Approved, 120 actual minutes |
| Own Oct 22 Daily goals narrative | `01a110b8-1df9-770a-b651-12577efc6437` | Approved by PM |
| Coordinator-recorded own Oct 23 source | `01a110b9-384b-74fe-858c-cef80ea7afb1` | Approved, 60 actual minutes |

Earlier screenshots are deliberately retained as Draft/Submitted checkpoints. Screenshots 13–16 show later Approved states. The week includes the additional October 23 hour, so its total is 3h, while the October 22 filtered register is 2h. The dated working schedule was changed by the parallel Owner workflow; later captures show 40 weekday hours, replacing the earlier 48-hour baseline with Saturday work.

## Review handoff

Supplier time is excluded from the ordinary PM Time approval queue by policy. An authorized J&A Owner reviewed all three new supplier time sources. PM successfully reviewed the Daily report in the Reports queue. Missing financial rates remained unresolved; no finance review, worker payment or customer billing was created.

## Final stable build smoke

After the Owner/PM publish/edit form state fix and completed rebuild, fresh native External Technician login and read-only Time/week, approved Daily goals source and own operational report all passed at 1440 desktop and 390 phone. The expected role navigation remained unchanged; direct Today/Planning still returned the intended friendly 403. Document overflow checks passed, with zero JavaScript page errors. See `final-build-smoke.json` for the timestamp and per-route results. These checks performed no business mutations. The form fix preserves Owner/PM site and expertise inputs; it does not change restricted-profile permissions.
