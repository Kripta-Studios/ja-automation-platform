import { open, createTime, createDaily, createTechnical, submitWeek, submitDraftReports } from './seed-lib.mjs';
const s = await open('crew-chief');
await createTechnical(s.page, {
  reportDate: '2026-10-07', systemName: 'Line 3 case packer', plantSite: 'Plant 2', areaLine: 'Packaging · Line 3', stationMachine: 'Wrapper WR-310',
  systemType: 'Packaging automation', plcPlatform: 'Siemens S7-1500', controller: 'CPU 1516F-3 PN/DP', hmiScada: 'WinCC Unified 19', networkProtocol: 'PROFINET IRT',
  softwareVersion: 'TIA Portal V19 Upd 3', programReference: 'L3_CASEPACKER_v2.4.1',
  problemSymptom: 'Intermittent film-break fault stopping the wrapper at speeds above 38 packs/min.',
  diagnosisRootCause: 'Film-break photo-eye bracket vibrating at high speed; 10 ms debounce too short for the signal chatter.',
  changePerformed: 'Bracket re-aligned and fixed with lock washers. FB_FilmMonitor debounce raised from 10 ms to 30 ms (program v2.4.0 -> v2.4.1).',
  productionImpact: '35 minutes of planned downtime under customer lockout-tagout.',
  validation: '40-minute continuous run at 42 packs/min plus forced film-break test.',
  validationResult: 'No false trips. Real film break detected and stopped within 120 ms.',
  openRisk: 'Monitor the sensor during the first production week.',
  rollbackPlan: 'Restore program v2.4.0 backup from the project archive and reset debounce to 10 ms.',
});
await createTime(s.page, { date: '2026-10-06', hours: 9, category: 'commissioning', summary: 'Crew lead on Line 3 commissioning: safety chain validation and PLC I/O checkout coordination.' });
await createTime(s.page, { date: '2026-10-07', hours: 9, category: 'commissioning', summary: 'Wrapper WR-310 film-break fix, program v2.4.1 release and validation run.' });
await createTime(s.page, { date: '2026-10-08', hours: 8, category: 'regular', summary: 'Operator dry-run, punch-list review with customer maintenance lead.' });
await submitWeek(s.page, '2026-10-05');
await createDaily(s.page, {
  date: '2026-10-08', siteShift: 'Plant 2 · Line 3 packaging cell · Day shift',
  summary: 'Operator dry-run completed on all 4 SKUs. Line ready for customer acceptance test.',
  tasksCompleted: '- 3-hour dry-run with two operator crews\n- Closed 11 of 13 punch-list items\n- As-built wiring markups handed to customer maintenance',
  problemsFound: 'Two cosmetic HMI items: alarm text truncation and missing Spanish label on the recipe screen.',
  correctiveActions: 'HMI text fixes prepared for tomorrow morning.',
  openItems: 'Customer acceptance test (FAT sign-off) planned for Friday.',
  nextDayPlan: 'Load HMI fixes, run acceptance test with the customer and collect signatures.',
});
await submitDraftReports(s.page);
await s.close();
