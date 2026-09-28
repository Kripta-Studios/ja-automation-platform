import { beforeEach, describe, expect, it, vi } from 'vitest';

const openPortalRepository = vi.fn();

vi.mock('$lib/server/portal-repository', () => ({ openPortalRepository }));
vi.mock('@ja/database', () => ({ MailIdentityRepository: class {} }));
vi.mock('$lib/server/mail-directory', () => ({ listMailboxAccounts: vi.fn() }));

const { sectionLoad } = await import('../../apps/portal/src/routes/app/[section]/section-load.ts');

function event(role: 'worker' | 'auditor_read_only' | 'project_manager') {
  return {
    locals: {
      user: { id: `${role}-1`, role, status: 'active' },
      session: { id: `${role}-session`, userId: `${role}-1` },
    },
    params: { section: 'approvals' },
    url: new URL('http://localhost/j-aautomation/app/approvals'),
  } as never;
}

describe('section load authorization order', () => {
  beforeEach(() => vi.clearAllMocks());

  it.each(['worker', 'auditor_read_only'] as const)(
    'returns controlled 403 before repository construction for %s Approvals access',
    async (role) => {
      openPortalRepository.mockImplementation(() => {
        throw new Error('repository must not be opened for forbidden approvals access');
      });

      await expect(sectionLoad(event(role))).rejects.toMatchObject({ status: 403 });
      expect(openPortalRepository).not.toHaveBeenCalled();
    },
  );

  it('continues to repository construction for a permitted project-manager Approvals load', async () => {
    openPortalRepository.mockImplementation(() => {
      throw new Error('permitted role reached repository construction');
    });

    await expect(sectionLoad(event('project_manager'))).rejects.toThrow(
      'permitted role reached repository construction',
    );
    expect(openPortalRepository).toHaveBeenCalledTimes(1);
  });
});
