import { open, createExpense, submitExpenseWeek } from './seed-lib.mjs';
const s = await open('crew-chief');
// hotel already created
// await createExpense(s.page, { date: '2026-10-06', category: 'hotel', vendor: 'Riverside Inn DEMO', amount: '238.00', description: 'Crew lodging near Plant 2, 2 nights (Oct 6-7).', paymentMethod: 'Personal card', receipt: 'assets/receipt-hotel.png' });
await createExpense(s.page, { date: '2026-10-07', category: 'fuel', vendor: 'Fuel Stop DEMO', amount: '64.20', description: 'Service van diesel, site round trips.', paymentMethod: 'Personal card', receipt: 'assets/receipt-fuel.png' });
await createExpense(s.page, { date: '2026-10-07', category: 'meals', vendor: 'Plant Diner DEMO', amount: '42.50', description: 'Crew lunch during wrapper validation run.', paymentMethod: 'Cash', receipt: 'assets/receipt-meal.png' });
await submitExpenseWeek(s.page, '2026-10-05');
await s.close();
