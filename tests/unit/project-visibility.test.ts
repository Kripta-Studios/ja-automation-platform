import { describe, expect, it } from 'vitest';
import {
  includesArchivedProjectHistory,
  normalizeVisibleProjectSelection,
  projectVisibility,
  visibleProjectRecords,
} from '../../apps/portal/src/lib/portal/project-visibility';

const authorizedProjects = [
  { id: 'active', status: 'active', name: 'QA active customer work' },
  { id: 'closed', status: 'closed', name: 'Completed work' },
  { id: 'archived', status: 'archived', name: 'Retained history' },
];
const authorizedRows = [
  { id: 'actual-time', project_id: 'active', minutes: 60 },
  { id: 'closed-expense', project_id: 'closed', amount_minor: '1200' },
  { id: 'archived-draft', project_id: 'archived', approval_state: 'draft' },
  { id: 'outside-scope', project_id: 'unauthorized' },
];

describe('authorized project presentation visibility', () => {
  it('excludes archived projects, drafts and calendar records by default without name filters', () => {
    const scope = projectVisibility(authorizedProjects);
    expect(scope.projects.map((project) => project.id)).toEqual(['active', 'closed']);
    expect(visibleProjectRecords(authorizedRows, scope.projectIds).map((row) => row.id)).toEqual([
      'actual-time',
      'closed-expense',
    ]);
    expect(authorizedRows).toHaveLength(4);
  });

  it('requires explicit includeArchived=1 and never promotes a stale archived project selection', () => {
    for (const query of ['project=archived', 'includeArchived=0', 'includeArchived=true', '']) {
      const scope = projectVisibility(
        authorizedProjects,
        includesArchivedProjectHistory(new URLSearchParams(query)),
      );
      expect(normalizeVisibleProjectSelection('archived', scope.projectIds)).toBe('');
      expect(normalizeVisibleProjectSelection('active', scope.projectIds)).toBe('active');
    }
  });

  it('includes authorized history only in explicit mode and retains the authorization intersection', () => {
    const scope = projectVisibility(
      authorizedProjects,
      includesArchivedProjectHistory(new URLSearchParams('includeArchived=1&project=archived')),
    );
    expect(normalizeVisibleProjectSelection('archived', scope.projectIds)).toBe('archived');
    expect(normalizeVisibleProjectSelection('unauthorized', scope.projectIds)).toBe('');
    expect(visibleProjectRecords(authorizedRows, scope.projectIds).map((row) => row.id)).toEqual([
      'actual-time',
      'closed-expense',
      'archived-draft',
    ]);
    expect(projectVisibility(authorizedProjects.slice(0, 1), true).projectIds.has('archived')).toBe(
      false,
    );
  });
});
