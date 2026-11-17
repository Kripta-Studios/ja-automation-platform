import { describe, expect, it } from 'vitest';
import {
  compensationRuleInputSchema,
  compensationSettlementInputSchema,
  internalCostRuleInputSchema,
  milestoneInputSchema,
  planningAssignmentInputSchema,
  scheduleInputSchema,
} from '@ja/schemas';

const legacyProjectId = 'project-cp020-bbs-mexico';
const workerId = '11111111-1111-4111-8111-111111111111';

describe('schemas accept retained imported project ids', () => {
  it('planning assignment accepts the BBS Mexico project id', () => {
    const parsed = planningAssignmentInputSchema.safeParse({
      projectId: legacyProjectId,
      workerId,
      startsAt: '2026-11-18T07:00:00Z',
      endsAt: '2026-11-18T15:00:00Z',
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects malformed project ids', () => {
    for (const projectId of ['', ' ', '../etc', 'a b', '<x>']) {
      expect(
        planningAssignmentInputSchema.safeParse({
          projectId,
          workerId,
          startsAt: '2026-11-18T07:00:00Z',
        }).success,
      ).toBe(false);
    }
  });

  it('other project-scoped schemas accept the imported id', () => {
    expect(
      milestoneInputSchema.safeParse({
        projectId: legacyProjectId,
        name: 'Commissioning',
        amountMinor: '1500',
      }).error?.issues.some((issue) => issue.path[0] === 'projectId') ?? false,
    ).toBe(false);
    expect(
      scheduleInputSchema.safeParse({ projectId: legacyProjectId, timezone: 'UTC' }).error?.issues
        .some((issue) => issue.path[0] === 'projectId') ?? false,
    ).toBe(false);
    for (const schema of [
      compensationRuleInputSchema,
      compensationSettlementInputSchema,
      internalCostRuleInputSchema,
    ]) {
      const result = schema.safeParse({ projectId: legacyProjectId, workerId });
      expect(result.error?.issues.some((issue) => issue.path[0] === 'projectId') ?? false).toBe(
        false,
      );
    }
  });
});
