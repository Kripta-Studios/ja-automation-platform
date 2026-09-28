import { describe, expect, it } from 'vitest';
import {
  financeProjectReviewHref,
  financeReviewProjectId,
} from '../../apps/portal/src/lib/portal/finance-review-links';

const reviewRemedies = [
  'review_project_commercial_policy',
  'review_compensation_rules',
  'review_client_labor_rates',
  'review_internal_cost_rules',
  'review_approved_time',
  'review_worker_compensation_settlements',
];

describe('Finance review links', () => {
  it.each(reviewRemedies)(
    'opens the submitted project for %s when another project is selected',
    (id) => {
      const projectId = financeReviewProjectId([{ id }], 'project-b', 'project-a', [
        'project-a',
        'project-b',
      ]);
      expect(projectId).toBe('project-b');
      const url = new URL(
        financeProjectReviewHref('', projectId!, 'commercial', {
          task: 'Client labor rates',
          lang: 'es',
        }),
        'https://example.test',
      );
      expect(url.searchParams.get('project')).toBe('project-b');
      expect(url.searchParams.get('task')).toBe('Client labor rates');
      expect(url.searchParams.get('lang')).toBe('es');
    },
  );

  it('uses an authorized remedy project before form and page selections', () => {
    expect(
      financeReviewProjectId(
        [{ id: 'review_compensation_rules', projectId: 'project-b' }],
        'project-a',
        'project-a',
        ['project-a', 'project-b'],
      ),
    ).toBe('project-b');
  });

  it('keeps the remedy text-only when the submitted or remedy project is outside Finance scope', () => {
    expect(
      financeReviewProjectId([{ id: 'review_compensation_rules' }], 'project-b', 'project-a', [
        'project-a',
      ]),
    ).toBeNull();
    expect(
      financeReviewProjectId(
        [{ id: 'review_compensation_rules', projectId: 'project-b' }],
        'project-a',
        'project-a',
        ['project-a'],
      ),
    ).toBeNull();
  });

  it('uses the selected project only when no action project was supplied', () => {
    expect(
      financeReviewProjectId([{ id: 'review_approved_time' }], undefined, 'project-a', [
        'project-a',
      ]),
    ).toBe('project-a');
  });
});
