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
  description: z.string().trim().max(5000).optional(),
  projectAlias: z.string().trim().max(120).optional(),
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
  contractNumber: z.string().trim().max(160).optional(),
  startDate: z.union([z.literal(''), z.iso.date()]).optional(),
  plannedEndDate: z.union([z.literal(''), z.iso.date()]).optional(),
  budgetType: z
    .enum(['none', 'revenue', 'purchase_order', 'labor', 'travel', 'combined'])
    .default('none'),
  revenueBudgetMinor: minorUnitsSchema
    .optional()
    .transform((value) => (value ? BigInt(value) : undefined)),
  poCapMinor: minorUnitsSchema.optional().transform((value) => (value ? BigInt(value) : undefined)),
  laborBudgetMinutes: z.coerce.number().int().nonnegative().optional(),
  travelBudgetMinor: minorUnitsSchema
    .optional()
    .transform((value) => (value ? BigInt(value) : undefined)),
  otherCostBudgetMinor: minorUnitsSchema
    .optional()
    .transform((value) => (value ? BigInt(value) : undefined)),
  weeklyCloseEnabled: z.coerce.boolean().default(false),
  dailyReportRequired: z.coerce.boolean().default(false),
  technicalReportingRequired: z.coerce.boolean().default(false),
  notes: z.string().trim().max(5000).optional(),
});

export const clientContactInputSchema = z.object({
  clientId: uuidSchema,
  name: z.string().trim().min(2).max(160),
  email: z.union([z.literal(''), z.email().max(254)]).optional(),
  phone: z.string().trim().max(60).optional(),
  role: z.string().trim().max(120).optional(),
  isBillingContact: z.coerce.boolean().default(false),
  isPrimary: z.coerce.boolean().default(false),
});

export const milestoneInputSchema = z.object({
  projectId: uuidSchema,
  name: z.string().trim().min(2).max(200),
  description: z.string().trim().max(5000).optional(),
  amountMinor: minorUnitsSchema.transform((value) => BigInt(value)),
  dueOn: z.union([z.literal(''), z.iso.date()]).optional(),
});

export const scheduleInputSchema = z.object({
  projectId: uuidSchema,
  timezone: z.string().trim().min(1).max(100),
  mondayMinutes: z.coerce.number().int().min(0).max(1440).default(600),
  tuesdayMinutes: z.coerce.number().int().min(0).max(1440).default(600),
  wednesdayMinutes: z.coerce.number().int().min(0).max(1440).default(600),
  thursdayMinutes: z.coerce.number().int().min(0).max(1440).default(600),
  fridayMinutes: z.coerce.number().int().min(0).max(1440).default(600),
  saturdayMinutes: z.coerce.number().int().min(0).max(1440).default(600),
  sundayMinutes: z.coerce.number().int().min(0).max(1440).default(0),
  effectiveFrom: z.iso.date(),
});

export const skillInputSchema = z.object({
  code: z.string().trim().min(2).max(80),
  name: z.string().trim().min(2).max(160),
});

export const workerSkillInputSchema = z.object({
  workerId: uuidSchema,
  skillId: uuidSchema,
  proficiency: z.coerce.number().int().min(1).max(5),
});

export const availabilityInputSchema = z.object({
  workerId: uuidSchema,
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime(),
  availability: z.enum(['available', 'unavailable', 'tentative']),
  note: z.string().trim().max(1000).optional(),
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
  activityCode: z.string().trim().max(100).optional(),
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
  projectCurrencyAmountMinor: minorUnitsSchema
    .optional()
    .transform((value) => (value ? BigInt(value) : undefined)),
  fxRateBps: z.coerce.number().int().positive().optional(),
  taxAmountMinor: minorUnitsSchema
    .optional()
    .transform((value) => (value ? BigInt(value) : undefined)),
  whoPaid: z.enum(['worker', 'company_card', 'company_direct', 'client', 'third_party']),
  clientTreatment: z.enum(['all_in', 'reimbursable', 'non_billable']),
  billingTreatment: z
    .enum([
      'reimbursable_at_cost',
      'reimbursable_plus_markup',
      'all_in',
      'internal_non_billable',
      'client_direct',
      'allowance_per_diem',
      'informational',
    ])
    .optional(),
  markupBps: z.coerce.number().int().min(0).max(100_000).optional(),
  paymentMethod: z.string().trim().max(80).optional(),
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

export const billingRuleInputSchema = z.object({
  projectId: uuidSchema,
  legalEntityId: uuidSchema,
  streamType: z.enum(['labor', 'expense', 'milestone', 'other']),
  cadenceType: z.enum([
    'weekly',
    'every_14_days',
    'semi_monthly',
    'monthly',
    'custom',
    'milestone',
    'manual',
  ]),
  anchorDate: z.union([z.literal(''), isoDateSchema]).optional(),
  taxProfileId: uuidSchema,
  currency: currencySchema,
  templateId: z.string().trim().min(1).max(100).default('default'),
  recipientEmail: z.union([z.literal(''), z.email().max(254)]).optional(),
  billingContactId: z.union([z.literal(''), uuidSchema]).optional(),
  paymentTermsDays: z.coerce.number().int().min(0).max(365).default(30),
  poNumberOverride: z.string().trim().max(100).optional(),
  semiMonthlyRule: z.string().trim().min(1).max(80).default('1_15_16_end'),
  groupingMode: z
    .enum(['detail', 'summary', 'by_worker', 'by_day', 'by_category'])
    .default('summary'),
  autoGenerateDraft: z.coerce.boolean().default(false),
  effectiveFrom: isoDateSchema,
});

export const invoiceIdSchema = z.object({ invoiceId: uuidSchema });

export const compensationSettlementInputSchema = z.object({
  workerId: uuidSchema,
  projectId: uuidSchema,
  periodStart: z.iso.date(),
  periodEnd: z.iso.date(),
});

export const reimbursementInputSchema = z.object({
  expenseId: uuidSchema,
  amountMinor: minorUnitsSchema.optional(),
  reference: z.string().trim().min(1).max(200),
});

export const compensationRuleInputSchema = z.object({
  workerId: uuidSchema,
  projectId: z.union([z.literal(''), uuidSchema]).optional(),
  currency: currencySchema,
  ruleType: z.enum([
    'Hourly',
    'Daily',
    'FixedPerBillingPeriod',
    'FixedProjectAmount',
    'PercentageOfEligibleClientLabor',
    'CustomApprovedAdjustment',
  ]),
  rateMinor: minorUnitsSchema.optional().transform((value) => (value ? BigInt(value) : undefined)),
  rateBasis: z.enum(['hourly', 'daily']).default('hourly'),
  percentageBps: z.coerce.number().int().min(0).max(10000).optional(),
  percentageBasis: z
    .enum([
      'CLIENT_LABOR_BEFORE_TAX',
      'CLIENT_LABOR_AFTER_APPROVED_DISCOUNT',
      'ISSUED_ELIGIBLE_LABOR',
      'COLLECTED_ELIGIBLE_LABOR',
    ])
    .optional(),
  settlementTrigger: z
    .enum(['ON_APPROVED_BILLABLE_LABOR', 'ON_INVOICE_ISSUE', 'ON_CLIENT_PAYMENT'])
    .default('ON_APPROVED_BILLABLE_LABOR'),
  dailyGuaranteeMinutes: z.coerce.number().int().min(0).max(1440).optional(),
  overtimeMethod: z
    .enum([
      'NONE',
      'FIXED_RATE',
      'BASE_RATE_MULTIPLIER',
      'FIXED_ADDITION_PER_HOUR',
      'PERCENTAGE_OF_ELIGIBLE_CLIENT_OVERTIME',
    ])
    .default('NONE'),
  overtimeMultiplierBps: z.coerce.number().int().min(0).optional(),
  overtimeRateMinor: minorUnitsSchema
    .optional()
    .transform((value) => (value ? BigInt(value) : undefined)),
  effectiveFrom: z.iso.date(),
  effectiveTo: z.union([z.literal(''), z.iso.date()]).optional(),
  notes: z.string().trim().max(2000).optional(),
});

export const clientLaborRateInputSchema = z.object({
  projectId: uuidSchema,
  workerId: z.union([z.literal(''), uuidSchema]).optional(),
  category: z.string().trim().max(100).optional(),
  currency: currencySchema,
  hourlyRateMinor: minorUnitsSchema.transform((value) => BigInt(value)),
  effectiveFrom: z.iso.date(),
  effectiveTo: z.union([z.literal(''), z.iso.date()]).optional(),
  overtimeMethod: z
    .enum([
      'NONE',
      'FIXED_RATE',
      'BASE_RATE_MULTIPLIER',
      'FIXED_ADDITION_PER_HOUR',
      'PERCENTAGE_OF_ELIGIBLE_CLIENT_OVERTIME',
    ])
    .default('BASE_RATE_MULTIPLIER'),
  overtimeMultiplierBps: z.coerce.number().int().min(0).optional(),
  overtimeRateMinor: minorUnitsSchema
    .optional()
    .transform((value) => (value ? BigInt(value) : undefined)),
  eligibleForPercentage: z.coerce.boolean().default(true),
  notes: z.string().trim().max(2000).optional(),
});

export const internalCostRuleInputSchema = z.object({
  workerId: uuidSchema,
  projectId: z.union([z.literal(''), uuidSchema]).optional(),
  currency: currencySchema,
  hourlyRateMinor: minorUnitsSchema.transform((value) => BigInt(value)),
  effectiveFrom: z.iso.date(),
  effectiveTo: z.union([z.literal(''), z.iso.date()]).optional(),
  overtimeMethod: z
    .enum([
      'NONE',
      'FIXED_RATE',
      'BASE_RATE_MULTIPLIER',
      'FIXED_ADDITION_PER_HOUR',
      'PERCENTAGE_OF_ELIGIBLE_CLIENT_OVERTIME',
    ])
    .default('BASE_RATE_MULTIPLIER'),
  overtimeMultiplierBps: z.coerce.number().int().min(0).optional(),
  overtimeRateMinor: minorUnitsSchema
    .optional()
    .transform((value) => (value ? BigInt(value) : undefined)),
  costMethod: z.string().trim().max(80).optional(),
  notes: z.string().trim().max(2000).optional(),
});

export const assignmentRateOverrideInputSchema = z.object({
  projectMemberId: uuidSchema,
  timeCategory: z.string().trim().max(100).optional(),
  activityCode: z.string().trim().max(100).optional(),
  compensationRuleId: z.union([z.literal(''), uuidSchema]).optional(),
  internalCostRuleId: z.union([z.literal(''), uuidSchema]).optional(),
  clientLaborRateId: z.union([z.literal(''), uuidSchema]).optional(),
  effectiveFrom: z.iso.date(),
  effectiveTo: z.union([z.literal(''), z.iso.date()]).optional(),
  priority: z.coerce.number().int().min(0).max(1000).default(0),
});

export const billingCloseSchema = invoicePeriodSchema;
export const accountingPackPeriodSchema = z.object({
  periodStart: z.iso.date(),
  periodEnd: z.iso.date(),
});
export const voidInvoiceSchema = z.object({
  invoiceId: uuidSchema,
  reason: z.string().trim().min(5).max(2000),
  idempotencyKey: z.string().trim().min(8).max(200),
});
export const invitationInputSchema = z.object({
  email: z.email().max(254),
  role: z.enum(['owner_admin', 'finance_admin', 'project_manager', 'worker', 'auditor_read_only']),
  expiresInDays: z.coerce.number().int().min(1).max(14).default(7),
});

export const legalEntityInputSchema = z.object({
  code: z.string().trim().min(2).max(40),
  legalName: z.string().trim().min(2).max(300),
  currency: currencySchema,
  billingAddress: z.string().trim().min(5).max(2000),
  companyIdentifiers: z.string().trim().min(2).max(1000),
});

export const invoiceNumberPolicyInputSchema = z.object({
  legalEntityId: uuidSchema,
  prefix: z.string().trim().min(1).max(30),
  digits: z.coerce.number().int().min(4).max(10),
  effectiveFrom: z.iso.date(),
  accountantApprovedAt: z.iso.datetime(),
});

export const taxProfileInputSchema = z.object({
  legalEntityId: z.union([z.literal(''), uuidSchema]).optional(),
  name: z.string().trim().min(2).max(160),
  currency: currencySchema,
  effectiveFrom: z.iso.date(),
  componentName: z.string().trim().min(1).max(160),
  componentBasisPoints: z.coerce.number().int().min(0).max(100_000),
  componentCompound: z.coerce.boolean().default(false),
});
export const invitationAcceptSchema = z.object({
  token: z.string().trim().min(40).max(100),
  name: z.string().trim().min(2).max(160),
  password: z.string().min(12).max(200),
});
export const sendInvoiceSchema = z.object({
  invoiceId: uuidSchema,
  idempotencyKey: z.string().trim().min(8).max(200),
});

export const invoiceAdjustmentSchema = z.object({
  originalInvoiceId: uuidSchema,
  adjustmentType: z.enum(['credit', 'debit', 'correction']),
  amountMinor: z
    .string()
    .regex(/^\d+$/)
    .transform((value) => BigInt(value)),
  reason: z.string().trim().min(5).max(2000),
});

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

export const technicalChangeInputSchema = z
  .object({
    projectId: uuidSchema,
    technicalReportId: z.union([z.literal(''), uuidSchema]).optional(),
    component: requiredText(200),
    originalBehavior: optionalText(5000),
    rootCause: optionalText(5000),
    changeMade: requiredText(5000),
    reason: optionalText(5000),
    safetyImpact: z.boolean().default(false),
    productionImpact: optionalText(5000),
    validation: optionalText(5000),
    validationResult: optionalText(5000),
    openRisk: optionalText(5000),
    rollbackInformation: optionalText(5000),
  })
  .superRefine((value, context) => {
    if (value.safetyImpact && !value.validation)
      context.addIssue({
        code: 'custom',
        path: ['validation'],
        message: 'Safety-impacting changes require validation detail',
      });
    if (value.safetyImpact && !value.rollbackInformation)
      context.addIssue({
        code: 'custom',
        path: ['rollbackInformation'],
        message: 'Safety-impacting changes require rollback detail',
      });
  });

export const technicalChangeDecisionSchema = z.object({
  id: uuidSchema,
  decision: z.enum(['approved', 'needs_changes', 'rejected']),
  reason: optionalText(2000),
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
