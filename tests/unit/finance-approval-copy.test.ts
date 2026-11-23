import { describe, expect, it } from 'vitest';
import { approvalQueueText } from '../../apps/portal/src/lib/portal/sections/approval-queue-copy';

describe('Finance approval queue copy (D6, T04)', () => {
  it('tells Finance that the owner or PM approves, in every language', () => {
    const en = approvalQueueText('en', 'helpFinance');
    expect(en).toMatch(/owner or the project manager/u);
    expect(en).not.toMatch(/approve it/u);
    expect(approvalQueueText('es', 'helpFinance')).toMatch(/propietario o el jefe de proyecto/u);
    expect(approvalQueueText('pt', 'helpFinance')).toMatch(/proprietário ou pelo gerente/u);
  });
});
