import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  PortalRepository,
  V3Repository,
  createDatabase,
  withCommercialRuleSnapshot,
} from '@ja/database';
import type { Principal, Role } from '@ja/domain';
import {
  resolveAssignmentCommercialTerms,
  resolveClientLaborRule,
  resolveInternalCostRule,
  resolveWorkerCompensationRule,
} from '../../packages/database/src/domains/commercial/assignment-commercial-terms.ts';
import { buildMoneyOverview } from '../../apps/portal/src/lib/server/money-overview.ts';
import { buildRatesOverview } from '../../apps/portal/src/lib/server/rates-overview.ts';
import {
  installB5TestDeploymentIdentity,
  seedB5ServiceActorBinding,
} from '../fixtures/b5-test-environment.js';

const directories: string[] = [];
const restores: Array<() => void> = [];
beforeEach(() => {
  restores.push(installB5TestDeploymentIdentity());
});
afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
  for (const restore of restores.splice(0).reverse()) restore();
});

type Sqlite = ReturnType<typeof createDatabase>['sqlite'];

function seedUser(sqlite: Sqlite, id: string, role: Role): void {
  const now = new Date().toISOString();
  sqlite
    .prepare(
      'INSERT INTO user(id,name,email,role,status,email_verified,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)',
    )
    .run(
      id,
      id,
      role === 'owner_admin' ? 'antonny.luty@j-aautomation.com' : `${id}@example.com`,
      role,
      'active',
      1,
      now,
      now,
    );
}

function steppedUp(sqlite: Sqlite, principal: Principal, label: string): Principal {
  const now = new Date().toISOString();
  const sessionId = `snapshot-${principal.userId}-${label}`;
  sqlite
    .prepare(
      'INSERT INTO session(id,token,user_id,expires_at,created_at,updated_at,step_up_at) VALUES(?,?,?,?,?,?,?)',
    )
    .run(
      sessionId,
      `${sessionId}-token`,
      principal.userId,
      new Date(Date.now() + 3_600_000).toISOString(),
      now,
      now,
      now,
    );
  return { ...principal, sessionId };
}

const json = (value: unknown) =>
  JSON.parse(JSON.stringify(value, (_key, item) => (typeof item === 'bigint' ? `${item}n` : item)));

/**
 * Two projects in two currencies, project-default, per-person and per-category client
 * rates, an assignment override, a rate change mid-period, project and global pay/cost
 * rules (with and without the global fallback) and one person without any client rate.
 */
function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'ja-finance-snapshot-'));
  directories.push(directory);
  const { sqlite } = createDatabase(join(directory, 'app.db'));
  const repository = new PortalRepository(sqlite);
  const v3 = new V3Repository(sqlite);
  for (const [id, role] of [
    ['owner', 'owner_admin'],
    ['finance', 'finance_admin'],
    ['manager', 'project_manager'],
    ['worker-a', 'worker'],
    ['worker-b', 'worker'],
    ['worker-c', 'worker'],
  ] as const)
    seedUser(sqlite, id, role);
  seedB5ServiceActorBinding(sqlite, 'owner');
  const owner = steppedUp(
    sqlite,
    { userId: 'owner', role: 'owner_admin', projectIds: new Set() },
    'owner',
  );
  const finance = steppedUp(
    sqlite,
    { userId: 'finance', role: 'finance_admin', projectIds: new Set() },
    'finance',
  );
  const projects = (['USD', 'EUR'] as const).map((currency, index) => {
    const client = repository.createClient(owner, {
      legalName: `Snapshot Client ${currency}`,
      displayName: `Snapshot Client ${currency}`,
      currency,
      timezone: 'UTC',
      billingAddress: '1 Snapshot Way',
      billingEmail: `ap-${index}@example.com`,
      paymentTermsDays: 30,
    });
    return repository.createProject(owner, {
      costCenterCode: `QA-SNAPSHOT-${index + 1}`,
      clientId: client.id,
      name: `Snapshot ${currency} plant`,
      timezone: 'UTC',
      currency,
      billingModel: 'tm',
      expectedMinutesPerDay: 600,
    });
  });
  const [usd, eur] = projects as [(typeof projects)[0], (typeof projects)[0]];
  repository.assignWorker(owner, {
    projectId: usd.id,
    workerId: 'manager',
    startsOn: '2026-08-01',
    canReview: true,
  });
  repository.assignWorker(owner, {
    projectId: eur.id,
    workerId: 'manager',
    startsOn: '2026-08-01',
    canReview: true,
  });
  const assignment: Record<string, { id: string }> = {};
  for (const worker of ['worker-a', 'worker-b', 'worker-c'])
    assignment[`usd:${worker}`] = repository.assignWorker(owner, {
      projectId: usd.id,
      workerId: worker,
      startsOn: '2026-08-01',
    });
  assignment['eur:worker-a'] = repository.assignWorker(owner, {
    projectId: eur.id,
    workerId: 'worker-a',
    startsOn: '2026-08-01',
  });

  // USD: project default changes on 08-10; worker-b has a personal rate; overtime rate by category.
  v3.createClientLaborRate(finance, {
    projectId: usd.id,
    currency: 'USD',
    hourlyRateMinor: 7_000n,
    effectiveFrom: '2026-08-01',
    effectiveTo: '2026-08-09',
  });
  v3.createClientLaborRate(finance, {
    projectId: usd.id,
    currency: 'USD',
    hourlyRateMinor: 7_550n,
    effectiveFrom: '2026-08-10',
  });
  const personal = v3.createClientLaborRate(finance, {
    projectId: usd.id,
    workerId: 'worker-b',
    currency: 'USD',
    hourlyRateMinor: 9_125n,
    effectiveFrom: '2026-08-01',
  });
  v3.createClientLaborRate(finance, {
    projectId: usd.id,
    category: 'overtime',
    currency: 'USD',
    hourlyRateMinor: 11_333n,
    effectiveFrom: '2026-08-01',
  });
  v3.createAssignmentRateOverride(finance, {
    projectMemberId: assignment['usd:worker-b']!.id,
    timeCategory: 'regular',
    clientLaborRateId: personal.id,
    effectiveFrom: '2026-08-05',
    priority: 5,
  });
  // Pay and cost: project rules for a and b, global rule for c (fallback off), global for a on EUR.
  for (const [worker, rate] of [
    ['worker-a', 4_010n],
    ['worker-b', 4_555n],
  ] as const) {
    v3.createCompensationRule(finance, {
      workerId: worker,
      projectId: usd.id,
      currency: 'USD',
      ruleType: 'Hourly',
      rateMinor: rate,
      rateBasis: 'hourly',
      effectiveFrom: '2026-08-01',
    });
    v3.createInternalCostRule(finance, {
      workerId: worker,
      projectId: usd.id,
      currency: 'USD',
      hourlyRateMinor: rate + 333n,
      effectiveFrom: '2026-08-01',
    });
  }
  v3.createCompensationRule(finance, {
    workerId: 'worker-c',
    currency: 'USD',
    ruleType: 'Hourly',
    rateMinor: 3_999n,
    rateBasis: 'hourly',
    effectiveFrom: '2026-08-01',
  });
  v3.createClientLaborRate(finance, {
    projectId: eur.id,
    currency: 'EUR',
    hourlyRateMinor: 6_789n,
    effectiveFrom: '2026-08-01',
  });
  v3.createCompensationRule(finance, {
    workerId: 'worker-a',
    projectId: eur.id,
    currency: 'EUR',
    ruleType: 'Hourly',
    rateMinor: 3_210n,
    rateBasis: 'hourly',
    effectiveFrom: '2026-08-01',
  });
  v3.createInternalCostRule(finance, {
    workerId: 'worker-a',
    projectId: eur.id,
    currency: 'EUR',
    hourlyRateMinor: 3_500n,
    effectiveFrom: '2026-08-01',
  });

  const manager = steppedUp(sqlite, repository.principalFor('manager'), 'review');
  const entries: Array<{ projectId: string; worker: string; date: string; category: string }> =
    [];
  const days = ['2026-08-03', '2026-08-04', '2026-08-06', '2026-08-11', '2026-08-12'];
  for (const date of days) {
    for (const worker of ['worker-a', 'worker-b', 'worker-c'])
      for (const [category] of [
        ['regular', 437],
        ['overtime', 73],
      ] as const)
        entries.push({ projectId: usd.id, worker, date, category });
    entries.push({ projectId: eur.id, worker: 'worker-a', date, category: 'regular' });
  }
  const workers = new Map(
    ['worker-a', 'worker-b', 'worker-c'].map((id) => [
      id,
      steppedUp(sqlite, repository.principalFor(id), 'time'),
    ]),
  );
  for (const [index, entry] of entries.entries()) {
    const worker = workers.get(entry.worker)!;
    const row = repository.createTimeEntry(worker, {
      projectId: entry.projectId,
      workDate: entry.date,
      category: entry.category as 'regular' | 'overtime',
      minutes: entry.category === 'overtime' ? 73 : 437 - (index % 7),
      summary: `Snapshot work ${index}`,
    });
    repository.submitTime(worker, row.id, row.version);
    // Leave a few entries pending so unapproved work is exercised too.
    if (index % 5 === 4) continue;
    repository.operationalApproveTime(manager, row.id, 'approved');
    repository.financeApproveTime(finance, row.id, true);
  }
  return { sqlite, v3, owner, usd, eur, entries, days };
}

describe('finance rule snapshot', () => {
  it('resolves exactly the same rules with and without the in-memory snapshot', () => {
    const { sqlite, usd, eur, days } = fixture();
    const contexts = [usd.id, eur.id].flatMap((projectId) =>
      ['worker-a', 'worker-b', 'worker-c', 'manager', 'nobody'].flatMap((workerId) =>
        [...days, '2026-07-31', '2026-08-09', '2026-08-10', '2027-01-01'].flatMap((workDate) =>
          ['regular', 'overtime', 'travel'].flatMap((category) =>
            [null, '', 'A1'].map((activityCode) => ({
              projectId,
              workerId,
              workDate,
              category,
              activityCode,
            })),
          ),
        ),
      ),
    );
    const resolveAll = () =>
      contexts.map((context) => [
        resolveClientLaborRule(sqlite, context),
        resolveWorkerCompensationRule(sqlite, context),
        resolveInternalCostRule(sqlite, context),
        resolveAssignmentCommercialTerms(sqlite, context),
      ]);
    const direct = json(resolveAll());
    const snapshot = json(withCommercialRuleSnapshot(sqlite, resolveAll));
    expect(snapshot).toEqual(direct);
    // The fixture really exercises personal, override, category and missing paths.
    const sources = new Set(
      (direct as Array<Array<{ selected?: { provenance?: { source?: string } } | null }>>)
        .map((row) => row[0]?.selected?.provenance?.source)
        .filter(Boolean),
    );
    expect(sources).toEqual(
      new Set(['project_default', 'worker_project', 'assignment_override']),
    );
  });

  it('keeps project finance, portfolio and Money totals equal to the unsnapshotted calculation', () => {
    const { v3, owner, usd, eur, sqlite } = fixture();
    // Reference: the calculation core without any snapshot (every rule read from SQL).
    const core = (
      v3 as unknown as {
        projectFinanceCore: (id: string, from?: string, to?: string) => unknown;
      }
    ).projectFinanceCore.bind(v3);
    for (const [from, to] of [
      [undefined, undefined],
      ['2026-08-01', '2026-08-09'],
      ['2026-08-10', '2026-08-31'],
    ] as const)
      for (const project of [usd, eur])
        expect(json(v3.projectFinance(owner, project.id, from, to))).toEqual(
          json(core(project.id, from, to)),
        );

    const portfolio = v3.financePortfolio(owner, '2026-08-01', '2026-08-31');
    const usdRow = portfolio.projects.find((row) => row.projectId === usd.id)!;
    expect(json(usdRow)).toEqual(
      json({
        ...usdRow,
        ...(core(usd.id, '2026-08-01', '2026-08-31') as Record<string, unknown>),
      }),
    );

    const today = '2026-08-20';
    const full = buildMoneyOverview(v3, owner, 'this_month', {
      includeArchived: true,
      today,
      limit: 500,
    });
    // Exact per-currency totals: the sum of the per-project rows, never mixed.
    for (const totals of full.currencies) {
      const rows = full.projects.filter((row) => row.currency === totals.currency);
      const sum = (key: 'workValueMinor' | 'costMinor' | 'readyToInvoiceMinor') =>
        rows.reduce((total, row) => total + BigInt(row[key]), 0n).toString();
      expect(totals.workValueMinor).toBe(sum('workValueMinor'));
      expect(totals.costsMinor).toBe(sum('costMinor'));
      expect(totals.readyToInvoiceMinor).toBe(sum('readyToInvoiceMinor'));
    }
    expect(full.currencies.map((row) => row.currency)).toEqual(['EUR', 'USD']);
    expect(BigInt(full.currencies[1]!.workValueMinor)).toBeGreaterThan(0n);
    expect(full.currencies[1]!.workValueMinor).toBe(String(usdRow.revenueCandidateMinor));

    // Paging and search change the list, never the totals.
    const firstPage = buildMoneyOverview(v3, owner, 'this_month', {
      includeArchived: true,
      today,
      limit: 1,
    });
    expect(firstPage.currencies).toEqual(full.currencies);
    expect(firstPage.projects).toEqual(full.projects.slice(0, 1));
    expect(firstPage.projectList).toMatchObject({ active: 2, matches: 2, limit: 1 });
    const searched = buildMoneyOverview(v3, owner, 'this_month', {
      includeArchived: true,
      today,
      search: 'snapshot eur',
    });
    expect(searched.currencies).toEqual(full.currencies);
    expect(searched.projects.map((row) => row.projectId)).toEqual([eur.id]);

    // Rates: counts for every project, people only for the opened project.
    const projects = sqlite
      .prepare('SELECT id,project_number,name,currency,client_id,status FROM project')
      .all() as Array<Record<string, unknown>>;
    const list = buildRatesOverview(sqlite, v3, owner, projects, { today });
    expect(list.people).toEqual([]);
    expect(list.rules).toEqual([]);
    expect(list.projects.find((row) => row.id === usd.id)).toMatchObject({
      peopleCount: 4,
      missingCount: 0,
      defaultRateMinor: '7550',
    });
    const opened = buildRatesOverview(sqlite, v3, owner, projects, {
      today,
      openProjectId: usd.id,
    });
    expect(opened.people.map((row) => row.workerId).sort()).toEqual([
      'manager',
      'worker-a',
      'worker-b',
      'worker-c',
    ]);
    expect(opened.people.find((row) => row.workerId === 'worker-b')).toMatchObject({
      clientRateMinor: '9125',
      clientSource: 'assignment_override',
    });
    expect(opened.rules.length).toBeGreaterThan(0);
    expect(opened.rules.every((rule) => !rule.projectId || rule.projectId === usd.id)).toBe(true);
  });
});
