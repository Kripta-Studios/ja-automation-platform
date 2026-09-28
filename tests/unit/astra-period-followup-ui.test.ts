import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const reviewPagePath = resolve(
  process.cwd(),
  'apps/portal/src/routes/app/reports/review/+page.svelte',
);
const periodDetailPagePath = resolve(
  process.cwd(),
  'apps/portal/src/routes/app/reports/period/[id]/+page.svelte',
);

describe('ASTRA C1 period review surface', () => {
  it('renders the scoped review queue with exact bindings, source links and private follow-up controls', () => {
    const source = readFileSync(reviewPagePath, 'utf8');

    expect(source).toContain("from '$lib/portal/ui'");
    for (const primitive of ['SectionCard', 'FormCard', 'Field', 'StatusBadge', 'TableRegion'])
      expect(source).toContain(primitive);
    expect(source).toContain('data-period-review');
    expect(source).toContain('data-period-review-report');
    expect(source).toContain('expectedSnapshotVersion');
    expect(source).toContain('expectedSnapshotSha256');
    expect(source).toContain('expectedLatestEventId');
    expect(source).toContain('idempotencyKey');
    expect(source).toContain('data-followup-history');
    expect(source).toContain('data-source-link');
    expect(source).toContain('data-finance-readiness');
    expect(source).toContain('copy.periodNotAccepted');
    expect(source).toContain('copy.noFinanceAmounts');
  });

  it('keeps review copy complete for English, Spanish and Portuguese', async () => {
    const module = await import('../../apps/portal/src/routes/app/reports/review/copy.ts');
    for (const locale of ['en', 'es', 'pt'] as const) {
      const copy = module.reviewCopy[locale];
      expect(copy.title).toBeTruthy();
      expect(copy.followupForm).toBeTruthy();
      expect(copy.history).toBeTruthy();
      expect(copy.financeReadiness).toBeTruthy();
      expect(copy.cadenceMismatch).toBeTruthy();
      expect(copy.periodNotAccepted).toBeTruthy();
      expect(copy.noFinanceAmounts).toBeTruthy();
    }
  });

  it('keeps a narrow exact-version follow-up surface on the period detail route', () => {
    const source = readFileSync(periodDetailPagePath, 'utf8');

    expect(source).toContain('data-period-followup');
    expect(source).toContain('action="?/recordFollowup"');
    expect(source).toContain('expectedSnapshotVersion');
    expect(source).toContain('expectedSnapshotSha256');
    expect(source).toContain('expectedLatestEventId');
    expect(source).toContain('idempotencyKey');
    expect(source).toContain('data-period-followup-history');
  });
});
