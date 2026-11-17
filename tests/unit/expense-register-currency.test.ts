import { describe, expect, it } from 'vitest';
import { expenseRegisterExport, expenseRegisterRows } from '../../packages/reporting/src/expense-register';

const base = {
  spent_on: '2026-11-17',
  client_name: 'Client',
  project_number: 'P-1',
  project_name: 'Project',
  worker_name: 'Worker',
  vendor: 'Taxi',
  category: 'transport',
  description: 'Ride',
  who_paid: 'worker',
  approval_state: 'approved',
  reimbursement_state: 'pending',
};

describe('expense register amounts use each currency minor units', () => {
  it('prints JPY 1500 minor as 1500 and USD 2340 minor as 23.40', () => {
    const rows = expenseRegisterRows([
      { ...base, currency: 'JPY', amount_minor: 1500, reimbursement_amount_minor: 1500 },
      { ...base, currency: 'USD', amount_minor: 2340, reimbursement_amount_minor: 2340 },
    ]);
    expect(rows[0]).toMatchObject({ 'Recorded amount': '1500', 'Reimbursement amount': '1500' });
    expect(rows[1]).toMatchObject({ 'Recorded amount': '23.40', 'Reimbursement amount': '23.40' });
  });

  it('writes JPY as a whole number in the CSV and in the per-currency totals', () => {
    const csv = new TextDecoder().decode(
      expenseRegisterExport(
        [
          { ...base, currency: 'JPY', amount_minor: 1500 },
          { ...base, currency: 'JPY', amount_minor: 250 },
          { ...base, currency: 'EUR', amount_minor: -5 },
        ],
        'csv',
        'Nov 2026',
      ),
    );
    expect(csv).toContain(',JPY,1500,');
    expect(csv).toContain(',JPY,250,');
    expect(csv).toContain(',EUR,-0.05,');
    expect(csv).not.toContain('15.00');
  });

  it('keeps two decimals for an unknown legacy currency code', () => {
    expect(expenseRegisterRows([{ ...base, currency: 'XYZ', amount_minor: 1500 }])[0]).toMatchObject({
      'Recorded amount': '15.00',
    });
  });
});
