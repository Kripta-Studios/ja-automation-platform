import { describe, expect, it } from 'vitest';
import type { PortalRow } from '../../apps/portal/src/lib/portal/portal-data.ts';
import {
  emptyPublishedAssignmentFilters,
  publishedAssignmentMatches,
  type PublishedAssignmentFilters,
} from '../../apps/portal/src/lib/portal/sections/published-assignment-filter.ts';

const assignment: PortalRow = {
  id: 'assignment-41',
  project_id: 'project-a',
  user_id: 'worker-a',
  assignment_role: 'technician',
  starts_on: '2026-10-01',
  ends_on: null,
  project_number: 'PRJ-41',
  project_name: 'Instalación eléctrica',
  worker_name: 'Ana García',
  worker_email: 'ana@example.test',
};

const project: PortalRow = {
  id: 'project-a',
  project_number: 'PRJ-41',
  name: 'Instalación eléctrica',
  cost_center_code: 'CC-MADRID-41',
  po_number: 'PO-8765',
};

const filters = (overrides: Partial<PublishedAssignmentFilters>): PublishedAssignmentFilters => ({
  ...emptyPublishedAssignmentFilters,
  ...overrides,
});

describe('published assignment filters', () => {
  it.each([
    'PRJ-41',
    'Instalacion electrica',
    'Garcia',
    'ana@example.test',
    'CC-MADRID-41',
    'PO-8765',
  ])('searches assignment, project, worker, and project reference text: %s', (search) => {
    expect(publishedAssignmentMatches(assignment, project, filters({ search }))).toBe(true);
  });

  it('matches published planning dates, site and worker IDs from the planning projection', () => {
    const planning = {
      ...assignment,
      user_id: undefined,
      worker_id: 'worker-a',
      starts_at: '2026-10-28T08:00:00.000Z',
      site: 'Madrid factory',
    };
    expect(
      publishedAssignmentMatches(
        planning,
        project,
        filters({ workerId: 'worker-a', search: '2026-10-28' }),
      ),
    ).toBe(true);
    expect(
      publishedAssignmentMatches(planning, project, filters({ search: 'Madrid factory' })),
    ).toBe(true);
    expect(publishedAssignmentMatches(planning, project, filters({ workerId: 'worker-b' }))).toBe(
      false,
    );
  });

  it('combines project and worker filters with the text search', () => {
    expect(
      publishedAssignmentMatches(
        assignment,
        project,
        filters({ projectId: 'project-a', workerId: 'worker-a', search: 'PO-8765' }),
      ),
    ).toBe(true);
    expect(
      publishedAssignmentMatches(assignment, project, filters({ projectId: 'project-b' })),
    ).toBe(false);
    expect(publishedAssignmentMatches(assignment, project, filters({ workerId: 'worker-b' }))).toBe(
      false,
    );
  });

  it('returns an empty result for an unmatched search and exposes a true clear state', () => {
    expect(
      publishedAssignmentMatches(assignment, project, filters({ search: 'no-such-assignment' })),
    ).toBe(false);
    expect(emptyPublishedAssignmentFilters).toEqual({ search: '', projectId: '', workerId: '' });
    expect(publishedAssignmentMatches(assignment, project, emptyPublishedAssignmentFilters)).toBe(
      true,
    );
  });
});
