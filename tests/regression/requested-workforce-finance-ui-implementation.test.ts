import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string): string => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('workforce and finance UI implementation contracts', () => {
  it('loads an authorized admin worker target and keeps workers self-scoped otherwise', () => {
    const source = read('apps/portal/src/routes/app/[section]/section-load.ts');
    const profile = source.slice(
      source.indexOf("case 'profile':"),
      source.indexOf("case 'notifications':"),
    );

    expect(profile).toContain('listAllWorkers');
    expect(profile).toContain("worker.status === 'active'");
    expect(profile).toContain("url.searchParams.get('worker')");
    expect(profile).toContain('selectedWorkerId');
    expect(profile).toContain('workerSkills');
    expect(profile).toContain('listWorkerAvailability');
    expect(profile).toMatch(/: context\.principal\.userId/);

    const actions = read('apps/portal/src/lib/server/actions/operations-actions.ts');
    const setSkill = actions.slice(
      actions.indexOf('setWorkerSkill:'),
      actions.indexOf('updateSkill:'),
    );
    expect(setSkill).toContain("params.section !== 'profile'");
  });

  it('exposes finance rule registers through authorized V3 list contracts', () => {
    const source = read('apps/portal/src/routes/app/[section]/section-load.ts');
    const finance = source.slice(
      source.indexOf("case 'finance':"),
      source.indexOf("case 'ledger':"),
    );

    expect(finance).toContain('listCompensationRules');
    expect(finance).toContain('listClientLaborRates');
    expect(finance).toContain('listInternalCostRules');
    expect(finance).toContain('listCompensationRules(context.principal)');
  });

  it('keeps financial edits record-scoped and lifecycle-safe', () => {
    const actions = read('apps/portal/src/lib/server/actions/finance-actions.ts');
    const registered = read('apps/portal/src/routes/app/[section]/section-actions.ts');
    const section = read('apps/portal/src/lib/portal/sections/FinanceConfigurationSection.svelte');

    for (const action of [
      'supersedeCompensationRule',
      'deactivateCompensationRule',
      'supersedeClientLaborRate',
      'deactivateClientLaborRate',
      'supersedeInternalCostRule',
      'deactivateInternalCostRule',
    ]) {
      expect(actions).toContain(action);
      expect(registered).toContain(`${action}: financeActions.${action}`);
      expect(section).toContain(`?/${action}`);
    }
    expect(section).toMatch(/name="(?:supersedesId|ruleId)"/);
    expect(section).toContain('Settlements are immutable financial snapshots');
    expect(section).not.toMatch(/action="\?\/delete(?:Compensation|Client|Internal)/i);
  });
});
