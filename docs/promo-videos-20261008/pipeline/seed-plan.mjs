import { open, publishPlan } from './seed-lib.mjs';
const s = await open('project-manager');
const L3 = 'Plant 2 · Line 3 packaging cell', L4 = 'Plant 2 · Line 4 palletizer';
const plans = [
  { workers: ['chief', 't1', 't2'], start: '2026-10-09T12:00', end: '2026-10-09T21:00', hours: 8, site: L3, skill: 'Customer acceptance test (FAT)' },
  { workers: ['t1', 't2'], start: '2026-10-12T12:00', end: '2026-10-12T21:00', hours: 8, site: L4, skill: 'Robot programming' },
  { workers: ['t1', 't2'], start: '2026-10-13T12:00', end: '2026-10-13T21:00', hours: 8, site: L4, skill: 'Robot programming' },
  { workers: ['chief', 'ext'], start: '2026-10-14T12:00', end: '2026-10-14T21:00', hours: 8, site: L4, skill: 'Functional safety validation' },
  { workers: ['chief', 't1'], start: '2026-10-15T12:00', end: '2026-10-15T21:00', hours: 8, site: L4, skill: 'PLC commissioning' },
  { workers: ['t2'], start: '2026-10-16T13:00', end: '2026-10-16T17:00', hours: 4, site: 'Remote', skill: 'Remote support' },
  { workers: ['chief', 't1', 't2'], start: '2026-10-19T12:00', end: '2026-10-19T21:00', hours: 8, site: L4, skill: 'Production ramp-up support' },
];
for (const p of plans) await publishPlan(s.page, p);
await s.close();
