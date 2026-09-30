import { describe, expect, it, vi } from 'vitest';
import { AccessDeniedError, PortalRepository } from '@ja/database';

describe('tax profile metadata keeps repository read authorization', () => {
  function exercise(role: string, active = true) {
    const all = vi.fn(() => []);
    const prepare = vi.fn(() => ({ all }));
    const assertReadable = vi.fn(() => {
      if (!active) throw new AccessDeniedError('Active session required');
    });
    const repository = Object.assign(Object.create(PortalRepository.prototype), {
      sqlite: { prepare },
      assertReadable,
    }) as PortalRepository;
    const principal = { role } as never;
    return { read: () => repository.listTaxProfiles(principal), all, prepare, assertReadable };
  }
  it.each(['worker', 'project_manager', 'customer'])(
    'denies %s before reading profiles',
    (role) => {
      const { read, prepare, all } = exercise(role);
      expect(read).toThrow(AccessDeniedError);
      expect(prepare).not.toHaveBeenCalled();
      expect(all).not.toHaveBeenCalled();
    },
  );
  it.each(['owner_admin', 'finance_admin', 'auditor_read_only'])(
    'keeps %s authorized reads',
    (role) => {
      const { read, prepare, all, assertReadable } = exercise(role);
      expect(read()).toEqual([]);
      expect(assertReadable).toHaveBeenCalledOnce();
      expect(prepare).toHaveBeenCalledOnce();
      expect(all).toHaveBeenCalledOnce();
    },
  );
  it('denies an inactive Finance session before reading metadata', () => {
    const { read, prepare } = exercise('finance_admin', false);
    expect(read).toThrow(AccessDeniedError);
    expect(prepare).not.toHaveBeenCalled();
  });
});
