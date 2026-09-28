import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (relativePath: string): string =>
  readFileSync(resolve(process.cwd(), relativePath), 'utf8');

describe('CORE02 project management UI authorization and lifecycle controls', () => {
  it('does not render project administration controls from a truthy empty client list', () => {
    const portalShell = read('apps/portal/src/lib/PortalShell.svelte');
    expect(portalShell).toContain('const canManageProjects = $derived(');
    expect(portalShell).toContain('{#if canManageProjects}');
    expect(portalShell).not.toContain('{#if data.clients && !isAuditor}');
    expect(portalShell).toContain("['active', 'planned', 'paused'].includes");
  });

  it('keeps project lifecycle status and actual close date under lifecycle controls', () => {
    const detail = read('apps/portal/src/routes/app/projects/[id]/+page.svelte');
    expect(detail).not.toContain('name="status"');
    expect(detail).not.toContain('name="actualEndDate"');
    expect(detail).toContain('name="version"');
  });
});
