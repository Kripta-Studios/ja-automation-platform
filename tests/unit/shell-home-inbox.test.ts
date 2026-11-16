import { describe, expect, it } from 'vitest';
import { personDisplayName, personInitials } from '../../apps/portal/src/lib/portal/display-name';
import {
  pendingApprovalSummary,
  readyToInvoiceSummary,
  workerWeekStatus,
} from '../../apps/portal/src/lib/portal/home-inbox';
import { searchPaletteRecords } from '../../apps/portal/src/lib/portal/ui/section-search';

describe('person display names', () => {
  it.each([
    ['gabriel.lamoglia', 'Gabriel Lamoglia'],
    ['gabriel.lamoglia@j-aautomation.com', 'Gabriel Lamoglia'],
    ['agnaldo_freitas', 'Agnaldo Freitas'],
    ['adm', 'Adm'],
    ['Antonny Nascimento', 'Antonny Nascimento'],
    ['María José', 'María José'],
    ['Jean-Luc', 'Jean-Luc'],
    ['McAllister', 'McAllister'],
    ['  lucas.silva2  ', 'Lucas Silva2'],
  ])('presents %s as %s', (stored, expected) => {
    expect(personDisplayName(stored)).toBe(expected);
  });

  it('falls back to the e-mail local part and builds initials from the presented name', () => {
    expect(personDisplayName('', 'joao.pereira@example.com')).toBe('Joao Pereira');
    expect(personInitials('gabriel.lamoglia')).toBe('GL');
    expect(personDisplayName(null)).toBe('');
  });
});

describe('home inbox projections', () => {
  const rows = [
    { type: 'time', approval_state: 'submitted', review_stage: 'operational', amount: 480 },
    { type: 'time', approval_state: 'submitted', review_stage: 'operational', amount: 30 },
    { type: 'time', approval_state: 'needs_changes', review_stage: 'operational', amount: 60 },
    { type: 'time', approval_state: 'approved', review_stage: 'owner_override', amount: 60 },
    { type: 'time', approval_state: 'approved', review_stage: 'finance', amount: 60 },
    {
      type: 'expense',
      approval_state: 'submitted',
      review_stage: 'operational',
      expense_currency: 'USD',
      expense_amount_minor: '43710',
    },
    {
      type: 'expense',
      approval_state: 'submitted',
      review_stage: 'operational',
      expense_currency: 'EUR',
      expense_amount_minor: '6000',
    },
    { type: 'daily', approval_state: 'submitted', review_stage: 'report' },
  ];

  it('counts only work waiting for the reviewer and keeps currencies apart', () => {
    expect(pendingApprovalSummary(rows)).toEqual({
      time: { count: 2, minutes: 510 },
      expenses: {
        count: 2,
        totals: [
          { currency: 'EUR', minor: '6000' },
          { currency: 'USD', minor: '43710' },
        ],
      },
      reports: 1,
      total: 5,
    });
  });

  it('sums approved unbilled work exactly per currency and points at the largest project', () => {
    expect(
      readyToInvoiceSummary([
        { projectId: 'a', currency: 'USD', minor: '900719925474099300' },
        { projectId: 'b', currency: 'USD', minor: '100' },
        { projectId: 'c', currency: 'EUR', minor: '0' },
        { projectId: 'd', currency: 'EUR', minor: 'not-money' },
      ]),
    ).toEqual({
      projects: 2,
      totals: [{ currency: 'USD', minor: '900719925474099400' }],
      items: [
        { projectId: 'a', label: 'a', currency: 'USD', minor: '900719925474099300' },
        { projectId: 'b', label: 'b', currency: 'USD', minor: '100' },
      ],
      topProjectId: 'a',
    });
  });

  it("summarises only the signed-in worker's own week", () => {
    const week = workerWeekStatus({
      weekStart: '2026-11-16',
      weekEnd: '2026-11-22',
      today: '2026-11-16',
      workerId: 'me',
      time: [
        { worker_id: 'me', work_date: '2026-11-16', approval_state: 'draft', minutes: 480 },
        { worker_id: 'me', work_date: '2026-11-17', approval_state: 'submitted', minutes: 60 },
        { worker_id: 'me', work_date: '2026-11-09', approval_state: 'approved', minutes: 600 },
        { worker_id: 'other', work_date: '2026-11-16', approval_state: 'approved', minutes: 600 },
      ],
      expenses: [
        {
          worker_id: 'me',
          spent_on: '2026-11-18',
          approval_state: 'needs_changes',
          currency: 'EUR',
          amount_minor: '1250',
        },
        {
          worker_id: 'me',
          spent_on: '2026-11-18',
          approval_state: 'void',
          currency: 'EUR',
          amount_minor: '1',
        },
      ],
    });
    expect(week.time).toEqual({ draft: 480, submitted: 60, approved: 0, needsChanges: 0 });
    expect(week.expenses).toEqual({
      draft: 0,
      submitted: 0,
      approved: 0,
      needsChanges: 1,
      totals: [{ currency: 'EUR', minor: '1250' }],
    });
  });
});

describe('search palette records', () => {
  const records = [
    { id: '1', label: 'Junkers OHIO', detail: 'C-0020-P-004', href: '/p/1' },
    { id: '2', label: 'Privado SA', detail: 'C-0099', href: '/c/2' },
  ];
  it('matches whole-word prefixes only', () => {
    expect(searchPaletteRecords('jun ohio', records).map((record) => record.id)).toEqual(['1']);
    expect(searchPaletteRecords('iva', records)).toEqual([]);
    expect(searchPaletteRecords('', records)).toEqual([]);
  });
});
