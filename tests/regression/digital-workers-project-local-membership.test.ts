import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  accessibleWorkflowProjects,
  workflowOwnersForProjects,
} from '../../apps/portal/src/lib/server/workflow-project-memberships.ts';

let sqlite: DatabaseSync;

beforeEach(() => {
  sqlite = new DatabaseSync(':memory:');
  sqlite.exec(`
    CREATE TABLE project(
      id TEXT PRIMARY KEY,
      project_number TEXT,
      name TEXT,
      timezone TEXT,
      status TEXT,
      project_manager_id TEXT
    );
    CREATE TABLE project_member(
      project_id TEXT,
      user_id TEXT,
      status TEXT,
      can_review INTEGER,
      starts_on TEXT,
      ends_on TEXT,
      assignment_role TEXT NOT NULL DEFAULT 'worker'
    );
    CREATE TABLE user(id TEXT PRIMARY KEY,name TEXT,email TEXT,role TEXT,status TEXT);
  `);
});

afterEach(() => {
  if (sqlite.isOpen) sqlite.close();
});

function addProject(id: string, timezone: string, status = 'active') {
  sqlite
    .prepare('INSERT INTO project(id,project_number,name,timezone,status) VALUES(?,?,?,?,?)')
    .run(id, `P-${id}`, `Project ${id}`, timezone, status);
}

function addUser(id: string, name: string, role: string, status = 'active') {
  sqlite
    .prepare('INSERT INTO user(id,name,role,status) VALUES(?,?,?,?)')
    .run(id, name, role, status);
}

function addMember(
  projectId: string,
  userId: string,
  startsOn: string,
  endsOn: string | null,
  canReview = false,
  status = 'active',
  assignmentRole = canReview ? 'project_manager' : 'worker',
) {
  sqlite
    .prepare(
      'INSERT INTO project_member(project_id,user_id,status,can_review,starts_on,ends_on,assignment_role) VALUES(?,?,?,?,?,?,?)',
    )
    .run(projectId, userId, status, canReview ? 1 : 0, startsOn, endsOn, assignmentRole);
}

describe('digital workers project-local membership dates', () => {
  it('uses Madrid local tomorrow as the inclusive starts_on boundary for project and owner access', () => {
    const instant = new Date('2026-10-11T22:30:00.000Z');
    expect(instant.toISOString().slice(0, 10)).toBe('2026-10-11');
    addProject('madrid', 'Europe/Madrid');
    // Digital Workers includes closing projects even when the global principal omits them.
    addProject('closing', 'Europe/Madrid', 'closing');
    addProject('no-review', 'Europe/Madrid');
    addProject('closed', 'Europe/Madrid', 'closed');
    addProject('unrelated', 'Europe/Madrid');
    addUser('manager', 'Marta Manager', 'project_manager');
    addUser('other-manager', 'Olivia Other', 'project_manager');
    addUser('worker', 'Wendy Worker', 'worker');
    addMember('madrid', 'manager', '2026-10-12', null, true);
    addMember('madrid', 'manager', '2026-10-12', null, true);
    addMember('madrid', 'worker', '2026-10-12', null);
    addMember('closing', 'manager', '2026-10-12', null, true);
    addMember('closing', 'worker', '2026-10-12', null);
    addMember('no-review', 'manager', '2026-10-12', null, false);
    addMember('closed', 'manager', '2026-10-12', null, true);
    addMember('unrelated', 'other-manager', '2026-10-12', null, true);

    const projects = accessibleWorkflowProjects(sqlite, 'manager', instant);
    expect(projects).toEqual([
      { id: 'closing', number: 'P-closing', name: 'Project closing' },
      { id: 'madrid', number: 'P-madrid', name: 'Project madrid' },
    ]);
    expect(workflowOwnersForProjects(sqlite, projects, instant)).toEqual([
      {
        id: 'manager',
        name: 'Marta Manager',
        role: 'project_manager',
        projectIds: ['closing', 'madrid'],
      },
      { id: 'worker', name: 'Wendy Worker', role: 'worker', projectIds: ['closing', 'madrid'] },
    ]);
  });

  it('uses the Americas local prior day as the inclusive ends_on boundary for project and owner access', () => {
    const instant = new Date('2026-10-12T06:30:00.000Z');
    expect(instant.toISOString().slice(0, 10)).toBe('2026-10-12');
    addProject('americas', 'America/Los_Angeles');
    addUser('manager', 'Alex Manager', 'project_manager');
    addUser('worker', 'Wendy Worker', 'worker');
    addMember('americas', 'manager', '2026-10-01', '2026-10-11', true);
    addMember('americas', 'worker', '2026-10-01', '2026-10-11');

    const projects = accessibleWorkflowProjects(sqlite, 'manager', instant);
    expect(projects).toEqual([{ id: 'americas', number: 'P-americas', name: 'Project americas' }]);
    expect(workflowOwnersForProjects(sqlite, projects, instant)).toEqual([
      { id: 'manager', name: 'Alex Manager', role: 'project_manager', projectIds: ['americas'] },
      { id: 'worker', name: 'Wendy Worker', role: 'worker', projectIds: ['americas'] },
    ]);
  });

  it('offers follow-ups only on projects the PM manages, not where he only works as a member (T41)', () => {
    const instant = new Date('2026-10-15T12:00:00.000Z');
    addProject('managed', 'UTC');
    addProject('member-only', 'UTC');
    addUser('manager', 'Marta Manager', 'project_manager');
    addMember('managed', 'manager', '2026-10-01', null, true);
    // A reviewable membership as a worker on a project somebody else manages.
    addMember('member-only', 'manager', '2026-10-01', null, true, 'active', 'worker');
    expect(accessibleWorkflowProjects(sqlite, 'manager', instant).map((row) => row.id)).toEqual([
      'managed',
    ]);
    sqlite.prepare("UPDATE project SET project_manager_id='manager' WHERE id='member-only'").run();
    expect(accessibleWorkflowProjects(sqlite, 'manager', instant).map((row) => row.id)).toEqual([
      'managed',
      'member-only',
    ]);
  });

  it('offers no supplier staff as follow-up owner to a project manager (D5, round 2)', () => {
    const instant = new Date('2026-10-15T12:00:00.000Z');
    sqlite.exec('CREATE TABLE supplier_user_profile(user_id TEXT, supplier_id TEXT, profile TEXT)');
    addProject('managed', 'UTC');
    addUser('manager', 'Marta Manager', 'project_manager');
    addUser('tech', 'External Tech', 'worker');
    addMember('managed', 'manager', '2026-10-01', null, true);
    addMember('managed', 'tech', '2026-10-01', null);
    sqlite.prepare("INSERT INTO supplier_user_profile VALUES('tech','s1','external_technician')").run();
    const projects = accessibleWorkflowProjects(sqlite, 'manager', instant);
    expect(workflowOwnersForProjects(sqlite, projects, instant).map((row) => row.id)).toEqual([
      'tech',
      'manager',
    ]);
    expect(
      workflowOwnersForProjects(sqlite, projects, instant, { excludeSupplierStaff: true }).map(
        (row) => row.id,
      ),
    ).toEqual(['manager']);
  });
});
