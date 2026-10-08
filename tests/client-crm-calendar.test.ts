import { describe, expect, it } from 'vitest';
import {
  clientCalendarMonthDays,
  clientCalendarWindow,
  formatCalendarHours,
  groupClientCalendarEntries,
  normalizeCalendarMonth,
} from '../apps/portal/src/lib/portal/client-work-calendar';

describe('client work calendar display helpers', () => {
  it('uses the six-week Monday-first window selected by the URL month', () => {
    expect(clientCalendarWindow('2026-10')).toEqual({ from: '2026-09-28', to: '2026-11-08' });
    const days = clientCalendarMonthDays('2026-10');
    expect(days).toHaveLength(42);
    expect(days[0]).toEqual({ date: '2026-09-28', inMonth: false });
    expect(days[3]).toEqual({ date: '2026-10-01', inMonth: true });
    expect(normalizeCalendarMonth('bad', new Date('2026-10-08T12:00:00.000Z'))).toBe('2026-10');
  });

  it('groups actual time by project and worker for one exact day', () => {
    const rows = [
      {
        work_date: '2026-10-08',
        project_id: 'project-a',
        client_id: 'client-a',
        project_number: 'C-0001-P-001',
        project_name: 'Cell upgrade',
        site_name: 'Assembly hall',
        worker_id: 'worker-a',
        worker_name: 'Ada Engineer',
        minutes: 90,
        approval_state: 'submitted',
      },
      {
        work_date: '2026-10-08',
        project_id: 'project-a',
        client_id: 'client-a',
        project_number: 'C-0001-P-001',
        project_name: 'Cell upgrade',
        site_name: 'Assembly hall',
        worker_id: 'worker-a',
        worker_name: 'Ada Engineer',
        minutes: 30,
        approval_state: 'approved',
      },
      {
        work_date: '2026-10-08',
        project_id: 'project-a',
        client_id: 'client-a',
        project_number: 'C-0001-P-001',
        project_name: 'Cell upgrade',
        site_name: 'Assembly hall',
        worker_id: 'worker-b',
        worker_name: 'Lin Technician',
        minutes: 60,
        approval_state: 'approved',
      },
      {
        work_date: '2026-10-09',
        project_id: 'project-a',
        client_id: 'client-a',
        project_number: 'C-0001-P-001',
        project_name: 'Cell upgrade',
        site_name: 'Assembly hall',
        worker_id: 'worker-a',
        worker_name: 'Ada Engineer',
        minutes: 600,
        approval_state: 'approved',
      },
      {
        work_date: '2026-10-08',
        project_id: 'project-a',
        client_id: 'client-a',
        project_number: 'C-0001-P-001',
        project_name: 'Cell upgrade',
        site_name: 'Assembly hall',
        worker_id: 'worker-c',
        worker_name: 'Rejected Worker',
        minutes: 600,
        approval_state: 'rejected',
      },
    ];

    expect(groupClientCalendarEntries(rows, '2026-10-08')).toEqual([
      {
        id: 'project-a',
        projectNumber: 'C-0001-P-001',
        name: 'Cell upgrade',
        siteName: 'Assembly hall',
        minutes: 180,
        workers: [
          {
            id: 'worker-a',
            name: 'Ada Engineer',
            minutes: 120,
            approvalStates: ['approved', 'submitted'],
          },
          {
            id: 'worker-b',
            name: 'Lin Technician',
            minutes: 60,
            approvalStates: ['approved'],
          },
        ],
      },
    ]);
    expect(formatCalendarHours(90, 'en-US')).toBe('1.5 h');
  });
});
