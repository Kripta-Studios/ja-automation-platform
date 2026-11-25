import { describe, expect, it } from 'vitest';
import { projectHeaderReference } from '../../apps/portal/src/lib/portal/project-ux-round3-copy';

describe('project page header reference', () => {
  it('shows client code and cost center', () => {
    expect(
      projectHeaderReference({
        client_code: '022',
        client_number: 'C-0007',
        cost_center_code: '001',
        project_number: '022-001',
      }),
    ).toBe('022-001');
  });

  it('falls back to the client number when the client has no code', () => {
    expect(
      projectHeaderReference({ client_code: ' ', client_number: '123', cost_center_code: '004' }),
    ).toBe('123-004');
  });

  it('falls back to the project number when the cost center is missing', () => {
    expect(
      projectHeaderReference({ client_code: '022', cost_center_code: null, project_number: 'IMPC-001' }),
    ).toBe('IMPC-001');
  });
});
