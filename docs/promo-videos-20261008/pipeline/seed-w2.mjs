import { open, createTime, createDaily, submitWeek, submitDraftReports } from './seed-lib.mjs';
const s = await open('worker-2');
await createTime(s.page, { date: '2026-10-06', hours: 8, category: 'commissioning', summary: 'Line 3 packaging cell: field wiring verification and drive commissioning CV-301 to CV-306.' });
await createTime(s.page, { date: '2026-10-07', hours: 8, category: 'commissioning', summary: 'Line 3: HMI screen walkthrough and alarm testing with customer maintenance.' });
await createTime(s.page, { date: '2026-10-08', hours: 2, category: 'travel', summary: 'Travel from Plant 2 to the service office with test equipment.' });
await createTime(s.page, { date: '2026-10-08', hours: 6, category: 'regular', summary: 'Line 3: operator dry-run support and as-built documentation.' });
await submitWeek(s.page, '2026-10-05');
await createDaily(s.page, {
  date: '2026-10-07', siteShift: 'Plant 2 · Line 3 packaging cell · Day shift',
  summary: 'HMI alarm walkthrough completed with customer maintenance: 64 alarms tested, 61 accepted.',
  tasksCompleted: '- Tested 64 HMI alarms end to end\n- Verified alarm acknowledgment and history logging\n- Updated alarm texts per customer feedback',
  problemsFound: 'Three alarms need clearer operator instructions.',
  correctiveActions: 'Revised alarm help texts drafted and sent to the crew chief for approval.',
  openItems: 'Customer approval of the three revised alarm texts.',
  nextDayPlan: 'Support the operator dry-run and finish as-built documentation.',
});
await submitDraftReports(s.page);
await s.close();
