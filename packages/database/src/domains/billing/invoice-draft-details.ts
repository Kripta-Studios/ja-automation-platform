import type { DatabaseSync } from 'node:sqlite';
import { canManageBilling, type Principal } from '@ja/domain';
import { isStrictIsoCalendarDate } from '@ja/billing-engine';
import { invoiceDraftDetailsInputSchema } from '@ja/schemas';
import { assertActiveAccount, assertLiveSession } from '../../core/authorization.ts';
import { recordAuditEvent } from '../../core/audit.ts';
import {
  readIssuerDocumentSettings,
  issuerSettingsPresentation,
  updateIssuerDocumentSettings,
  invalidateDraftPresentation,
  resolveInvoiceIssuerAuthority,
  effectivePurchaseReference,
} from './issuer-document-settings.ts';
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

/** Source edits persist actual project, stream and issuer settings atomically with the draft. */
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
  if (!parsed.success) throw new errors.validation('Check the invoice fields before saving.');
  const data = parsed.data;
  return runImmediateTransaction(sqlite, 'invoice-draft-details', () => {
    assertActiveAccount(sqlite, principal, errors.access);
    assertLiveSession(sqlite, principal, errors.access);
    const role = sqlite.prepare('SELECT role FROM user WHERE id=?').get(principal.userId)?.role;
    if (role !== 'owner_admin' && role !== 'finance_admin')
      throw new errors.access('Finance role required');
    const invoice = sqlite
      .prepare(
        `SELECT i.*,br.payment_terms_days,br.past_due_notice,br.po_number_override,
      br.version stream_version,br.legal_entity_id issuer_legal_entity_id,p.po_number project_po_number,
      p.version project_version,c.po_reference client_po_reference,di.tenant_id current_tenant_id,
      di.deployment_id current_deployment_id FROM invoice i
      JOIN billing_rule br ON br.id=i.billing_rule_id AND br.project_id=i.project_id
      JOIN project p ON p.id=i.project_id JOIN client c ON c.id=p.client_id
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
    const after = { ...before };
    if (
      data.discountMinor !== undefined &&
      data.discountMinor !== String(before.discountMinor ?? '0')
    )
      throw new errors.validation(
        'Discount cannot be changed in the preview. Update the commercial billing terms and regenerate the draft so totals and tax are recalculated.',
      );
    const settings = readIssuerDocumentSettings(
      sqlite,
      String(invoice.issuer_legal_entity_id),
      String(invoice.currency),
    );
    const presentation = issuerSettingsPresentation(settings);
    const baselineTerms: Row = {
      ...presentation.termsAndInstructions,
      pastDueNotice: String(invoice.past_due_notice ?? ''),
      ...invoicePresentationObject(before.termsAndInstructions),
    };
    const baselineCompany: Row = {
      ...presentation.companyInfo,
      ...invoicePresentationObject(before.companyInfo),
    };
    const baselinePo = String(
      before.purchaseNo ??
        before.purchase_no ??
        effectivePurchaseReference(
          invoice.po_number_override,
          invoice.project_po_number,
          invoice.client_po_reference,
        ) ??
        '',
    );
    const baselineDays = Number(before.paymentTermsDays ?? invoice.payment_terms_days);
    const changedPo =
      data.purchaseNo !== undefined && data.purchaseNo !== (baselinePo === '—' ? '' : baselinePo);
    const changedDays =
      data.paymentTermsDays !== undefined && data.paymentTermsDays !== baselineDays;
    const changedNotice =
      data.termsAndInstructions?.pastDueNotice !== undefined &&
      data.termsAndInstructions.pastDueNotice !== String(baselineTerms.pastDueNotice ?? '');
    const poIsStream =
      typeof invoice.po_number_override === 'string' && invoice.po_number_override.trim() !== '';
    const streamChanged = changedDays || changedNotice || (changedPo && poIsStream);
    const projectChanged = changedPo && !poIsStream;
    const issuerPatch: Record<string, string> = {};
    for (const name of [
      'bankSwiftNumber',
      'bankAccountNumber',
      'bankName',
      'beneficiary',
    ] as const) {
      const value = data.termsAndInstructions?.[name];
      if (value !== undefined && value !== String(baselineTerms[name] ?? ''))
        issuerPatch[name] = value;
    }
    for (const name of ['division', 'phone', 'email', 'website'] as const) {
      const value = data.companyInfo?.[name];
      if (value !== undefined && value !== String(baselineCompany[name] ?? ''))
        issuerPatch[`company${name.charAt(0).toUpperCase()}${name.slice(1)}`] = value;
    }
    for (const name of ['name', 'address'] as const)
      if (
        data.companyInfo?.[name] !== undefined &&
        data.companyInfo[name] !== String(baselineCompany[name] ?? '')
      )
        throw new errors.validation(
          'Issuing company identity must be changed through its reviewed legal-entity revision workflow.',
        );
    if (streamChanged && data.expectedBillingRuleVersion !== Number(invoice.stream_version))
      throw new errors.conflict(
        'The billing stream settings changed. Refresh the preview before saving again.',
      );
    if (projectChanged && data.expectedProjectVersion !== Number(invoice.project_version))
      throw new errors.conflict(
        'The project settings changed. Refresh the preview before changing the project purchase reference.',
      );
    if (Object.keys(issuerPatch).length && data.expectedIssuerSettingsVersion !== settings.version)
      throw new errors.conflict(
        'The issuing company payment or contact settings changed. Refresh before saving.',
      );
    if (data.invoiceDate !== undefined) after.invoiceDate = data.invoiceDate;
    if (data.dueDate !== undefined) after.dueDateOverride = data.dueDate;
    if (changedDays) after.paymentTermsDays = data.paymentTermsDays;
    // The form's unchanged historical fields are deliberately NOT copied into current source settings.
    if (changedPo) after.purchaseNo = data.purchaseNo;
    const terms = { ...baselineTerms };
    for (const [name, value] of Object.entries(data.termsAndInstructions ?? {}))
      if (value !== String(baselineTerms[name as keyof typeof baselineTerms] ?? ''))
        terms[name as keyof typeof terms] = value;
    const company = { ...baselineCompany };
    for (const [name, value] of Object.entries(data.companyInfo ?? {}))
      if (value !== String(baselineCompany[name] ?? '')) company[name] = value;
    after.termsAndInstructions = terms;
    after.companyInfo = company;
    const baselineDate = String(
      invoice.planned_issue_on ?? before.invoiceDate ?? before.issueDate ?? invoice.created_at,
    ).slice(0, 10);
    const changedInvoiceDate = data.invoiceDate !== undefined && data.invoiceDate !== baselineDate;
    if (data.invoiceDate === undefined && invoice.planned_issue_on)
      after.invoiceDate = baselineDate;
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
    if (streamChanged) {
      const update = sqlite
        .prepare(
          `UPDATE billing_rule SET payment_terms_days=?,past_due_notice=?,po_number_override=?,updated_at=?,version=version+1 WHERE id=? AND version=?`,
        )
        .run(
          changedDays ? data.paymentTermsDays! : Number(invoice.payment_terms_days),
          changedNotice
            ? data.termsAndInstructions!.pastDueNotice!
            : String(invoice.past_due_notice),
          changedPo && poIsStream
            ? data.purchaseNo || null
            : (invoice.po_number_override as string | null),
          timestamp,
          String(invoice.billing_rule_id),
          Number(invoice.stream_version),
        );
      if (update.changes !== 1)
        throw new errors.conflict('The billing stream changed before source settings were saved.');
      recordAuditEvent(
        sqlite,
        principal,
        'billing_rule.update',
        'billing_rule',
        String(invoice.billing_rule_id),
        {
          projectId: invoice.project_id,
          before: {
            paymentTermsDays: invoice.payment_terms_days,
            pastDueNotice: invoice.past_due_notice,
            poNumberOverride: invoice.po_number_override,
          },
          after: {
            paymentTermsDays: changedDays ? data.paymentTermsDays : invoice.payment_terms_days,
            pastDueNotice: changedNotice
              ? data.termsAndInstructions!.pastDueNotice
              : invoice.past_due_notice,
            poNumberOverride:
              changedPo && poIsStream ? data.purchaseNo : invoice.po_number_override,
          },
          reason: 'Invoice preview source edit',
        },
      );
      invalidateDraftPresentation(
        sqlite,
        'billing_rule_id=?',
        [String(invoice.billing_rule_id)],
        invoiceId,
      );
    }
    if (projectChanged) {
      const update = sqlite
        .prepare(
          'UPDATE project SET po_number=?,updated_at=?,version=version+1 WHERE id=? AND version=?',
        )
        .run(
          data.purchaseNo || null,
          timestamp,
          String(invoice.project_id),
          Number(invoice.project_version),
        );
      if (update.changes !== 1)
        throw new errors.conflict(
          'The project settings changed. Refresh the preview before changing the project purchase reference.',
        );
      recordAuditEvent(sqlite, principal, 'project.update', 'project', String(invoice.project_id), {
        before: { poNumber: invoice.project_po_number },
        after: { poNumber: data.purchaseNo || null },
        reason: 'Invoice preview purchase reference edit',
      });
      invalidateDraftPresentation(sqlite, 'project_id=?', [String(invoice.project_id)], invoiceId);
    }
    if (changedPo)
      after.purchaseNo = poIsStream
        ? effectivePurchaseReference(
            data.purchaseNo,
            invoice.project_po_number,
            invoice.client_po_reference,
          )
        : effectivePurchaseReference(null, data.purchaseNo, invoice.client_po_reference);
    if (Object.keys(issuerPatch).length) {
      const authority = resolveInvoiceIssuerAuthority(
        sqlite,
        String(invoice.project_id),
        settings.legalEntityId,
        settings.currency,
        String(invoice.period_start),
        String(invoice.period_end),
      );
      const otherAuthority = sqlite
        .prepare(
          'SELECT 1 FROM effective_project_legal_entity_assignment WHERE project_id=? AND effective_from<=? AND (effective_to IS NULL OR effective_to>=?)',
        )
        .get(String(invoice.project_id), String(invoice.period_start), String(invoice.period_end));
      if (!authority && otherAuthority)
        throw new errors.conflict(
          'The project issuing authority does not match this billing stream. Review the issuing setup before changing company settings.',
        );
      const result = updateIssuerDocumentSettings(
        sqlite,
        principal,
        {
          legalEntityId: settings.legalEntityId,
          currency: settings.currency,
          expectedVersion: data.expectedIssuerSettingsVersion,
          ...issuerPatch,
        },
        errors,
        invoiceId,
      );
      after.issuerDocumentSettingsVersion = result.settings.version;
    } else if (before.issuerDocumentSettingsVersion === undefined)
      after.issuerDocumentSettingsVersion = settings.version;
    if (streamChanged || projectChanged || Object.keys(issuerPatch).length) {
      after.billingCalculationFingerprint = calculation.refreshCalculationFingerprint(invoice);
      after.billingRuleVersion = Number(invoice.stream_version) + (streamChanged ? 1 : 0);
    }
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
    const updated = sqlite
      .prepare(
        `UPDATE invoice SET snapshot_json=?,due_at=?,pdf_status='pending',pdf_storage_key=NULL,
      pdf_sha256=NULL,pdf_generated_at=NULL,pdf_byte_length=NULL,
      planned_issue_on=CASE WHEN ? OR planned_issue_on IS NULL THEN ? ELSE planned_issue_on END,updated_at=?,version=version+1
      WHERE id=? AND state='draft' AND version=? AND invoice_number IS NULL AND issued_at IS NULL`,
      )
      .run(
        JSON.stringify(after),
        `${dates.dueDate}T00:00:00.000Z`,
        changedInvoiceDate ? 1 : 0,
        dates.invoiceDate,
        timestamp,
        invoiceId,
        data.expectedVersion,
      );
    if (updated.changes !== 1)
      throw new errors.conflict(
        'This invoice changed before the update completed. Refresh the preview.',
      );
    recordAuditEvent(sqlite, principal, 'invoice.draft_details_update', 'invoice', invoiceId, {
      projectId: invoice.project_id,
      before,
      after,
      expectedVersion: data.expectedVersion,
      resultingVersion: data.expectedVersion + 1,
      sourceChanges: {
        project: projectChanged,
        stream: streamChanged,
        issuer: Object.keys(issuerPatch),
      },
    });
    return { success: true, version: data.expectedVersion + 1 };
  });
}
