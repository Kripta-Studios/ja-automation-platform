import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  technicalReportPdf,
  workerStatementPdf,
  type WorkerStatementSnapshot,
} from '@ja/reporting';
import { expenseRegisterExport } from '../packages/reporting/src/expense-register.ts';

function inspect(bytes: Uint8Array) {
  const directory = mkdtempSync(join(tmpdir(), 'ja-example-layout-'));
  const file = join(directory, 'report.pdf');
  try {
    writeFileSync(file, bytes);
    const bbox = execFileSync('pdftotext', ['-bbox', file, '-'], { encoding: 'utf8' });
    const raw = execFileSync('pdftotext', ['-raw', file, '-'], { encoding: 'utf8' });
    const words = [
      ...bbox.matchAll(
        /<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([^<]*)<\/word>/g,
      ),
    ].map((match) => ({
      x: Number(match[1]),
      y: Number(match[2]),
      right: Number(match[3]),
      text: match[5],
    }));
    return { bbox, raw, words, pages: [...bbox.matchAll(/<page /g)].length };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

describe('readable generated PDF examples', () => {
  it('keeps worker hours and narrow column headings together in a landscape table', () => {
    const snapshot: WorkerStatementSnapshot = {
      worker: { id: 'worker', name: 'Synthetic Worker' },
      locale: 'en',
      periodStart: '2026-08-01',
      periodEnd: '2026-08-31',
      currency: 'USD',
      approvedMinutes: 480,
      pendingMinutes: 0,
      estimatedApprovedMinor: '32000',
      estimatedPendingMinor: '0',
      approvedReimbursementMinor: '0',
      pendingReimbursementMinor: '0',
      missingCompensationRules: 0,
      settlements: [],
      expenses: [],
      activities: [
        {
          id: 'time',
          projectNumber: 'SYN-C-0001-P-001',
          projectName: 'Synthetic commissioning validation',
          date: '2026-08-12',
          category: 'regular',
          activitySummary: 'Synthetic commissioning validation',
          actualMinutes: 480,
          approvalState: 'approved',
        },
      ],
    };
    const { bbox, words, raw } = inspect(workerStatementPdf(snapshot));
    const page = bbox.match(/<page width="([\d.]+)" height="([\d.]+)"/)!;
    expect(Number(page[1])).toBeGreaterThan(Number(page[2]));
    for (const heading of ['TYPE', 'HOURS', 'APPROVAL'])
      expect(words.some((word) => word.text === heading)).toBe(true);
    const activityHeading = words.find((word) => word.text === 'activity')!;
    // Both the activity row and its total must retain a single readable numeric token.
    expect(words.filter((word) => word.text === '8.00' && word.y > activityHeading.y)).toHaveLength(
      2,
    );
    expect(raw).toContain('$320.00');
    expect(raw).toContain('2026.09.22.1');
  });

  it.each(['en', 'pt-BR'])(
    'keeps long technical contact details inside their metadata card (%s)',
    (locale) => {
      const email = 'synthetic.technician.with.long.contact.name@example.invalid';
      const { words, raw } = inspect(
        technicalReportPdf({
          locale,
          project: { number: 'SYN-P-1', name: 'Synthetic project' },
          date: '2026-08-12',
          workerName: 'Synthetic worker',
          worker_email: email,
          report_created_by_name: 'Synthetic author',
          report_created_by_email: 'author@example.invalid',
          systemName: 'Synthetic system',
          approvalState: 'approved',
        }),
      );
      // The worker email is in the left card. Its first fragment must not cross the
      // centre gutter into the creator card, even if Chromium wraps the address.
      const firstFragment = words.find((word) => word.text.startsWith('synthetic.technician'))!;
      expect(firstFragment).toBeDefined();
      expect(firstFragment.right).toBeLessThan(291);
      expect(raw.replace(/\s/g, '')).toContain(email);
    },
  );

  it('gives expense descriptions readable full-width lines without dropping export fields', () => {
    const records = Array.from({ length: 8 }, (_, index) => ({
      spent_on: '2026-08-12',
      client_name: 'Synthetic Client One',
      project_number: 'SYN-C-0001-P-001',
      project_name: 'Synthetic commissioning validation',
      worker_name: 'Synthetic Worker A',
      vendor: `Synthetic Transit Vendor ${index + 1}`,
      category: 'ground_transport',
      description:
        'Synthetic transit from the demonstration hotel to the demonstration site; evidence retained with the fixture.',
      currency: 'USD',
      amount_minor: '8500',
      who_paid: 'worker',
      approval_state: 'approved',
      reimbursement_state: 'scheduled',
    }));
    const { words, raw, pages } = inspect(
      expenseRegisterExport(records, 'pdf', '2026-08-01 → 2026-08-31'),
    );
    expect(words.filter((word) => word.text === 'demonstration')).toHaveLength(16);
    expect(pages).toBeLessThanOrEqual(2);
    for (const label of [
      'Client:',
      'Category:',
      'Payer:',
      'Status:',
      'Reimbursement status:',
      'Description:',
    ]) {
      expect(raw.split(label)).toHaveLength(9);
    }
    expect(raw).toContain('USD 680.00');
    for (let index = 1; index <= 8; index++)
      expect(raw).toContain(`Synthetic Transit Vendor ${index}`);
    expect(raw).toContain('ground_transport');
    expect(raw).toContain('scheduled');
  });
});
