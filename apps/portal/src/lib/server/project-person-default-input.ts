import { z } from 'zod';
import { clientRecordIdSchema } from '@ja/schemas';
const amountPattern = /^\d{1,10}(?:[.,]\d{1,2})?$/;
const amountError = 'problem.projectDetail.personTermsRateInvalid';
const termsError = 'problem.projectDetail.personTermsInvalid';
const amount = z.string({ error: amountError }).trim().regex(amountPattern, { error: amountError });
export const projectPersonConfigSchema = z
  .object({
    customerHourlyRate: amount,
    internalCostHourlyRate: amount,
    workerPayType: z.enum(
      [
        'Hourly',
        'Daily',
        'FixedPerBillingPeriod',
        'FixedProjectAmount',
        'PercentageOfEligibleClientLabor',
      ],
      { error: termsError },
    ),
    workerPayAmount: amount,
    percentageBasis: z.enum(
      [
        'CLIENT_LABOR_BEFORE_TAX',
        'CLIENT_LABOR_AFTER_APPROVED_DISCOUNT',
        'ISSUED_ELIGIBLE_LABOR',
        'COLLECTED_ELIGIBLE_LABOR',
      ],
      { error: termsError },
    ),
    expensePayer: z.enum(['worker', 'company_card', 'company_direct', 'client', 'third_party'], {
      error: termsError,
    }),
    workerReimbursement: z.enum(['at_cost', 'none'], { error: termsError }),
    clientRecovery: z.enum(['at_cost', 'markup', 'included', 'non_billable', 'client_direct'], {
      error: termsError,
    }),
    markupPercent: z
      .string({ error: amountError })
      .trim()
      .refine((value) => value === '' || amountPattern.test(value), { error: amountError }),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.expensePayer !== 'worker' && value.workerReimbursement !== 'none')
      ctx.addIssue({
        code: 'custom',
        path: ['workerReimbursement'],
        message: 'problem.projectDetail.personWorkerReimbursementMismatch',
      });
    if ((value.expensePayer === 'client') !== (value.clientRecovery === 'client_direct'))
      ctx.addIssue({
        code: 'custom',
        path: ['clientRecovery'],
        message: 'problem.projectDetail.personClientRecoveryMismatch',
      });
    if (
      value.workerPayType === 'PercentageOfEligibleClientLabor' &&
      Number(value.workerPayAmount.replace(',', '.')) > 100
    )
      ctx.addIssue({
        code: 'custom',
        path: ['workerPayAmount'],
        message: 'problem.projectDetail.personPayPercentInvalid',
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
        message:
          Number(value.markupPercent.replace(',', '.')) > 100
            ? 'problem.projectDetail.personMarkupInvalid'
            : 'problem.projectDetail.personMarkupRequired',
      });
  });
export const creationDefaultsSchema = z
  .object({
    effectiveFrom: z.iso.date({ error: 'problem.projectDetail.personTermsDateInvalid' }),
    config: projectPersonConfigSchema,
  })
  .strict()
  .nullable();
export const creationAssignmentsSchema = z
  .array(
    z
      .object({
        workerId: clientRecordIdSchema,
        startsOn: z.iso.date({ error: 'problem.assignment.startDateInvalid' }),
        endsOn: z.union([z.literal(''), z.iso.date()], {
          error: 'problem.assignment.endDateInvalid',
        }),
        mode: z.enum(['defaults', 'override'], { error: termsError }),
        config: projectPersonConfigSchema.optional(),
      })
      .strict()
      .superRefine((row, ctx) => {
        if (row.endsOn && row.endsOn < row.startsOn)
          ctx.addIssue({
            code: 'custom',
            path: ['endsOn'],
            message: 'problem.assignment.dateRangeInvalid',
          });
        if (row.mode === 'override' && !row.config)
          ctx.addIssue({ code: 'custom', path: ['config'], message: termsError });
      }),
  )
  .max(100, { error: 'problem.project.initialWorkerLimit' })
  .superRefine((rows, ctx) => {
    const ids = new Set<string>();
    rows.forEach((row, i) => {
      if (ids.has(row.workerId))
        ctx.addIssue({
          code: 'custom',
          path: [i, 'workerId'],
          message: 'problem.projectDetail.peopleTermsDuplicatePerson',
        });
      ids.add(row.workerId);
    });
  });
