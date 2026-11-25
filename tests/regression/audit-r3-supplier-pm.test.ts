import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { portalNavigationForRole } from '../../apps/portal/src/lib/portal-navigation';
import { supplierDraftCopy } from '../../apps/portal/src/routes/app/supplier/copy';
import { reportQuickText } from '../../apps/portal/src/lib/portal/sections/report-quick-copy';
import { approvalQueueText } from '../../apps/portal/src/lib/portal/sections/approval-queue-copy';

const read = (path: string): string => readFileSync(resolve(process.cwd(), path), 'utf8');
const supplierPage = 'apps/portal/src/routes/app/supplier/+page.svelte';

/** Source guards for the round-3 supplier / PM fixes (browser evidence in fix/r3-supplier-pm.md). */
describe('round 3 supplier and PM screens', () => {
  it('T26: the supplier report lists drafts without per-draft send boxes or a native confirm()', () => {
    const page = read(supplierPage);
    expect(page).not.toMatch(/[^.\w]confirm\(/u);
    expect(page).not.toContain("action={actionUrl('submitTime')}");
    expect(page).not.toContain('WARNING_SUPPLIER_TIME_SUBMISSION');
    // Discard asks inline: "Yes, discard" / "Keep draft".
    expect(page).toContain('confirmDiscardFor === String(entry.id)');
    expect(page).toContain('data-supplier-discard-yes');
    // One place to send: the report points to Record hours.
    expect(page).toContain("onclick={() => selectWorkspaceAction('time')}>{d.reviewAndSend}");
  });

  it('T26/T57: new supplier and report strings exist in EN, ES and PT', () => {
    for (const key of [
      'reportDrafts',
      'reportDraftsOne',
      'reviewAndSend',
      'discardYes',
      'discardCancel',
      'correctionSaved',
    ] as const) {
      const values = (['en', 'es', 'pt'] as const).map((locale) => supplierDraftCopy[locale][key]);
      expect(new Set(values).size, key).toBe(3);
    }
    for (const key of ['sendForReview', 'draftForWorker', 'draftForWorkerHint'] as const) {
      const values = (['en', 'es', 'pt'] as const).map((locale) => reportQuickText(locale, key));
      expect(new Set(values).size, key).toBe(3);
    }
    for (const key of [
      'resubmittedAfterSendBack',
      'correctionOfApproved',
      'correctionReason',
    ] as const) {
      const values = (['en', 'es', 'pt'] as const).map((locale) => approvalQueueText(locale, key));
      expect(new Set(values).size, key).toBe(3);
    }
  });

  it('T57: the supplier coordinator has no personal daily-report entry in his navigation', () => {
    const nav = portalNavigationForRole('', 'worker', 'supplier_coordinator');
    const labels = [...nav.primary, ...(nav.mobile ?? [])].map((item) => item.label);
    expect(labels).not.toContain('Reports');
    expect(labels).toContain('Operational report');
    // The external technician keeps his own reports.
    const technician = portalNavigationForRole('', 'worker', 'external_technician');
    expect(technician.primary.map((item) => item.label)).toContain('Reports');
  });

  it('T57: the PM daily form offers one-step send only where the server allows it', () => {
    const section = read('apps/portal/src/lib/portal/sections/ReportSection.svelte');
    expect(section).toContain(
      "(data.user.role === 'project_manager' && createWorker === String(data.user.id))",
    );
    expect(section).toContain('name="submitNow" value="on"');
    // The worker picker is sorted by the display name.
    expect(section).toContain('personDisplayName(a.name, a.email).localeCompare(');
  });
});
