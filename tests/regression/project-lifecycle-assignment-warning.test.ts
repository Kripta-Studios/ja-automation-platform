import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { compile } from 'svelte/compiler';
import { describe, expect, it } from 'vitest';

const sectionPath = resolve(
  process.cwd(),
  'apps/portal/src/lib/portal/sections/ProjectSection.svelte',
);
const shellPath = resolve(process.cwd(), 'apps/portal/src/lib/PortalShell.svelte');

describe('project lifecycle assignment warnings', () => {
  it.each([sectionPath, shellPath])('compiles %s', (filename) => {
    const result = compile(readFileSync(filename, 'utf8'), { filename, generate: 'client' });
    expect(
      result.warnings.filter((warning) => warning.code === 'state_referenced_locally'),
    ).toEqual([]);
  });

  it('warns only for actions targeting closing or closed in the reusable project section', () => {
    const source = readFileSync(sectionPath, 'utf8');
    expect(source).toContain(
      "if (targetStatus !== 'closing' && targetStatus !== 'closed') return null;",
    );
    expect(source).toMatch(
      /\{#each actions as action\}[\s\S]*?\{@const warning = lifecycleAssignmentWarning\(project, action\)\}[\s\S]*?<form method="POST" action=\{action.action\}>[\s\S]*?\{#if warning\}[\s\S]*?<ProblemNotice[\s\S]*?kind="warning"[\s\S]*?<label>/,
    );
    expect(source).toContain('href: projectHref(project)');
    expect(source).toContain('problem.remedy.reviewAssignments');
    expect(source).toContain('href: `${base}/app/projects#assignment-history`');
  });

  it('warns before each owner or finance closing transition with project and assignment review', () => {
    const source = readFileSync(shellPath, 'utf8');
    for (const status of ['closing', 'closed']) {
      expect(source).toContain(`problem={projectLifecycleAssignmentWarning(row, '${status}')}`);
    }
    expect(source).toMatch(
      /\{#if row.status === 'active' \|\| row.status === 'paused'\}[\s\S]*?name="status"[\s\S]*?<ProblemNotice[\s\S]*?projectLifecycleAssignmentWarning\(row, 'closing'\)[\s\S]*?<label class="sr-only"/,
    );
    expect(source).toMatch(
      /\{:else if row.status === 'closing'\}[\s\S]*?name="status" value="closed"[\s\S]*?<ProblemNotice[\s\S]*?projectLifecycleAssignmentWarning\(row, 'closed'\)[\s\S]*?<label class="sr-only"/,
    );
    expect(source).toContain('problem.remedy.reviewProjectStatus');
    expect(source).toContain('problem.remedy.reviewAssignments');
    expect(source).toContain('id="project-assignment-list"');
    expect(source).toMatch(/href: canManageAssignmentControls\s+\?/);
    expect(source).toContain('`${base}/app/projects#assignment-history`');
    expect(source).toContain('problem.warning.projectLifecycleAssignments');
  });
});
