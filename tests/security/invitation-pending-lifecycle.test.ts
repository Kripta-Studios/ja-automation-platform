import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { V3Repository, createDatabase } from '@ja/database';
import type { Principal } from '@ja/domain';
import { installB5TestDeploymentIdentity } from '../fixtures/b5-test-environment.js';
import { stepUpB5Principal } from '../fixtures/b5-lifecycle-security-fixture.js';

const cleanups: (() => void)[] = [];
beforeEach(() => cleanups.push(installB5TestDeploymentIdentity()));
afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup();
});

function setup() {
  const directory = mkdtempSync(join(tmpdir(), 'ja-invites-'));
  const { sqlite } = createDatabase(join(directory, 'app.db'));
  cleanups.push(() => rmSync(directory, { recursive: true, force: true }));
  cleanups.push(() => sqlite.close());
  const now = new Date().toISOString();
  sqlite
    .prepare(
      "INSERT INTO user(id,name,email,role,status,email_verified,created_at,updated_at) VALUES('owner','Owner','antonny.luty@j-aautomation.com','owner_admin','active',1,?,?),('pm','PM','pm@example.test','project_manager','active',1,?,?)",
    )
    .run(now, now, now, now);
  const owner = stepUpB5Principal(
    sqlite,
    { userId: 'owner', role: 'owner_admin', projectIds: new Set() } satisfies Principal,
    'invitation-pending',
  );
  return { sqlite, v3: new V3Repository(sqlite), owner };
}

describe('pending invitations in the People directory', () => {
  it('lists, reissues and revokes unused invitations with an audit trail', () => {
    const { sqlite, v3, owner } = setup();
    const first = v3.createInvitation(owner, {
      email: 'new.pm@example.test',
      role: 'project_manager',
    });
    expect(v3.listOpenInvitations(owner)).toMatchObject([
      { id: first.id, email: 'new.pm@example.test', role: 'project_manager', expired: false },
    ]);

    const replacement = v3.reissueInvitation(owner, first.id);
    expect(replacement.token).not.toBe(first.token);
    expect(v3.listOpenInvitations(owner).map((row) => row.id)).toEqual([replacement.id]);
    // The replaced link is no longer accepted (expiry moved back to creation time).
    const old = sqlite
      .prepare('SELECT expires_at<=created_at closed FROM invitation WHERE id=?')
      .get(first.id) as { closed: number };
    expect(old.closed).toBe(1);

    v3.revokeInvitation(owner, replacement.id);
    expect(v3.listOpenInvitations(owner)).toEqual([]);
    expect(() => v3.revokeInvitation(owner, replacement.id)).toThrow(
      'Invitation is no longer open',
    );

    const audits = sqlite
      .prepare(
        "SELECT action, json_extract(details_json,'$.operation') operation, json_extract(details_json,'$.reason') reason FROM audit_event WHERE entity_type='invitation' ORDER BY occurred_at, rowid",
      )
      .all();
    expect(audits).toEqual([
      { action: 'invitation.create', operation: null, reason: null },
      { action: 'invitation.revoke', operation: 'revoke', reason: 'replaced' },
      { action: 'invitation.create', operation: null, reason: null },
      { action: 'invitation.revoke', operation: 'revoke', reason: 'revoked' },
    ]);
  });

  it('keeps invitation management owner-only', () => {
    const { sqlite, v3 } = setup();
    const pm = { userId: 'pm', role: 'project_manager', projectIds: new Set() } as Principal;
    expect(() => v3.listOpenInvitations(stepUpB5Principal(sqlite, pm, 'pm-list'))).toThrow();
    expect(() => v3.revokeInvitation(stepUpB5Principal(sqlite, pm, 'pm-revoke'), 'x')).toThrow();
  });
});
