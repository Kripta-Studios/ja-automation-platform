import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string): string => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('Owner mailbox directory UI contract', () => {
  const directory = (): string =>
    read('apps/portal/src/lib/portal/sections/TeamDirectorySection.svelte');

  it('wires the live directory, tabs and the complete mailbox action contract', () => {
    const source = directory();

    expect(source).toContain('mailboxDirectoryStatus?: MailboxDirectoryStatus');
    expect(source).toContain("'unavailable'");
    expect(source).toContain('role="tablist"');
    expect(source).toContain('role="tabpanel"');
    expect(source).toContain('onkeydown={handleDirectoryTabKeydown}');
    expect(source).toContain("event.key === 'ArrowLeft'");
    expect(source).toContain("event.key === 'ArrowRight'");
    expect(source).toContain('Mailboxes');
    expect(source).toContain('provisionMailboxUsers');
    expect(source).toContain('createMailboxAccount');
    expect(source).toContain('changeMailboxRole');
    expect(source).toContain('deprovisionMailboxUser');
    expect(source).toContain('updateMailboxPassword');
    expect(source).toContain('destroyMailboxAccount');
    expect(source).toContain('name="emails"');
    expect(source).toContain('name="role"');
    expect(source).toContain('name="username"');
    expect(source).toContain('name="quotaMb"');
    expect(source).toContain('name="provisionRole"');
    expect(source).toContain('name="idempotencyKey"');
  });

  it('keeps sensitive controls explicit, labeled and password-safe', () => {
    const source = directory();

    for (const field of ['name="reason"', 'name="confirmation"', 'name="password"'])
      expect(source).toContain(field);
    expect(source).toContain('autocomplete="new-password"');
    expect(source).toContain('Type the exact email to confirm');
    expect(source).toContain('Permanent external action.');
    expect(source).toMatch(/mailbox-delete-confirm-[\s\S]*?type="text"/);
    expect(source).toContain('Stalwart validates and stores this password.');
    expect(source).toContain('formElement.reset()');
    expect(source).toContain('Credentials and password hashes are never sent to the browser.');
    expect(source).not.toMatch(/name=["'](?:hash|passwordHash|credentials)["']/i);
  });

  it('protects Antonny as the unique owner and excludes owner role choices', () => {
    const source = directory();

    expect(source).toContain("const OWNER_EMAIL = 'antonny.luty@j-aautomation.com'");
    expect(source).toContain('function isOwnerMailbox');
    expect(source).toContain('Unique Owner');
    expect(source).toContain('cannot be re-roled, offboarded or deleted');
    expect(source).toContain('!isOwnerMailbox(mailbox)');

    const mailboxRoleForm = source.slice(
      source.indexOf('data-mailbox-action="changeMailboxRole"'),
      source.indexOf('data-mailbox-action="deprovisionMailboxUser"'),
    );
    expect(mailboxRoleForm).not.toContain('value="owner_admin"');
  });

  it('offers a phone card representation and 44px keyboard-safe controls', () => {
    const source = directory();

    expect(source).toContain('team-directory__mailbox-table-wrapper');
    expect(source).toContain('team-directory__mailbox-cards');
    expect(source).toContain('data-mailbox-card={email}');
    expect(source).toContain('@media (max-width: 640px)');
    expect(source).toContain('@media (max-width: 720px)');
    expect(source).toContain('min-height: var(--ja-target-min, 2.75rem)');
    expect(source).toContain(':focus-visible');
    expect(source).toContain('aria-live="polite"');
  });

  it('passes the server capability and canonical-owner gate through PortalShell', () => {
    const shell = read('apps/portal/src/lib/PortalShell.svelte');

    expect(shell).toMatch(/(?:canManageMail=\{canManageMail\}|\{canManageMail\})/);
    expect(shell).toMatch(/(?:canonicalOwner=\{canonicalOwner\}|\{canonicalOwner\})/);
    expect(shell).toContain('mailboxDirectoryStatus={mailboxData.mailboxDirectoryStatus}');
    expect(shell).toContain("mailboxData.user.role === 'owner_admin' && canonicalOwner");
  });
});
