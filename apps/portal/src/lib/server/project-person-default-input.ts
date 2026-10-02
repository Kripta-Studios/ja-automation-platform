import { z } from 'zod';
import { clientRecordIdSchema } from '@ja/schemas';
const amount = z
  .string()
  .trim()
  .regex(/^\d{1,10}(?:[.,]\d{1,2})?$/);
export const projectPersonConfigSchema = z
  .object({
    customerHourlyRate: amount,
    internalCostHourlyRate: amount,
    workerPayType: z.enum([
      'Hourly',
      'Daily',
      'FixedPerBillingPeriod',
      'FixedProjectAmount',
      'PercentageOfEligibleClientLabor',
    ]),
    workerPayAmount: amount,
    percentageBasis: z.enum([
      'CLIENT_LABOR_BEFORE_TAX',
      'CLIENT_LABOR_AFTER_APPROVED_DISCOUNT',
      'ISSUED_ELIGIBLE_LABOR',
      'COLLECTED_ELIGIBLE_LABOR',
    ]),
    expensePayer: z.enum(['worker', 'company_card', 'company_direct', 'client', 'third_party']),
    workerReimbursement: z.enum(['at_cost', 'none']),
    clientRecovery: z.enum(['at_cost', 'markup', 'included', 'non_billable', 'client_direct']),
    markupPercent: z.union([z.literal(''), amount]),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.expensePayer !== 'worker' && value.workerReimbursement !== 'none')
      ctx.addIssue({
        code: 'custom',
        path: ['workerReimbursement'],
        message: 'Only worker-paid expenses can reimburse a worker',
      });
    if ((value.expensePayer === 'client') !== (value.clientRecovery === 'client_direct'))
      ctx.addIssue({
        code: 'custom',
        path: ['clientRecovery'],
        message: 'Client-paid expenses require client-direct recovery',
      });
    if (
      value.workerPayType === 'PercentageOfEligibleClientLabor' &&
      Number(value.workerPayAmount.replace(',', '.')) > 100
    )
      ctx.addIssue({
        code: 'custom',
        path: ['workerPayAmount'],
        message: 'Percentage cannot exceed 100%',
      });
    if (
      value.clientRecovery === 'markup' &&
      (!value.markupPercent ||
        Number(value.markupPercent.replace(',', '.')) <= 0 ||
        Number(value.markupPercent.replace(',', '.')) > 100)
    )
      ctx.addIssue({
        code: 'custom',
        path: ['markupPercent'],
        message: 'Enter a markup above 0% and at most 100%',
      });
  });
export const creationDefaultsSchema = z
  .object({ effectiveFrom: z.iso.date(), config: projectPersonConfigSchema })
  .strict()
  .nullable();
export const creationAssignmentsSchema = z
  .array(
    z
      .object({
        workerId: clientRecordIdSchema,
        startsOn: z.iso.date(),
        endsOn: z.union([z.literal(''), z.iso.date()]),
        mode: z.enum(['defaults', 'override']),
        config: projectPersonConfigSchema.optional(),
      })
      .strict()
      .superRefine((row, ctx) => {
        if (row.endsOn && row.endsOn < row.startsOn)
          ctx.addIssue({
            code: 'custom',
            path: ['endsOn'],
            message: 'End date must be on or after start date',
          });
        if (row.mode === 'override' && !row.config)
          ctx.addIssue({ code: 'custom', path: ['config'], message: 'Enter this worker’s terms' });
      }),
  )
  .max(100)
  .superRefine((rows, ctx) => {
    const ids = new Set<string>();
    rows.forEach((row, i) => {
      if (ids.has(row.workerId))
        ctx.addIssue({
          code: 'custom',
          path: [i, 'workerId'],
          message: 'This worker is already in the assignment table',
        });
      ids.add(row.workerId);
    });
  });
