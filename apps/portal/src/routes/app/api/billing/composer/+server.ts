import { randomUUID, createHash } from 'node:crypto';
import { json, type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';
import {
  AccessDeniedError,
  AssignmentExpensePolicyRepository,
  ConflictError,
  ValidationError,
  assertLiveSession,
  ProjectBillingSetupRepository,
  resolveInvoiceIssuerAuthority,
  invoiceIssuerCoverageIssue,
} from '@ja/database';
import { openPortalRepository } from '$lib/server/portal-repository';
import { withAssignmentFinanceTransaction } from '$lib/server/actions/assignment-finance';
import { billingActionFailure } from '$lib/server/actions/billing-actions';

const scopeSchema = z
  .object({
    projectId: z.string().min(1).max(200),
    billingRuleId: z.string().min(1).max(200),
    periodStart: z.iso.date(),
    periodEnd: z.iso.date(),
  })
  .strict();
const refSchema = z
  .object({
    type: z.enum(['time', 'expense']),
    id: z.string().min(1).max(200),
    version: z.number().int().positive(),
  })
  .strict();
const selectionSchema = scopeSchema.extend({ sources: z.array(refSchema).min(1).max(1000) });
const commandSchema = z.discriminatedUnion('operation', [
  selectionSchema.extend({ operation: z.literal('preview') }),
  selectionSchema.extend({
    operation: z.literal('create'),
    requestKey: z.string().trim().min(8).max(200),
  }),
  z
    .object({
      operation: z.literal('approveSources'),
      projectId: z.string().min(1).max(200),
      sources: z.array(refSchema).min(1).max(1000),
    })
    .strict(),
  z
    .object({
      operation: z.literal('applyExpenseConditions'),
      projectId: z.string().min(1).max(200),
      source: refSchema.refine((source) => source.type === 'expense'),
      requestKey: z.string().trim().min(8).max(200),
    })
    .strict(),
  z
    .object({
      operation: z.literal('refreshInvoice'),
      projectId: z.string().min(1).max(200),
      invoiceId: z.string().min(1).max(200),
      expectedVersion: z.number().int().positive(),
    })
    .strict(),
  z
    .object({
      operation: z.enum(['approveInvoice', 'issueInvoice']),
      projectId: z.string().min(1).max(200),
      invoiceId: z.string().min(1).max(200),
      locale: z.enum(['en', 'es', 'pt']).default('en'),
    })
    .strict(),
]);
const headers = { 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff' };
function response(value: unknown, status = 200) {
  return json(value, { status, headers });
}
function denied(status: number, code: string, correlationId: string) {
  return response({ success: false, code, correlationId }, status);
}
function authorize(context: ReturnType<typeof openPortalRepository>) {
  assertLiveSession(context.sqlite, context.principal, AccessDeniedError);
  if (!['owner_admin', 'finance_admin'].includes(context.principal.role))
    throw new AccessDeniedError('Active Finance or Owner role required');
}
function invoiceState(
  context: ReturnType<typeof openPortalRepository>,
  projectId: string,
  invoiceId: string,
) {
  const preview = context.repository.invoicePreview(context.principal, invoiceId);
  const invoice = preview.invoice as Record<string, unknown>;
  if (String(invoice.project_id) !== projectId)
    throw new AccessDeniedError('Invoice is outside the selected project');
  return {
    id: String(invoice.id),
    state: String(invoice.state),
    number: invoice.invoice_number ? String(invoice.invoice_number) : null,
    pdfStatus: String(invoice.pdf_status ?? 'pending'),
    version: Number(invoice.version),
    currency: String(invoice.currency),
    totalMinor: String(invoice.total_minor),
  };
}
function failure(caught: unknown, operation: string, correlationId: string) {
  try {
    const mapped = billingActionFailure(caught, operation);
    return response({ ...mapped.data, success: false, correlationId }, mapped.status);
  } catch {
    console.error('Invoice composer failed', {
      correlationId,
      operation,
      cause: caught instanceof Error ? { name: caught.name, message: caught.message } : 'unknown',
    });
    return denied(500, 'INVOICE_COMPOSER_UNAVAILABLE', correlationId);
  }
}

export const GET: RequestHandler = ({ locals, url }) => {
  const correlationId = locals.correlationId || randomUUID();
  if (!locals.user || !locals.session)
    return denied(401, 'INVOICE_COMPOSER_SIGN_IN', correlationId);
  let context: ReturnType<typeof openPortalRepository> | undefined;
  try {
    context = openPortalRepository(locals);
    authorize(context);
    if (url.searchParams.has('invoiceId')) {
      const projectId = url.searchParams.get('projectId') ?? '';
      const invoiceId = url.searchParams.get('invoiceId') ?? '';
      if (!projectId || !invoiceId)
        return denied(400, 'INVOICE_COMPOSER_SELECTION_INVALID', correlationId);
      return response({ success: true, invoice: invoiceState(context, projectId, invoiceId) });
    }
    if ([...url.searchParams.keys()].some((key) => url.searchParams.getAll(key).length !== 1))
      return denied(400, 'INVOICE_COMPOSER_SELECTION_INVALID', correlationId);
    const parsed = scopeSchema.safeParse(Object.fromEntries(url.searchParams));
    if (!parsed.success) return denied(400, 'INVOICE_COMPOSER_SELECTION_INVALID', correlationId);
    const input = parsed.data;
    const inventory = context.repository.invoiceCompositionSources(context.principal, input);
    const rule = context.repository
      .listBillingRules(context.principal)
      .find(
        (row) =>
          String(row.id) === input.billingRuleId && String(row.project_id) === input.projectId,
      )!;
    const issuerId = String(rule.legal_entity_id ?? '');
    const setup = new ProjectBillingSetupRepository(context.sqlite, context.repository);
    const issues = setup.issuingPrerequisites(
      context.principal,
      input.projectId,
      input.periodStart,
      issuerId,
      [String(rule.tax_profile_id ?? '')],
    );
    if (
      !resolveInvoiceIssuerAuthority(
        context.sqlite,
        input.projectId,
        issuerId,
        inventory.currency,
        input.periodStart,
        input.periodEnd,
      )
    ) {
      if (!issues.includes('canonical_legal_entity_revision_required'))
        issues.push('canonical_legal_entity_revision_required');
    }
    const expensePolicies = inventory.sources
      .filter(
        (source) => source.type === 'expense' && source.classificationState === 'unclassified',
      )
      .map((source) => {
        const policy = new AssignmentExpensePolicyRepository(context!.sqlite).preview(
          context!.principal,
          source.id,
        );
        return {
          sourceId: source.id,
          available:
            policy.issues.length === 0 &&
            !!policy.policy &&
            !!policy.clientTreatment &&
            !!policy.billingTreatment,
          clientRecoveryMinor: policy.clientRecoveryMinor,
          currency: policy.projectCurrency,
        };
      });
    const options = context.v3
      .listCanonicalLegalEntityRevisionOptions(context.principal)
      .filter((row) => row.legalEntityId === issuerId);
    return response({
      success: true,
      ...inventory,
      expensePolicies,
      issuing: {
        issues,
        legalEntityId: issuerId,
        revisions: options,
        coverage: issues.includes('canonical_legal_entity_revision_required')
          ? invoiceIssuerCoverageIssue(
              context.sqlite,
              input.projectId,
              issuerId,
              inventory.currency,
              input.periodStart,
              input.periodEnd,
            )
          : null,
        assignmentRequestKey: randomUUID(),
        canManageNumbering: context.principal.role === 'owner_admin',
      },
    });
  } catch (caught) {
    return failure(caught, 'invoiceCompositionSources', correlationId);
  } finally {
    context?.sqlite.close();
  }
};

export const POST: RequestHandler = async ({ locals, request, url }) => {
  const correlationId = locals.correlationId || randomUUID();
  if (!locals.user || !locals.session)
    return denied(401, 'INVOICE_COMPOSER_SIGN_IN', correlationId);
  if (request.headers.get('origin') !== url.origin)
    return denied(403, 'INVOICE_COMPOSER_ORIGIN', correlationId);
  if (Number(request.headers.get('content-length') ?? 0) > 250_000)
    return denied(413, 'INVOICE_COMPOSER_SELECTION_INVALID', correlationId);
  const raw = await request.text();
  if (raw.length > 250_000) return denied(413, 'INVOICE_COMPOSER_SELECTION_INVALID', correlationId);
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return denied(400, 'INVOICE_COMPOSER_SELECTION_INVALID', correlationId);
  }
  const parsed = commandSchema.safeParse(value);
  if (!parsed.success) return denied(400, 'INVOICE_COMPOSER_SELECTION_INVALID', correlationId);
  let context: ReturnType<typeof openPortalRepository> | undefined;
  const command = parsed.data;
  try {
    context = openPortalRepository(locals);
    authorize(context);
    if (command.operation === 'applyExpenseConditions') {
      const current = context;
      const result = withAssignmentFinanceTransaction(current.sqlite, () => {
        const row = current.sqlite
          .prepare(
            `SELECT project_id,version,tax_amount_minor,(SELECT r.tax_bps FROM expense_classification_series s JOIN expense_classification_authority_event a ON a.id=s.current_authority_event_id JOIN expense_classification_revision r ON r.id=a.revision_id WHERE s.expense_id=expense.id) tax_bps FROM expense WHERE id=?`,
          )
          .get(command.source.id);
        if (!row || row.project_id !== command.projectId)
          throw new AccessDeniedError('Expense is outside the selected project');
        // Recover the completed canonical command before checking the original
        // expected version: a successful first attempt necessarily increments it.
        const prior = current.sqlite
          .prepare(
            `SELECT c.state,c.principal_id,c.session_id_hash,r.expense_id,r.project_id,r.reason,
          json_extract(CAST(e.canonical_blob AS TEXT),'$.expected_version') expected_version
          FROM finance_command c JOIN deployment_identity d ON d.singleton=1 AND d.tenant_id=c.tenant_id AND d.deployment_id=c.deployment_id
          LEFT JOIN expense_classification_revision r ON r.command_id=c.command_id
          LEFT JOIN finance_hash_evidence e ON e.evidence_hash=r.revision_hash AND e.evidence_type='expense_classification_revision'
          WHERE c.operation='expense.classify' AND c.idempotency_key=?`,
          )
          .get(command.requestKey);
        if (prior) {
          const sessionHash = createHash('sha256')
            .update(current.principal.sessionId ?? '')
            .digest('hex');
          if (
            prior.state !== 'completed' ||
            prior.principal_id !== current.principal.userId ||
            prior.session_id_hash !== sessionHash ||
            prior.expense_id !== command.source.id ||
            prior.project_id !== command.projectId ||
            prior.expected_version !== command.source.version ||
            prior.reason !== 'Apply configured project expense conditions from invoice preparation'
          )
            throw new ConflictError(
              'Expense condition request key was already used for another operation',
            );
          return { version: Number(row.version), replayed: true };
        }
        if (row.version !== command.source.version)
          throw new ConflictError('Selected expense changed. Reload before continuing.');
        const policy = new AssignmentExpensePolicyRepository(current.sqlite).preview(
          current.principal,
          command.source.id,
        );
        if (
          policy.issues.length ||
          !policy.policy ||
          !policy.clientTreatment ||
          !policy.billingTreatment ||
          policy.markupBps == null
        )
          throw new ValidationError(
            'Configure the dated assignment expense policy and exact currency conversion before applying it.',
          );
        if (row.tax_bps == null && Number(row.tax_amount_minor ?? 0) !== 0)
          throw new ValidationError(
            'Review the existing expense tax classification in Finance before applying project conditions.',
          );
        return current.repository.classifyExpenseCommercially(current.principal, {
          expenseId: command.source.id,
          expectedVersion: command.source.version,
          clientTreatment: policy.clientTreatment,
          billingTreatment: policy.billingTreatment,
          markupBps: policy.markupBps,
          taxBps: Number(row.tax_bps ?? 0),
          reason: 'Apply configured project expense conditions from invoice preparation',
          idempotencyKey: command.requestKey,
        });
      });
      return response({ success: true, ...result });
    }
    if (command.operation === 'approveSources') {
      const sources = context.repository.approveInvoiceCompositionSources(
        context.principal,
        command,
      );
      return response({ success: true, sources });
    }
    if (command.operation === 'preview')
      return response({
        success: true,
        ...context.repository.invoiceCompositionPreview(context.principal, command),
      });
    if (command.operation === 'create') {
      const draft = context.repository.createSelectedInvoiceDraft(context.principal, command);
      return response({
        success: true,
        ...draft,
        invoice: invoiceState(context, command.projectId, draft.id),
      });
    }
    if (command.operation === 'refreshInvoice') {
      invoiceState(context, command.projectId, command.invoiceId);
      context.repository.refreshSelectedInvoiceDraft(
        context.principal,
        command.invoiceId,
        command.expectedVersion,
      );
      return response({
        success: true,
        invoice: invoiceState(context, command.projectId, command.invoiceId),
      });
    }
    invoiceState(context, command.projectId, command.invoiceId);
    if (command.operation === 'approveInvoice')
      context.repository.approveInvoiceDraft(context.principal, command.invoiceId);
    else {
      const current = invoiceState(context, command.projectId, command.invoiceId);
      if (current.state === 'draft')
        context.repository.approveInvoiceDraft(context.principal, command.invoiceId);
      context.repository.issueInvoice(context.principal, command.invoiceId, command.locale);
    }
    return response({
      success: true,
      invoice: invoiceState(context, command.projectId, command.invoiceId),
    });
  } catch (caught) {
    return failure(caught, command.operation, correlationId);
  } finally {
    context?.sqlite.close();
  }
};
