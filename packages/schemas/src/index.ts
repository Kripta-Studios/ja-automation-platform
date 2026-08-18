import { z } from 'zod';

const shortText = z.string().trim().min(1).max(160);
const message = z.string().trim().min(20).max(5_000);
const honeypot = z.string().max(0).optional().default('');

export const contactSchema = z.object({
  name: shortText,
  company: shortText,
  email: z.email().max(254),
  phone: z.string().trim().max(40).optional().default(''),
  site: shortText,
  industry: shortText,
  projectType: shortText,
  platform: z.string().trim().max(160).optional().default(''),
  preferredContact: z.enum(['email', 'phone']),
  message,
  website: honeypot,
});

export const aquarexInquirySchema = contactSchema.pick({
  name: true,
  company: true,
  email: true,
  phone: true,
  site: true,
  message: true,
  website: true,
});

export const careerInterestSchema = z.object({
  name: shortText,
  email: z.email().max(254),
  location: shortText,
  profile: shortText,
  platforms: z.string().trim().max(500),
  travel: z.enum(['yes', 'limited', 'no']),
  message,
  website: honeypot,
});

export const supportSchema = z.object({
  name: shortText,
  company: shortText,
  email: z.email().max(254),
  phone: shortText,
  site: shortText,
  platform: shortText,
  urgency: z.enum(['production_stopped', 'degraded', 'planned']),
  message,
  website: honeypot,
});

export const offlineMutationSchema = z.object({
  mutationId: z.uuid(),
  entityType: shortText,
  entityId: z.uuid(),
  baseVersion: z.int().nonnegative(),
  createdAt: z.iso.datetime(),
  payload: z.record(z.string(), z.unknown()),
  attachments: z.array(z.uuid()).max(20),
});

export const currencySchema = z.enum(['USD', 'BRL', 'EUR']);
export const uuidSchema = z.uuid();
export const minorUnitsSchema = z.string().regex(/^\d+$/, 'Use non-negative integer minor units');
const isoDateSchema = z.iso.date();
const requiredText = (maximum: number) => z.string().trim().min(1).max(maximum);
const optionalText = (maximum: number) =>
  z
    .string()
    .trim()
    .max(maximum)
    .optional()
    .transform((value) => value || undefined);
const integerFromForm = (minimum: number, maximum: number) =>
  z.coerce.number().int().min(minimum).max(maximum);

export const clientInputSchema = z.object({
  legalName: z.string().trim().min(2).max(300),
  displayName: z.string().trim().min(2).max(160),
  currency: currencySchema,
  timezone: z.string().trim().min(1).max(100),
  billingEmail: z.union([z.literal(''), z.email().max(254)]).optional(),
  paymentTermsDays: z.coerce.number().int().min(0).max(365).default(30),
});

export const projectInputSchema = z.object({
  clientId: uuidSchema,
  name: z.string().trim().min(2).max(200),
  timezone: z.string().trim().min(1).max(100),
  currency: currencySchema,
  billingModel: z.enum([
    'tm',
    'tm_daily_minimum',
    'all_in',
    'capped_tm',
    'milestone',
    'hybrid',
    'internal',
  ]),
  siteName: z.string().trim().max(200).optional(),
  country: z.string().trim().max(100).optional(),
  expectedMinutesPerDay: z.coerce.number().int().min(0).max(1440).default(600),
  clientDailyMinimumMinutes: z
    .union([z.literal(''), z.coerce.number().int().min(0).max(1440)])
    .optional()
    .transform((value) => (value === '' ? undefined : value)),
  poNumber: z.string().trim().max(100).optional(),
});

export const assignmentInputSchema = z.object({
  projectId: uuidSchema,
  workerId: z.string().min(1).max(100),
  startsOn: z.iso.date(),
  endsOn: z.union([z.literal(''), z.iso.date()]).optional(),
  plannedMinutes: z
    .union([z.literal(''), z.coerce.number().int().nonnegative()])
    .optional()
    .transform((value) => (value === '' ? undefined : value)),
});

export const timeInputSchema = z.object({
  projectId: uuidSchema,
  workDate: z.iso.date(),
  category: z.enum([
    'regular',
    'commissioning',
    'overtime',
    'weekend_holiday',
    'travel',
    'standby',
    'remote_support',
    'training',
    'internal',
  ]),
  minutes: z.coerce.number().int().min(0).max(1440),
  summary: z.string().trim().min(3).max(5000),
});

export const versionedRecordSchema = z.object({
  id: uuidSchema,
  version: z.coerce.number().int().positive(),
});

export const expenseInputSchema = z.object({
  projectId: uuidSchema,
  spentOn: z.iso.date(),
  vendor: z.string().trim().min(1).max(200),
  category: z.enum([
    'hotel',
    'rental_car',
    'fuel',
    'tolls',
    'parking',
    'airfare',
    'ground_transport',
    'meals',
    'per_diem',
    'materials',
    'tools',
    'shipping',
    'phone_data',
    'visa_permit',
    'other',
  ]),
  description: z.string().trim().min(3).max(5000),
  currency: currencySchema,
  amountMinor: minorUnitsSchema.transform((value) => BigInt(value)),
  whoPaid: z.enum(['worker', 'company_card', 'company_direct', 'client', 'third_party']),
  clientTreatment: z.enum(['all_in', 'reimbursable', 'non_billable']),
  receiptRequired: z.coerce.boolean().default(false),
  receiptDocumentId: z.union([z.literal(''), uuidSchema]).optional(),
});

export const approvalDecisionSchema = z.object({
  id: uuidSchema,
  type: z.enum(['time', 'expense']),
  decision: z.enum(['approved', 'needs_changes', 'rejected']),
  reason: z.string().trim().max(1000).optional(),
});

export const financeDecisionSchema = z.object({
  id: uuidSchema,
  type: z.enum(['time', 'expense']),
  billable: z.enum(['yes', 'no']).optional(),
});

export const invoicePeriodSchema = z.object({
  billingRuleId: uuidSchema,
  periodStart: z.iso.date(),
  periodEnd: z.iso.date(),
});

export const invoiceIdSchema = z.object({ invoiceId: uuidSchema });

export const paymentInputSchema = z.object({
  invoiceId: uuidSchema,
  amountMinor: minorUnitsSchema.transform((value) => BigInt(value)),
  currency: currencySchema,
  receivedAt: z.iso.datetime(),
  reference: z.string().trim().max(200).optional(),
  idempotencyKey: z.string().trim().min(8).max(200),
});

export const dailyReportInputSchema = z.object({
  projectId: uuidSchema,
  workDate: isoDateSchema,
  siteShift: optionalText(160),
  summary: requiredText(5000),
  tasksCompleted: requiredText(5000),
  problemsFound: optionalText(5000),
  correctiveActions: optionalText(5000),
  clientDecisions: optionalText(5000),
  downtimeMinutes: integerFromForm(0, 1440).default(0),
  standbyReason: optionalText(2000),
  blockers: optionalText(2000),
  openItems: optionalText(3000),
  nextDayPlan: optionalText(3000),
  safetyRelated: z.boolean().default(false),
  customerContact: optionalText(200),
});

export const technicalReportInputSchema = z
  .object({
    projectId: uuidSchema,
    systemName: requiredText(200),
    plantSite: optionalText(200),
    areaLine: optionalText(200),
    stationMachine: optionalText(200),
    systemType: optionalText(160),
    plcPlatform: optionalText(160),
    controller: optionalText(160),
    hmiScada: optionalText(160),
    networkProtocol: optionalText(160),
    softwareVersion: optionalText(160),
    programReference: optionalText(300),
    changeSummary: requiredText(5000),
    safetyRelated: z.boolean().default(false),
    productionImpact: optionalText(3000),
    validation: optionalText(5000),
    validationResult: optionalText(3000),
    openRisk: optionalText(3000),
    rollbackPlan: optionalText(5000),
  })
  .superRefine((value, context) => {
    if (value.safetyRelated && !value.validation)
      context.addIssue({
        code: 'custom',
        path: ['validation'],
        message: 'Safety-related changes require validation detail',
      });
    if (value.safetyRelated && !value.rollbackPlan)
      context.addIssue({
        code: 'custom',
        path: ['rollbackPlan'],
        message: 'Safety-related changes require rollback detail',
      });
  });

export const planningAssignmentInputSchema = z.object({
  projectId: uuidSchema,
  workerId: uuidSchema,
  startsAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)
    .transform((value) => `${value}:00.000Z`),
  endsAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)
    .transform((value) => `${value}:00.000Z`),
  plannedMinutes: integerFromForm(1, 10080),
  site: optionalText(200),
  requiredSkill: optionalText(160),
});

export const reportDecisionSchema = z.object({
  type: z.enum(['daily', 'technical']),
  id: uuidSchema,
  decision: z.enum(['approved', 'needs_changes']),
  reason: optionalText(2000),
});
