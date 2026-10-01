import type { DatabaseSync } from 'node:sqlite';
import { canManageBilling, type Principal } from '@ja/domain';
import { isStrictIsoCalendarDate } from '@ja/billing-engine';
import { invoiceDraftDetailsInputSchema } from '@ja/schemas';
import { assertActiveAccount, assertLiveSession } from '../../core/authorization.ts';
import { recordAuditEvent } from '../../core/audit.ts';
import { runImmediateTransaction } from '../../core/transaction.ts';

type Row = Record<string, unknown>;
type ErrorConstructor = new (message: string) => Error;

export function invoicePresentationObject(value: unknown): Row {
  if (typeof value === 'string') {
    try {
      return invoicePresentationObject(JSON.parse(value));
    } catch {
      return {};
    }
  }
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Row) : {};
}

export function invoiceBusinessDates(snapshot: Row, createdAt: unknown, paymentTermsDays: unknown) {
  const invoiceDate = String(snapshot.invoiceDate ?? snapshot.issueDate ?? createdAt ?? '').slice(
    0,
    10,
  );
  const paymentTerms = Number(snapshot.paymentTermsDays ?? paymentTermsDays ?? 30);
  const explicitDue = String(snapshot.dueDateOverride ?? '').slice(0, 10);
  const computedDue = new Date(`${invoiceDate}T00:00:00.000Z`);
  computedDue.setUTCDate(computedDue.getUTCDate() + paymentTerms);
  return {
    invoiceDate,
    paymentTermsDays: paymentTerms,
    dueDateOverride: explicitDue,
    dueDate:
      explicitDue ||
      (Number.isFinite(computedDue.getTime()) ? computedDue.toISOString().slice(0, 10) : ''),
  };
}

/** Transactional edits to an unissued draft; canonical issuer identity and source quantities are never presentation edits. */
export function updateInvoiceDraftDetails(
  sqlite: DatabaseSync,
  principal: Principal,
  invoiceId: string,
  input: unknown,
  errors: { access: ErrorConstructor; conflict: ErrorConstructor; validation: ErrorConstructor },
  calculation: {
    assertCalculationFresh: (invoice: Row) => void;
    refreshCalculationFingerprint: (invoice: Row) => string;
  },
) {
  assertActiveAccount(sqlite, principal, errors.access);
  assertLiveSession(sqlite, principal, errors.access);
  if (!canManageBilling(principal)) throw new errors.access('Finance role required');
  const parsed = invoiceDraftDetailsInputSchema.safeParse(input);
  if (!parsed.success)
    throw new errors.validation(
      parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; '),
    );
  const data = parsed.data;
  return runImmediateTransaction(sqlite, 'invoice-draft-details', () => {
    // Revalidate after acquiring the write lock; a revoked session or role must
    // not survive a wait for another transaction.
    assertActiveAccount(sqlite, principal, errors.access);
    assertLiveSession(sqlite, principal, errors.access);
    const activeRole = sqlite
      .prepare('SELECT role FROM user WHERE id=?')
      .get(principal.userId)?.role;
    if (activeRole !== 'owner_admin' && activeRole !== 'finance_admin')
      throw new errors.access('Finance role required');
    // The invoice and owning stream must refer to the same project in this deployment.
    // Owner/Finance authority is deployment-wide; other roles never reach the lookup.
    const invoice = sqlite
      .prepare(
        `SELECT i.*,br.payment_terms_days,br.invoice_preview_defaults_json,
       br.po_number_override,br.version stream_version,di.tenant_id current_tenant_id,
       di.deployment_id current_deployment_id
       FROM invoice i JOIN billing_rule br ON br.id=i.billing_rule_id AND br.project_id=i.project_id
       CROSS JOIN deployment_identity di WHERE i.id=? AND di.singleton=1`,
      )
      .get(invoiceId) as Row | undefined;
    if (!invoice) throw new errors.validation('Invoice not found');
    if (
      (invoice.tenant_id != null && invoice.tenant_id !== invoice.current_tenant_id) ||
      (invoice.deployment_id != null && invoice.deployment_id !== invoice.current_deployment_id)
    )
      throw new errors.access('Invoice belongs to another deployment');
    if (invoice.state !== 'draft')
      throw new errors.conflict(
        'Only an unissued Draft can be edited. Approved invoices require a replacement draft; issued invoices require a correction.',
      );
    if (invoice.invoice_number != null || invoice.issued_at != null)
      throw new errors.conflict('Invoice has historical issue markers');
    if (Number(invoice.version) !== data.expectedVersion)
      throw new errors.conflict(
        'This invoice changed in another session. Refresh the preview before saving again.',
      );
    if (
      sqlite
        .prepare(
          "SELECT 1 FROM localized_pdf_variant WHERE owner_type='invoice' AND owner_id=? LIMIT 1",
        )
        .get(invoiceId)
    )
      throw new errors.conflict(
        'This draft has a sealed PDF artifact. Create a replacement draft before editing.',
      );
    calculation.assertCalculationFresh(invoice);
    const before = invoicePresentationObject(invoice.snapshot_json);
    // A display-only discount would lie about tax and payable totals. Commercial changes
    // require the invoice calculation workflow, not the presentation editor.
    if (
      data.discountMinor !== undefined &&
      data.discountMinor !== String(before.discountMinor ?? '0')
    )
      throw new errors.validation(
        'Discount cannot be changed in the preview. Update the commercial billing terms and regenerate the draft so totals and tax are recalculated.',
      );
    const after = { ...before };
    if (data.purchaseNo !== undefined) after.purchaseNo = data.purchaseNo;
    if (data.termsAndInstructions !== undefined)
      after.termsAndInstructions = {
        ...invoicePresentationObject(before.termsAndInstructions),
        ...data.termsAndInstructions,
      };
    if (data.companyInfo !== undefined)
      after.companyInfo = { ...invoicePresentationObject(before.companyInfo), ...data.companyInfo };
    if (data.invoiceDate !== undefined) after.invoiceDate = data.invoiceDate;
    if (data.paymentTermsDays !== undefined) after.paymentTermsDays = data.paymentTermsDays;
    if (data.dueDate !== undefined) after.dueDateOverride = data.dueDate;
    const dates = invoiceBusinessDates(after, invoice.created_at, invoice.payment_terms_days);
    if (
      !isStrictIsoCalendarDate(dates.invoiceDate) ||
      !isStrictIsoCalendarDate(dates.dueDate) ||
      dates.dueDate < dates.invoiceDate
    )
      throw new errors.validation('Due date must be on or after the invoice date.');
    after.invoiceDate = dates.invoiceDate;
    after.paymentTermsDays = dates.paymentTermsDays;
    const timestamp = new Date().toISOString();
    if (data.saveDefaults) {
      if (data.expectedBillingRuleVersion !== Number(invoice.stream_version))
        throw new errors.conflict(
          'The billing stream settings changed. Refresh the preview before saving defaults for future invoices.',
        );
      const defaults = invoicePresentationObject(invoice.invoice_preview_defaults_json);
      if (data.termsAndInstructions !== undefined)
        defaults.termsAndInstructions = {
          ...invoicePresentationObject(defaults.termsAndInstructions),
          ...data.termsAndInstructions,
        };
      if (data.companyInfo !== undefined)
        defaults.companyInfo = {
          ...invoicePresentationObject(defaults.companyInfo),
          ...data.companyInfo,
        };
      if (data.purchaseNo !== undefined) defaults.purchaseNo = data.purchaseNo;
      const streamUpdate = sqlite
        .prepare(
          `UPDATE billing_rule SET invoice_preview_defaults_json=?,
        po_number_override=COALESCE(?,po_number_override),payment_terms_days=COALESCE(?,payment_terms_days),
        updated_at=?,version=version+1 WHERE id=? AND version=?`,
        )
        .run(
          JSON.stringify(defaults),
          data.purchaseNo ?? null,
          data.paymentTermsDays ?? null,
          timestamp,
          invoice.billing_rule_id as string,
          Number(invoice.stream_version),
        );
      if (streamUpdate.changes !== 1)
        throw new errors.conflict('The billing stream changed before defaults were saved.');
      recordAuditEvent(
        sqlite,
        principal,
        'billing_rule.update',
        'billing_rule',
        String(invoice.billing_rule_id),
        {
          projectId: invoice.project_id,
          reason: 'Invoice preview defaults saved for future drafts',
          before: {
            defaults: invoicePresentationObject(invoice.invoice_preview_defaults_json),
            paymentTermsDays: invoice.payment_terms_days,
            purchaseNo: invoice.po_number_override,
          },
          after: {
            defaults,
            paymentTermsDays: data.paymentTermsDays ?? invoice.payment_terms_days,
            purchaseNo: data.purchaseNo ?? invoice.po_number_override,
          },
        },
      );
    }
    if (data.saveDefaults) {
      // Preserve source pricing only after the prior calculation was revalidated in this
      // same transaction. Presentation defaults may change PO/terms, never source money.
      after.billingCalculationFingerprint = calculation.refreshCalculationFingerprint(invoice);
      after.billingRuleVersion = Number(invoice.stream_version) + 1;
    }
    const updated = sqlite
      .prepare(
        `UPDATE invoice SET snapshot_json=?,due_at=?,pdf_status='pending',
      pdf_storage_key=NULL,pdf_sha256=NULL,pdf_generated_at=NULL,pdf_byte_length=NULL,
      updated_at=?,version=version+1 WHERE id=? AND state='draft' AND version=? AND invoice_number IS NULL AND issued_at IS NULL`,
      )
      .run(
        JSON.stringify(after),
        `${dates.dueDate}T00:00:00.000Z`,
        timestamp,
        invoiceId,
        data.expectedVersion,
      );
    if (updated.changes !== 1)
      throw new errors.conflict(
        'This invoice changed before the update completed. Refresh the preview.',
      );
    // Draft PDF downloads are synchronous/no-store and never create a durable job.
    // A draft edit must not leave a queued issuance-PDF job presenting prior data.
    if (
      sqlite
        .prepare(
          "SELECT 1 FROM job WHERE kind='invoice_pdf' AND state IN ('queued','claimed','pending','running') AND json_extract(payload_json,'$.invoiceId')=?",
        )
        .get(invoiceId)
    )
      throw new errors.conflict(
        'An invoice PDF job is in progress. Wait for it to finish before editing.',
      );
    recordAuditEvent(sqlite, principal, 'invoice.draft_details_update', 'invoice', invoiceId, {
      projectId: invoice.project_id,
      before,
      after,
      expectedVersion: data.expectedVersion,
      resultingVersion: data.expectedVersion + 1,
      saveDefaults: data.saveDefaults,
      billingRuleId: invoice.billing_rule_id,
    });
    return { success: true, version: data.expectedVersion + 1, saveDefaults: data.saveDefaults };
  });
}
