import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string): string => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('Client Essential client and team directory surfaces', () => {
  it('renders an authorized client directory with contacts, sites and associated projects', () => {
    const source = read('apps/portal/src/lib/portal/sections/ClientDirectorySection.svelte');
    expect(source).toContain('data-client-directory');
    expect(source).toContain('contacts?: PortalRow[]');
    expect(source).toContain('projects?: PortalRow[]');
    expect(source).toContain('client_id');
    expect(source).toContain('Sites / plants');
    expect(source).toContain('Projects and sites');
    expect(source).toContain('mailto:');
    expect(source).toContain('box-sizing: border-box');
    expect(source).toMatch(/color:\s*var\(--portal-muted,\s*#[0-9a-f]{6}\)/i);
    expect(source).toContain('canManageContacts?: boolean');
    expect(source).toContain('data-contact-actions');
    expect(source).toContain('?view=clients&client=${encodeURIComponent(clientId)}&/createClientContact');
    expect(source).toContain('?view=clients&client=${encodeURIComponent(clientId)}&/updateClientContact');
    expect(source).toContain('?view=clients&client=${encodeURIComponent(clientId)}&/deleteClientContact');
    expect(source).toContain("confirm(translate('Delete this contact?'))");
    expect(source).not.toMatch(/Begin close|Close project|transitionProject/);
  });

  it('keeps team directory operational and free of financial fields', () => {
    const source = read('apps/portal/src/lib/portal/sections/TeamDirectorySection.svelte');
    expect(source).toContain('data-team-directory');
    expect(source).toContain('assignments?: PortalRow[]');
    expect(source).toContain('Availability');
    // 2026-11-16: assignments live on the person page (PersonProjectsPanel).
    expect(source).toContain('<PersonProjectsPanel');
    expect(source).toContain('planned_minutes');
    expect(source).toContain('actual_minutes');
    expect(source).toContain('Actual hours');
    expect(source).toContain('Planned vs actual');
    expect(source).toContain('canManageTeam?: boolean');
    expect(source).toContain('data-team-actions');
    expect(source).toContain('?view=team&/createInvitation');
    // Person-scoped action URLs keep the person page open after a native POST.
    expect(source).toContain("action={teamActionHref('updateWorkerProfile', workerId(worker))}");
    expect(source).toContain("action={teamActionHref('updateUserStatus', workerId(worker))}");
    expect(source).toContain("if (lang) params.set('lang', lang);");
    expect(source).toContain('return `?${params.toString()}&/${actionName}`;');
    expect(source).toContain('data-invitation-result');
    expect(source).toContain('value="offboarded"');
    expect(source).toContain("confirm(translate('Remove this team member access?'))");
    for (const forbidden of ['client_rate', 'internal_cost', 'compensation', 'amount_minor']) {
      expect(source).not.toContain(forbidden);
    }
    expect(source).not.toMatch(/Begin close|Close project|transitionProject/);
  });

  it('passes server-aligned management capabilities into the visible directory views', () => {
    const shell = read('apps/portal/src/lib/PortalShell.svelte');
    expect(shell).toContain('canManageContacts={canManageClientContacts}');
    expect(shell).toContain('canManageTeam={canManageTeamDirectory}');
    expect(shell).toContain("mailboxData.user.role === 'owner_admin' && canonicalOwner");
    expect(shell).toContain('currentUserId={data.user.id}');
    expect(shell).not.toContain('Verify for protected actions');
    expect(shell).not.toContain('/app/api/step-up');
  });

  it('derives assignment actual minutes server-side from authorized operational rows', () => {
    const source = read('apps/portal/src/routes/app/[section]/section-load.ts');
    expect(source).toContain("t.approval_state NOT IN ('rejected','void')");
    expect(source).toContain('actual_minutes');
    expect(source).toContain('authorizedAssignments');
    const assignmentActuals = source.slice(
      source.indexOf('const authorizedAssignments'),
      source.indexOf('const projectIds', source.indexOf('const authorizedAssignments')),
    );
    expect(assignmentActuals).toContain('t.approval_state NOT IN');
    expect(assignmentActuals).not.toMatch(/client_rate|internal_cost|compensation_minor/);
  });

  it('styles project workflow actions as visible buttons, not text links', () => {
    // 2026-11-16: the workflow panel became a compact toolbar of real buttons.
    const css = read('apps/portal/src/styles/portal/projects-simple.css');
    const shell = read('apps/portal/src/lib/PortalShell.svelte');
    expect(shell).toContain('class="project-toolbar"');
    expect(shell).toMatch(/class="project-toolbar"[\s\S]*?class="primary-button"/);
    expect(shell).toMatch(/class="project-toolbar"[\s\S]*?class="secondary-button"/);
    expect(css).toMatch(/\.project-toolbar > \*\s*\{[\s\S]*?min-height:\s*2\.75rem/);
  });

  it('styles client directory contact actions as filled buttons', () => {
    const source = read('apps/portal/src/lib/portal/sections/ClientDirectorySection.svelte');
    expect(source).toContain('class="client-directory__action primary-button"');
    expect(source).toMatch(
      /\.client-directory__action\s*\{[\s\S]*?background:\s*var\(--ja-primary,\s*#[0-9a-f]{6}\)/i,
    );
    expect(source).toContain('box-shadow: 0 0.3rem 0.8rem rgb(16 32 47 / 0.12)');
    expect(source).not.toMatch(
      /\.client-directory__action--quiet\s*\{[\s\S]*?background:\s*transparent/,
    );
  });

  it('provides mobile-safe controls and reduced-motion handling', () => {
    const client = read('apps/portal/src/lib/portal/sections/ClientDirectorySection.svelte');
    const team = read('apps/portal/src/lib/portal/sections/TeamDirectorySection.svelte');
    for (const source of [client, team]) {
      expect(source).toContain('min-height: var(--ja-target-min');
      expect(source).toContain(':focus-visible');
      expect(source).toContain('@media (max-width: 640px)');
      expect(source).toContain('@media (prefers-reduced-motion: reduce)');
    }
  });

  it('keeps the project editor contextual on tablet and full-screen only on phone', () => {
    const detail = read('apps/portal/src/routes/app/projects/[id]/+page.svelte');
    expect(detail).toMatch(
      /@media \(max-width: 900px\)[\s\S]*?:global\(\.project-edit-sheet\)[\s\S]*?width: min\(40rem, 60vw\)/,
    );
    expect(detail).toMatch(
      /@media \(max-width: 640px\)[\s\S]*?:global\(\.project-edit-sheet\)[\s\S]*?width: 100vw/,
    );
  });
});
