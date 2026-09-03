import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

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
    expect(expense).toContain('data-action="deleteDraft"');
    expect(expense).toContain('data-record-type="expense"');
    expect(expense).toContain('action="?/deleteDraft"');
  });
});
