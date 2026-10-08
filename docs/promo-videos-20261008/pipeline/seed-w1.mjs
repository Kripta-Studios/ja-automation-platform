import { open, createTime, createDaily, submitWeek } from './seed-lib.mjs';
const s = await open('worker-1');
await createTime(s.page, { date: '2026-10-07', hours: 8.5, category: 'commissioning', summary: 'Line 3 packaging cell: servo axis tuning, HMI alarm text review and recipe download tests.' });
await createTime(s.page, { date: '2026-10-08', hours: 7.5, category: 'regular', summary: 'Line 3 packaging cell: dry-run with operators, punch-list fixes and as-built wiring markups.' });
await submitWeek(s.page, '2026-10-05');
await createDaily(s.page, {
  date: '2026-10-06', siteShift: 'Plant 2 · Line 3 packaging cell · Day shift',
  summary: 'Completed PLC I/O checkout for the conveyor and wrapper sections. 186 of 192 points verified.',
  tasksCompleted: '- Verified digital inputs on racks 1-3\n- Tested light curtain and E-stop chain with site electrician\n- Confirmed VFD parameters on conveyors CV-301 to CV-306',
  problemsFound: 'Six analog inputs on rack 4 read out of range (4-20 mA loop polarity reversed).',
  correctiveActions: 'Loop polarity corrected on AI-4.03 and AI-4.04; remaining four points scheduled for tomorrow.',
  openItems: 'Remaining 6 I/O points on rack 4. Customer to confirm HMI alarm wording.',
  nextDayPlan: 'Finish rack 4 checkout, start servo tuning on the wrapper and recipe download tests.',
});
await createDaily(s.page, {
  date: '2026-10-07', siteShift: 'Plant 2 · Line 3 packaging cell · Day shift',
  summary: 'I/O checkout closed at 192/192. Wrapper servo axes tuned and recipe downloads validated for 4 SKUs.',
  tasksCompleted: '- Closed rack 4 analog checkout\n- Tuned servo axes 1-3 (following error below 0.2 mm)\n- Validated recipe download for SKUs A10, A12, B20, B24',
  problemsFound: 'Wrapper film-break sensor intermittent at high speed.',
  correctiveActions: 'Sensor bracket re-aligned and debounce raised to 30 ms; 40 min test run without false trips.',
  downtimeMinutes: 35, standbyReason: 'Waiting for customer lockout-tagout release on the wrapper',
  openItems: 'Operator training session to be scheduled with the customer.',
  nextDayPlan: 'Dry-run with operators and close punch-list items.',
});
await s.page.goto('https://j-aautomation.com/j-aautomation/app/reports?lang=en', { waitUntil: 'networkidle' });
console.log((await s.page.locator('main').innerText()).replace(/\n+/g, '\n').slice(0, 2500));
console.log(await s.page.$$eval('main a', as => as.map(a => a.innerText.trim().slice(0, 40) + ' -> ' + a.getAttribute('href')).filter(x => x.includes('reports/')).join('\n')));
await s.close();
