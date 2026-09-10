import type { DatabaseSync } from 'node:sqlite';
import {
  PortalRepository,
  V3Repository,
  SupplierWorkforceRepository,
  assertLiveSession,
  AccessDeniedError,
} from '@ja/database';
import type { Principal } from '@ja/domain';
import { runImmediateTransaction } from '../packages/database/src/core/transaction.ts';

export const TRAINING_BATCH = 'owner-training-20260910-v1';
const tag = '[DEMO 2026-09]';
const emails = {
  manager: 'manager-test@j-aautomation.com',
  worker: 'worker-test@j-aautomation.com',
  technician: 'technician-test@j-aautomation.com',
  coordinator: 'supplier-test@j-aautomation.com',
  finance: 'finance-test@j-aautomation.com',
  auditor: 'auditor-test@j-aautomation.com',
};
type DemoProject = {
  id: string;
  name: string;
  project_number: string;
  currency: 'USD';
  billing_model: string;
  client_id: string;
};
const day = (date: Date) => date.toISOString().slice(0, 10);
export function trainingPlan(sqlite: DatabaseSync) {
  const projects = sqlite
    .prepare(
      "SELECT p.id,p.name,p.project_number,p.currency,p.client_id,p.billing_model FROM project p JOIN client c ON c.id=p.client_id WHERE p.name LIKE '% · Demo' AND c.display_name LIKE '% · Demo' AND p.status='active' ORDER BY p.project_number",
    )
    .all() as DemoProject[];
  if (projects.length !== 4 || projects.some((p) => p.currency !== 'USD'))
    throw new Error('Expected exactly four explicitly named USD Demo projects');
  const users = Object.fromEntries(
    Object.entries(emails).map(([key, email]) => {
      const user = sqlite.prepare('SELECT id,role,status FROM user WHERE email=?').get(email) as
        | { id: string; role: string; status: string }
        | undefined;
      const expected =
        key === 'manager'
          ? 'project_manager'
          : key === 'finance'
            ? 'finance_admin'
            : key === 'auditor'
              ? 'auditor_read_only'
              : 'worker';
      if (!user || user.status !== 'active' || user.role !== expected)
        throw new Error(`Expected active training account: ${key}`);
      return [key, user.id];
    }),
  ) as Record<keyof typeof emails, string>;
  return { batch: TRAINING_BATCH, projects, users };
}

/** Additive, atomic training content through the normal audited domain commands.
 * The destructive disposable demo seed is deliberately not used here.
 * Caller must supply a real authenticated Owner principal for the target database.
 */
export function populateOwnerTraining(
  sqlite: DatabaseSync,
  principal: Principal,
  options: { financialHistory: boolean; subjectSessions: Record<string, string> },
) {
  assertLiveSession(sqlite, principal, AccessDeniedError);
  const owner = sqlite
    .prepare("SELECT 1 FROM user WHERE id=? AND role='owner_admin' AND status='active'")
    .get(principal.userId);
  if (!owner || principal.role !== 'owner_admin')
    throw new AccessDeniedError('Active Owner required');
  const actor = { ...principal, correlationId: TRAINING_BATCH };
  return runImmediateTransaction(sqlite, 'owner-training', () => {
    if (
      sqlite.prepare('SELECT 1 FROM audit_event WHERE correlation_id=? LIMIT 1').get(TRAINING_BATCH)
    )
      return { batch: TRAINING_BATCH, alreadyApplied: true };
    const plan = trainingPlan(sqlite);
    const repository = new PortalRepository(sqlite);
    const v3 = new V3Repository(sqlite);
    const suppliers = new SupplierWorkforceRepository(sqlite);
    for (const workerId of [plan.users.worker, plan.users.technician]) {
      if (!options.subjectSessions[workerId])
        throw new Error('Authenticated training subject session required');
      assertLiveSession(
        sqlite,
        repository.principalFor(workerId, options.subjectSessions[workerId]),
        AccessDeniedError,
      );
    }
    const subjectFor = (workerId: string) =>
      repository.principalFor(workerId, options.subjectSessions[workerId], TRAINING_BATCH);
    const now = new Date();
    const today = day(now);
    const first = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
    const startsOn = day(first);
    const counts: Record<string, number> = {};
    const ids: Record<string, string[]> = {};
    const track = (kind: string, id: string) => {
      counts[kind] = (counts[kind] ?? 0) + 1;
      (ids[kind] ??= []).push(id);
    };
    const profile = sqlite
      .prepare(
        "SELECT supplier_id FROM supplier_user_profile WHERE user_id=? AND profile='supplier_coordinator'",
      )
      .get(plan.users.coordinator) as { supplier_id: string } | undefined;
    if (
      !profile ||
      !sqlite
        .prepare(
          "SELECT 1 FROM supplier_user_profile WHERE user_id=? AND supplier_id=? AND profile='external_technician'",
        )
        .get(plan.users.technician, profile.supplier_id)
    )
      throw new Error('Training supplier profiles are not linked');
    const entity = sqlite
      .prepare(
        "SELECT id FROM legal_entity WHERE code='DEMO' AND legal_name LIKE '%Demonstration%' AND status='active'",
      )
      .get() as { id: string } | undefined;
    if (!entity) throw new Error('Explicit demonstration issuing entity required');
    const canonical = v3.createCanonicalLegalEntityRevision(actor, {
      legacyLegalEntityId: entity.id,
      effectiveFrom: startsOn,
      legalName: 'J&A Automation · Demonstration Invoice',
      taxIdentifier: 'DEMO-NOT-A-REAL-TAX-ID',
      registrationIdentifier: 'DEMO-TRAINING-ONLY',
      addressLine1: 'Fictional demonstration record — not for payment',
      locality: 'Demo City',
      region: 'Demo Region',
      postalCode: '00000',
      countryCode: 'US',
      baseCurrency: 'USD',
      timezone: 'UTC',
      reason: `${tag} Owner-authorized training history; not real company accounting`,
      idempotencyKey: `${TRAINING_BATCH}:legal-entity`,
    });
    const tax = repository.createTaxProfile(actor, {
      name: `${tag} Demonstration only — zero tax`,
      currency: 'USD',
      effectiveFrom: startsOn,
      components: [{ name: 'DEMO configuration', basisPoints: 0 }],
    });
    track('taxProfiles', tax.id);
    for (const project of plan.projects) {
      v3.assignCanonicalLegalEntityToProject(actor, {
        projectId: project.id,
        legalEntityRevisionId: canonical.revisionId,
        effectiveFrom: startsOn,
        reason: `${tag} Training issuing authority`,
        idempotencyKey: `${TRAINING_BATCH}:entity:${project.id}`,
      });

      for (const worker of [plan.users.worker, plan.users.manager]) {
        if (
          sqlite
            .prepare('SELECT 1 FROM project_member WHERE project_id=? AND user_id=?')
            .get(project.id, worker)
        )
          throw new Error('Training assignment already exists outside this batch');
        track(
          'assignments',
          repository.assignWorker(actor, {
            projectId: project.id,
            workerId: worker,
            startsOn,
            canReview: worker === plan.users.manager,
          }).id,
        );
      }
      track(
        'supplierGrants',
        suppliers.grantProject(actor, {
          supplierId: profile.supplier_id,
          projectId: project.id,
          coordinatorId: plan.users.coordinator,
          startsOn,
        }).id,
      );
      track(
        'assignments',
        suppliers.assignTechnician(actor, {
          workerId: plan.users.technician,
          projectId: project.id,
          startsOn,
        }).id,
      );
      for (const [workerId, rate] of [
        [plan.users.worker, 4200n],
        [plan.users.manager, 5500n],
        [plan.users.technician, 3900n],
      ] as const) {
        if (
          sqlite
            .prepare('SELECT 1 FROM compensation_rule WHERE worker_id=? AND project_id=?')
            .get(workerId, project.id)
        )
          throw new Error('Training compensation already exists outside this batch');
        track(
          'compensationRules',
          v3.createCompensationRule(actor, {
            workerId,
            projectId: project.id,
            currency: 'USD',
            rateMinor: rate,
            rateBasis: 'hourly',
            ruleType: 'Hourly',
            overtimeMethod: 'BASE_RATE_MULTIPLIER',
            overtimeMultiplierBps: 15000,
            travelMethod: 'BASE',
            standbyMethod: 'BASE',
            effectiveFrom: startsOn,
            notes: `${tag} Training rate; not a real pay agreement.`,
          }).id,
        );
        track(
          'costRules',
          v3.createInternalCostRule(actor, {
            workerId,
            projectId: project.id,
            currency: 'USD',
            hourlyRateMinor: rate + 1600n,
            effectiveFrom: startsOn,
            notes: `${tag} Training internal cost.`,
          }).id,
        );
      }
      // Preserve existing commercial rules. Add a rate only when this Demo project has none.
      if (!sqlite.prepare('SELECT 1 FROM client_labor_rate WHERE project_id=?').get(project.id))
        track(
          'clientRates',
          v3.createClientLaborRate(actor, {
            projectId: project.id,
            currency: 'USD',
            hourlyRateMinor: 12500n,
            effectiveFrom: startsOn,
            notes: `${tag} Training client rate.`,
          }).id,
        );
      for (let milestone = 0; milestone < 3; milestone++)
        track(
          'milestones',
          repository.createProjectMilestone(actor, {
            projectId: project.id,
            name: `${tag} ${['Controls design review', 'Site acceptance test', 'Handover and training'][milestone]}`,
            description: 'Demonstration deliverable for Owner editing and deletion.',
            amountMinor: BigInt(250000 + milestone * 150000),
            dueOn: day(new Date(now.getTime() + (milestone + 1) * 7 * 86400000)),
          }).id,
        );
    }
    const approvedExpenseIds: string[] = [];
    const tasks = [
      'Validate station interlocks and recovery sequence',
      'Commission HMI alarm navigation and diagnostics',
      'Test PLC-to-robot handshake and production counters',
      'Review network diagnostics and document acceptance tests',
      'Tune conveyor zone timing and check sensor alignment',
      'Prepare technical handover and operator training',
    ];
    let index = 0;
    for (let date = new Date(first); day(date) <= today; date.setUTCDate(date.getUTCDate() + 1)) {
      if (date.getUTCDay() === 0 || date.getUTCDay() === 6) continue;
      const workDate = day(date),
        project = plan.projects[index % plan.projects.length]!;
      const age = Math.floor((now.getTime() - date.getTime()) / 86400000);
      for (const [workerIndex, workerId] of [
        plan.users.worker,
        plan.users.technician,
        plan.users.manager,
      ].entries()) {
        const category =
          index % 9 === 0
            ? 'travel'
            : index % 7 === 0
              ? 'standby'
              : index % 3 === 0
                ? 'commissioning'
                : 'regular';
        const time = repository.createTimeEntry(
          actor,
          {
            projectId: project.id,
            workDate,
            category,
            minutes: workerIndex === 2 ? 120 : 420 + (index % 3) * 30,
            summary: `${tag} ${tasks[(index + workerIndex) % tasks.length]} — ${workDate}`,
          },
          workerId,
        );
        track('time', time.id);
        if (age > 1) {
          repository.submitTime(actor, time.id, time.version);
          if (age > 5) {
            repository.operationalApproveTime(actor, time.id, 'approved');
            repository.financeApproveTime(actor, time.id, true);
          }
        }
        if (workerIndex < 2 && index % 3 !== 1) {
          const report = repository.createDailyReport(
            actor,
            {
              projectId: project.id,
              workDate,
              summary: `${tag} ${tasks[(index + workerIndex) % tasks.length]}`,
              tasksCompleted:
                'Completed I/O checks, documented results and reviewed the next commissioning stage.',
              siteShift: `DEMO site — ${workerIndex === 0 ? 'day' : 'support'} shift`,
              problemsFound:
                index % 4 === 0
                  ? 'Intermittent fieldbus timeout during the training scenario.'
                  : 'No blocking findings in this training scenario.',
              correctiveActions:
                'Reviewed simulated traces and confirmed the documented reset procedure.',
              downtimeMinutes: index % 4 === 0 ? 30 : 0,
              nextDayPlan: 'Continue acceptance tests and update the handover checklist.',
              safetyRelated: false,
            },
            workerId,
          );
          track('dailyReports', report.id);
          if (age > 1) {
            repository.submitReport(subjectFor(workerId), 'daily', report.id, report.version);
            if (age > 5) repository.reviewReport(actor, 'daily', report.id, 'approved');
          }
          const categories = ['hotel', 'meals', 'transport', 'rental_car'];
          const expense = repository.createExpense(
            actor,
            {
              projectId: project.id,
              spentOn: workDate,
              category: categories[(index + workerIndex) % categories.length]!,
              vendor: `${tag} ${['Training Hotel', 'Demo Catering', 'Demo Transport', 'Training Car Rental'][(index + workerIndex) % 4]}`,
              description: `Training expense for ${project.project_number}; fictional purchase, no real receipt.`,
              currency: 'USD',
              amountMinor: BigInt(3500 + index * 125 + workerIndex * 275),
              whoPaid: 'worker',
              clientTreatment: index % 4 === 0 ? 'all_in' : 'reimbursable',
              billingTreatment: index % 4 === 0 ? 'all_in' : 'reimbursable_at_cost',
              receiptRequired: false,
              paymentMethod: 'DEMO — fictional payment',
            },
            workerId,
          );
          track('expenses', expense.id);
          if (age > 1) {
            const classified = repository.classifyExpenseCommercially(actor, {
              expenseId: expense.id,
              expectedVersion: expense.version,
              clientTreatment: index % 4 === 0 ? 'all_in' : 'reimbursable',
              billingTreatment: index % 4 === 0 ? 'all_in' : 'reimbursable_at_cost',
              markupBps: 0,
              taxBps: 0,
              reason: `${tag} Training classification`,
              idempotencyKey: `${TRAINING_BATCH}:expense:${expense.id}`,
            });
            repository.submitExpense(actor, expense.id, classified.version);
            if (age > 5) {
              repository.operationalApproveExpense(actor, expense.id, 'approved');
              repository.financeApproveExpense(actor, expense.id);
              approvedExpenseIds.push(expense.id);
            }
          }
        }
        if (workerIndex === 1 && index % 3 === 0) {
          const report = repository.createTechnicalReport(
            actor,
            {
              projectId: project.id,
              reportDate: workDate,
              systemName: `${tag} PLC station ${index + 1}`,
              controller: 'DEMO PLC',
              changeSummary: tasks[index % tasks.length]!,
              validation: 'Simulated dry-cycle checks completed with expected transitions.',
              rollbackPlan: 'Training example: restore the documented previous routine.',
              safetyRelated: false,
            },
            workerId,
          );
          track('technicalReports', report.id);
          if (age > 1) {
            repository.submitReport(subjectFor(workerId), 'technical', report.id, report.version);
            if (age > 5) repository.reviewReport(actor, 'technical', report.id, 'approved');
          }
        }
      }
      index++;
    }
    for (let offset = 1; offset <= 14; offset++) {
      const date = new Date(now.getTime() + offset * 86400000);
      if ([0, 6].includes(date.getUTCDay())) continue;
      for (const workerId of [plan.users.worker, plan.users.technician])
        track(
          'planning',
          repository.createPlanningAssignment(actor, {
            projectId: plan.projects[offset % 4]!.id,
            workerId,
            startsAt: `${day(date)}T08:00:00.000Z`,
            endsAt: `${day(date)}T16:00:00.000Z`,
            plannedMinutes: 480,
            site: `${tag} Demonstration commissioning site`,
          }).id,
        );
    }
    // Financial history is opt-in because issued records cannot later be erased.
    if (options.financialHistory) {
      for (const [index, id] of approvedExpenseIds.entries())
        if (index % 3 === 0) {
          v3.recordReimbursement(actor, {
            expenseId: id,
            reference: `${tag} SIMULATED reimbursement — no bank transfer`,
          });
          track('reimbursements', id);
        }
      const lastMonthEnd = day(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0)));
      const periods = [
        [startsOn, startsOn.slice(0, 8) + '07'],
        [startsOn.slice(0, 8) + '20', lastMonthEnd],
      ];
      let issuedIndex = 0;
      for (const project of plan.projects) {
        for (const streamType of ['labor', 'expense'] as const) {
          // Preserve existing fixed-price commercial configuration; demonstrate its
          // reimbursable expenses without inventing or repeating a project fixed fee.
          if (streamType === 'labor' && project.billing_model === 'all_in') continue;
          const rule = repository.createBillingRule(actor, {
            projectId: project.id,
            legalEntityId: entity.id,
            streamType,
            cadenceType: 'custom',
            taxProfileId: tax.id,
            currency: 'USD',
            effectiveFrom: startsOn,
            autoGenerateDraft: false,
            paymentTermsDays: 30,
            poNumberOverride: `${tag} NOT FOR PAYMENT`,
          });
          track('billingRules', rule.id);
          for (const [from, to] of periods) {
            const table = streamType === 'labor' ? 'time_entry' : 'expense';
            const dateColumn = streamType === 'labor' ? 'work_date' : 'spent_on';
            const eligible = sqlite
              .prepare(
                `SELECT id FROM ${table} WHERE project_id=? AND ${dateColumn} BETWEEN ? AND ? AND approval_state='approved' AND invoice_id IS NULL ${streamType === 'expense' ? "AND billing_treatment='reimbursable_at_cost'" : "AND billability_state='billable'"}`,
              )
              .all(project.id, from!, to!) as { id: string }[];
            if (!eligible.length) continue;
            const batchSources = new Set(ids[streamType === 'labor' ? 'time' : 'expenses']);
            if (eligible.some((row) => !batchSources.has(row.id)))
              throw new Error(
                'Invoice window contains pre-existing sources; refusing to include them',
              );
            const invoice = repository.createInvoiceDraft(actor, rule.id, from!, to!);
            const reserved = sqlite
              .prepare('SELECT source_type,source_id FROM invoice_source WHERE invoice_id=?')
              .all(invoice.id) as { source_type: string; source_id: string }[];
            if (
              reserved.some((source) =>
                source.source_type === 'time'
                  ? !ids.time?.includes(source.source_id)
                  : source.source_type === 'expense'
                    ? !ids.expenses?.includes(source.source_id)
                    : true,
              )
            )
              throw new Error('Invoice reserved a source outside this training batch');
            track('invoices', invoice.id);
            // Keep one quarter as editable drafts; the rest cover paid, partial and unpaid.
            if (issuedIndex % 4 !== 3) {
              repository.approveInvoiceDraft(actor, invoice.id);
              repository.issueInvoice(actor, invoice.id, 'en');
              track('issuedInvoices', invoice.id);
              const total = sqlite
                .prepare('SELECT CAST(total_minor AS TEXT) amount FROM invoice WHERE id=?')
                .get(invoice.id) as { amount: string };
              if (issuedIndex % 4 < 2) {
                const amount = BigInt(total.amount) / (issuedIndex % 4 === 0 ? 1n : 2n);
                const payment = v3.recordPayment(actor, {
                  invoiceId: invoice.id,
                  amountMinor: amount,
                  currency: 'USD',
                  receivedAt: new Date().toISOString(),
                  reference: `${tag} SIMULATED receipt — no bank transaction`,
                  idempotencyKey: `${TRAINING_BATCH}:receipt:${invoice.id}`,
                });
                track('payments', payment.id);
              }
              // Preserve the event but quarantine it atomically before any jobs can deliver it.
              sqlite
                .prepare(
                  "UPDATE outbox_event SET failed_at=?,lease_until=NULL,last_error='DEMO_TRAINING_NO_EXTERNAL_DELIVERY' WHERE topic='invoice.issued' AND aggregate_id=? AND delivered_at IS NULL AND failed_at IS NULL",
                )
                .run(new Date().toISOString(), invoice.id);
            }
            issuedIndex++;
          }
        }
        for (const workerId of [plan.users.worker, plan.users.technician]) {
          const existingSources = sqlite
            .prepare(
              "SELECT id FROM time_entry WHERE worker_id=? AND project_id=? AND work_date BETWEEN ? AND ? AND approval_state IN ('approved','locked')",
            )
            .all(workerId, project.id, startsOn, lastMonthEnd) as { id: string }[];
          const batchTime = new Set(ids.time);
          if (existingSources.some((row) => !batchTime.has(row.id)))
            throw new Error('Settlement period contains pre-existing time; refusing to include it');
          const settlements = v3.settleCompensation(actor, {
            workerId,
            projectId: project.id,
            periodStart: startsOn,
            periodEnd: lastMonthEnd,
          });
          for (const settlement of settlements) track('settlements', settlement.id);
        }
      }
    }
    return {
      batch: TRAINING_BATCH,
      alreadyApplied: false,
      financialHistory: options.financialHistory,
      counts,
      ids,
      projects: plan.projects.map((p) => p.project_number),
    };
  });
}
