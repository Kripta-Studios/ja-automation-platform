import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { canDeleteTimeDraft } from '../../apps/portal/src/lib/portal/sections/time-entry-actions.js';

const read = (path: string): string => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('draft delete controls', () => {
  it('posts report deletion through deleteDraft instead of the legacy deleteReport action', () => {
    const page = read('apps/portal/src/routes/app/reports/[id]/+page.svelte');
    const server = read('apps/portal/src/routes/app/reports/[id]/+page.server.ts');
    expect(page).toContain('data-action="deleteDraft"');
    expect(page).toContain("data-record-type={isDaily ? 'daily_report' : 'technical_report'}");
    expect(page).toContain('data-record-id={String(report.id)}');
    expect(page).toContain('/app/reports?/deleteDraft');
    expect(page).not.toContain('?/deleteReport');
    expect(server).not.toMatch(/\bdeleteReport\s*:/);
  });

  it('uses deleteDraft for never-submitted time and expense drafts', () => {
    const time = read('apps/portal/src/lib/portal/sections/TimeSection.svelte');
    const expense = read('apps/portal/src/lib/portal/sections/ExpenseSection.svelte');
    expect(time).toContain('data-action="deleteDraft"');
    expect(time).toContain('data-record-type="time_entry"');
    expect(time).toContain('action="?/deleteDraft"');
    expect(time).toContain("import { canDeleteTimeDraft } from './time-entry-actions'");
    expect(time).toContain('return canDeleteTimeDraft(row, data.user.id);');
    expect(expense).toContain('data-action="deleteDraft"');
    expect(expense).toContain('data-record-type="expense"');
    expect(expense).toContain('action="?/deleteDraft"');
  });

  it('routes returned time to a reasoned correction draft instead of deletion', () => {
    const time = read('apps/portal/src/lib/portal/sections/TimeSection.svelte');
    expect(time).toContain("row.approval_state === 'needs_changes'");
    expect(time).toContain('action="?/createCorrectionDraft"');
    expect(time).toContain('name="reason"');
    expect(time).toContain('Create corrected draft');
  });

  it('keeps returned and approved expenses append-only and routes them to a reasoned correction', () => {
    const expense = read('apps/portal/src/lib/portal/sections/ExpenseSection.svelte');
    const actions = read('apps/portal/src/lib/server/actions/expense-actions.ts');
    expect(expense).toContain("row.approval_state === 'needs_changes'");
    expect(expense).toContain("row.approval_state === 'approved'");
    expect(expense).toContain('action="?/createCorrectionDraft"');
    expect(expense).toContain('name="recordType" value="expense"');
    expect(expense).toContain('name="reason"');
    expect(expense).not.toContain('action="?/deleteExpense"');
    expect(actions).toContain('deleteExpense: async');
    expect(actions).toContain("'Expense draft deleted'");
    expect(actions).not.toContain('removedOrVoided');
  });

  it('does not expose deletion for a SQLite-linked correction draft', () => {
    expect(
      canDeleteTimeDraft(
        { worker_id: 'worker-1', approval_state: 'draft', correction_linked: 1 },
        'worker-1',
      ),
    ).toBe(false);
    expect(
      canDeleteTimeDraft(
        { worker_id: 'worker-1', approval_state: 'draft', correction_linked: true },
        'worker-1',
      ),
    ).toBe(false);
    expect(
      canDeleteTimeDraft(
        { worker_id: 'worker-1', approval_state: 'draft', correction_linked: 0 },
        'worker-1',
      ),
    ).toBe(true);
  });
});
