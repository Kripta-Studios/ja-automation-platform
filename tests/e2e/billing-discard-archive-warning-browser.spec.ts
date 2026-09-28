import { createHash, randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { PortalRepository } from '@ja/database';
import { e2eCredentials, portal, signIn } from './auth.js';
import { readE2EFixturePointer } from './environment.js';

type Locale = 'en' | 'es' | 'pt';
type InvoiceState = 'draft' | 'approved';

function database(): DatabaseSync {
  // readE2EFixturePointer rejects a stale, foreign, or non-disposable database.
  return new DatabaseSync(readE2EFixturePointer().databasePath);
}

function cloneInvoice(
  state: InvoiceState,
  link: 'none' | 'source' | 'line',
  billingRuleId: string | null = null,
  options: { id?: string; historicalMarker?: 'number' | 'issuedAt' } = {},
) {
  const db = database();
  try {
    const original = db.prepare("SELECT id FROM invoice WHERE state='draft' LIMIT 1").get() as
      | { id: string }
      | undefined;
    if (!original) throw new Error('Disposable E2E fixture needs a draft invoice');
    const id = options.id ?? randomUUID();
    const now = new Date().toISOString();
    const columns = (db.prepare('PRAGMA table_info(invoice)').all() as { name: string }[]).map(
      (column) => column.name,
    );
    const replacements: Record<string, string | number | null> = {
      id,
      state,
      invoice_number: options.historicalMarker === 'number' ? `QA-LEGACY-${id}` : null,
      issued_at: options.historicalMarker === 'issuedAt' ? '2026-09-20T12:00:00.000Z' : null,
      ...(billingRuleId ? { billing_rule_id: billingRuleId } : {}),
      period_start: '2035-01-01',
      period_end: '2035-01-31',
      source_lock_at: null,
      pdf_status: 'pending',
      pdf_storage_key: null,
      pdf_sha256: null,
      pdf_generated_at: null,
      pdf_byte_length: null,
      created_at: now,
      updated_at: now,
      version: 1,
    };
    const quote = (name: string) => `"${name.replaceAll('"', '""')}"`;
    db.prepare(
      `INSERT INTO invoice (${columns.map(quote).join(',')}) SELECT ${columns
        .map((column) =>
          Object.hasOwn(replacements, column) ? `? AS ${quote(column)}` : quote(column),
        )
        .join(',')} FROM invoice WHERE id=?`,
    ).run(
      ...columns
        .filter((column) => Object.hasOwn(replacements, column))
        .map((column) => replacements[column]!),
      original.id,
    );
    if (link === 'source') {
      const sourceId = randomUUID();
      db.prepare(
        `INSERT INTO invoice_source(
           source_link_id,invoice_id,invoice_line_id,source_type,source_id,source_version,
           locked_at,source_hash,allocated_net_minor,allocated_tax_minor,
           allocated_gross_minor,created_at
         ) VALUES(?,?,NULL,?,?,?,NULL,?,?,?,?,?)`,
      ).run(
        randomUUID(),
        id,
        'adjustment',
        sourceId,
        1,
        createHash('sha256').update(sourceId).digest('hex'),
        0,
        0,
        0,
        now,
      );
    }
    if (link === 'line')
      db.prepare(
        `INSERT INTO invoice_line(id,invoice_id,description,quantity_numerator,quantity_denominator,
          unit_price_minor,subtotal_minor,source_type,source_id,snapshot_json)
         VALUES(?,?,?,?,?,?,?,?,?,?)`,
      ).run(
        randomUUID(),
        id,
        'Disposable warning line',
        1,
        1,
        0,
        0,
        'adjustment',
        randomUUID(),
        '{}',
      );
    return { id, state, version: 1 };
  } finally {
    db.close();
  }
}

function invoiceState(id: string): string | null {
  const db = database();
  try {
    const row = db.prepare('SELECT state FROM invoice WHERE id=?').get(id) as
      | { state: string }
      | undefined;
    return row?.state ?? null;
  } finally {
    db.close();
  }
}

function invoiceSnapshot(id: string) {
  const db = database();
  try {
    return db
      .prepare(
        'SELECT id,state,invoice_number,issued_at,version,updated_at FROM invoice WHERE id=?',
      )
      .get(id);
  } finally {
    db.close();
  }
}

function projectedCounts(id: string) {
  const db = database();
  try {
    const user = db
      .prepare('SELECT id FROM user WHERE email=?')
      .get(e2eCredentials.finance.email) as { id: string } | undefined;
    if (!user) throw new Error('Disposable Finance user missing');
    const repository = new PortalRepository(db);
    const row = repository
      .listInvoices(repository.principalFor(user.id))
      .find((item) => item.id === id);
    if (!row) throw new Error(`Disposable invoice ${id} missing from listInvoices`);
    return { sources: row.invoice_source_count, lines: row.invoice_line_count };
  } finally {
    db.close();
  }
}

function archiveTarget(): string {
  const db = database();
  try {
    const row = db
      .prepare('SELECT id FROM billing_rule WHERE enabled=1 ORDER BY created_at LIMIT 1')
      .get() as { id: string } | undefined;
    if (!row) throw new Error('Disposable E2E fixture needs an active billing stream');
    return row.id;
  } finally {
    db.close();
  }
}

function streamEnabled(id: string): number {
  const db = database();
  try {
    const row = db.prepare('SELECT enabled FROM billing_rule WHERE id=?').get(id) as
      | { enabled: number }
      | undefined;
    if (!row) throw new Error(`Disposable billing stream ${id} missing`);
    return row.enabled;
  } finally {
    db.close();
  }
}

function approvedInvoicesForRule(id: string): number {
  const db = database();
  try {
    const row = db
      .prepare("SELECT COUNT(*) AS count FROM invoice WHERE billing_rule_id=? AND state='approved'")
      .get(id) as { count: number };
    return row.count;
  } finally {
    db.close();
  }
}

async function openInvoice(
  page: Page,
  id: string,
  viewport: string,
  locale: Locale,
): Promise<Locator> {
  await page.goto(portal(`/billing?view=invoices&lang=${locale}`));
  // The priority-sorted register is paginated, and its search indexes row IDs.
  const browser = page
    .locator('[data-billing-invoice-list]')
    .locator('xpath=preceding-sibling::*[1]');
  await browser.locator('input[type="search"]').fill(id);
  if (viewport === 'phone-390') {
    await page.locator(`[data-billing-invoice-list] a[href="#invoice-${id}"]`).click();
  } else {
    const row = page.locator(`tr[data-invoice-row="${id}"]`);
    await expect(row).toBeVisible();
    await row.locator('td:last-child button').click();
  }
  const sheet = page.locator('[data-ui="responsive-sheet"]');
  await expect(sheet).toBeVisible();
  return sheet;
}

async function expectWarning(
  form: Locator,
  code: string,
  locale: Locale,
  copy: Record<Locale, RegExp>,
): Promise<Locator> {
  const notice = form.locator('xpath=preceding-sibling::*[1]');
  await expect(notice).toHaveAttribute('data-problem-code', code);
  await expect(notice).toContainText(copy[locale]);
  const remedy = notice.getByRole('link');
  const invoiceInput = form.locator('input[name="invoiceId"]');
  const invoiceId = (await invoiceInput.count()) ? await invoiceInput.first().inputValue() : '';
  await expect(remedy).toHaveAttribute(
    'href',
    invoiceId
      ? new RegExp(`/app/billing/invoices/${invoiceId}$`)
      : /\/app\/billing\?view=invoices$/,
  );
  return notice;
}

const draftCopy = {
  en: /release reserved source records.*period to Ready/i,
  es: /liberar registros de origen reservados.*período de facturación a Listo/i,
  pt: /liberar registros de origem reservados.*período de faturamento a Pronto/i,
};
const linkedCopy = {
  en: /Finance cannot discard.*invoice lines or linked source records/i,
  es: /Finanzas no puede descartar.*líneas de factura o registros de origen vinculados/i,
  pt: /Finanças não pode descartar.*linhas de fatura ou registros de origem vinculados/i,
};
const approvedCopy = {
  en: /removes its approval.*reopen the billing period/i,
  es: /elimina su aprobación.*reabrir el período de facturación/i,
  pt: /remove sua aprovação.*reabrir o período de faturamento/i,
};
const archiveCopy = {
  en: /disables this billing stream for future periods.*Approved invoices.*issued or recalculated/i,
  es: /desactiva este flujo de facturación para períodos futuros.*facturas aprobadas.*emitirse o recalcularse/i,
  pt: /desativa este fluxo de faturamento para períodos futuros.*faturas aprovadas.*emitidas ou recalculadas/i,
};
const historicalCopy = {
  en: /labeled Draft or Approved.*invoice number or issue date/i,
  es: /aparece como Borrador o Aprobada.*número de factura o fecha de emisión/i,
  pt: /aparece como Rascunho ou Aprovada.*número de fatura ou data de emissão/i,
};

for (const viewport of ['phone-390', 'desktop'] as const) {
  test(`Finance linked draft blockers and permitted unlinked discard at ${viewport}`, async ({
    page,
  }, info) => {
    test.skip(info.project.name !== viewport);
    test.setTimeout(90_000);
    const locale: Locale = viewport === 'desktop' ? 'es' : 'en';
    const source = cloneInvoice('draft', 'source');
    const line = cloneInvoice('draft', 'line');
    const plain = cloneInvoice('draft', 'none');
    expect(projectedCounts(source.id)).toEqual({ sources: 1, lines: 0 });
    expect(projectedCounts(line.id)).toEqual({ sources: 0, lines: 1 });
    expect(projectedCounts(plain.id)).toEqual({ sources: 0, lines: 0 });
    let posts = 0;
    page.on('request', (request) => {
      if (request.method() === 'POST' && request.url().includes('?/deleteInvoice')) posts += 1;
    });
    await signIn(page, 'finance');
    for (const linked of [source, line]) {
      const sheet = await openInvoice(page, linked.id, viewport, locale);
      const form = sheet.locator('form[action="?/deleteInvoice"]');
      await expectWarning(form, 'BILLING_DISCARD_LINKED_FINANCE', locale, linkedCopy);
      await expect(
        form.getByRole('button', { name: /Discard draft|Descartar borrador|Descartar rascunho/i }),
      ).toBeDisabled();
      await expect(
        sheet.locator('[data-problem-code="WARNING_BILLING_DISCARD_DRAFT"]'),
      ).toHaveCount(0);
      expect(invoiceState(linked.id)).toBe('draft');
    }
    expect(posts).toBe(0);
    const sheet = await openInvoice(page, plain.id, viewport, 'en');
    const form = sheet.locator('form[action="?/deleteInvoice"]');
    await expectWarning(form, 'WARNING_BILLING_DISCARD_DRAFT', 'en', draftCopy);
    await expect(form.getByRole('button', { name: 'Discard draft' })).toBeEnabled();
    expect(invoiceState(plain.id)).toBe('draft');
    await form.locator('[name="reason"]').fill('Discard disposable empty invoice');
    const response = page.waitForResponse(
      (candidate) =>
        candidate.request().method() === 'POST' && candidate.url().includes('?/deleteInvoice'),
    );
    await form.getByRole('button', { name: 'Discard draft' }).click();
    expect((await response).status()).toBe(200);
    await expect.poll(() => invoiceState(plain.id)).toBeNull();
    expect(invoiceState(source.id)).toBe('draft');
    expect(invoiceState(line.id)).toBe('draft');
    const ruleId = archiveTarget();
    for (const archiveLocale of viewport === 'phone-390'
      ? (['en', 'es', 'pt'] as const)
      : ([locale] as const)) {
      await page.goto(portal(`/billing?view=streams&focus=${ruleId}&lang=${archiveLocale}`));
      const archiveForm = page.locator(
        `#billing-stream-${ruleId} form[action="?/archiveBillingRule"]`,
      );
      await expect(archiveForm).toBeVisible();
      const notice = await expectWarning(
        archiveForm,
        'WARNING_BILLING_ARCHIVE_STREAM',
        archiveLocale,
        archiveCopy,
      );
      if (viewport === 'phone-390') {
        const noticeBox = await notice.boundingBox();
        const linkBox = await notice.getByRole('link').boundingBox();
        const buttonBox = await archiveForm.getByRole('button').boundingBox();
        expect(noticeBox).not.toBeNull();
        expect(linkBox).not.toBeNull();
        expect(buttonBox).not.toBeNull();
        for (const box of [noticeBox!, linkBox!, buttonBox!]) {
          expect(box.x).toBeGreaterThanOrEqual(-1);
          expect(box.x + box.width).toBeLessThanOrEqual(391);
        }
        expect(linkBox!.height).toBeGreaterThanOrEqual(44);
        expect(buttonBox!.height).toBeGreaterThanOrEqual(44);
        expect(
          await notice.evaluate((element) => parseFloat(getComputedStyle(element).fontSize)),
        ).toBeGreaterThanOrEqual(14);
      }
      expect(streamEnabled(ruleId)).toBe(1);
    }
  });

  test(`Owner approved discard and stream archive consequences at ${viewport}`, async ({
    page,
  }, info) => {
    test.skip(info.project.name !== viewport);
    test.setTimeout(90_000);
    const locale: Locale = viewport === 'desktop' ? 'pt' : 'en';
    const ruleId = archiveTarget();
    const approvedBefore = approvedInvoicesForRule(ruleId);
    const approved = cloneInvoice('approved', 'none', ruleId);
    const draft = cloneInvoice('draft', 'none');
    expect(approvedInvoicesForRule(ruleId)).toBe(approvedBefore + 1);
    let posts = 0;
    page.on('request', (request) => {
      if (
        request.method() === 'POST' &&
        /\?\/(deleteInvoice|archiveBillingRule)/.test(request.url())
      )
        posts += 1;
    });
    await signIn(page, 'owner');
    await page.goto(portal(`/billing?view=streams&focus=${ruleId}&lang=${locale}`));
    const editor = page.locator(`#billing-stream-${ruleId}`);
    await expect(editor).toBeVisible();
    const archiveForm = editor.locator('form[action="?/archiveBillingRule"]');
    await expect(archiveForm).toBeVisible();
    await expectWarning(archiveForm, 'WARNING_BILLING_ARCHIVE_STREAM', locale, archiveCopy);
    await expect(archiveForm.getByRole('button')).toBeEnabled();
    expect(streamEnabled(ruleId)).toBe(1);
    expect(invoiceState(approved.id)).toBe('approved');
    expect(posts).toBe(0);
    const draftSheet = await openInvoice(page, draft.id, viewport, locale);
    await expectWarning(
      draftSheet.locator('form[action="?/deleteInvoice"]'),
      'WARNING_BILLING_DISCARD_DRAFT',
      locale,
      draftCopy,
    );
    expect(invoiceState(draft.id)).toBe('draft');
    expect(posts).toBe(0);
    const sheet = await openInvoice(page, approved.id, viewport, locale);
    const form = sheet.locator('form[action="?/deleteInvoice"]');
    await expectWarning(form, 'WARNING_BILLING_DISCARD_APPROVED', locale, approvedCopy);
    await expect(
      form.getByRole('button', { name: /Discard draft|Descartar borrador|Descartar rascunho/i }),
    ).toBeEnabled();
    expect(invoiceState(approved.id)).toBe('approved');
    expect(posts).toBe(0);
    await form.locator('[name="reason"]').fill('Discard disposable approved invoice');
    const response = page.waitForResponse(
      (candidate) =>
        candidate.request().method() === 'POST' && candidate.url().includes('?/deleteInvoice'),
    );
    await form.getByRole('button').click();
    expect((await response).status()).toBe(200);
    await expect.poll(() => invoiceState(approved.id)).toBeNull();
    expect(approvedInvoicesForRule(ruleId)).toBe(approvedBefore);
    expect(streamEnabled(ruleId)).toBe(1);
  });
}

for (const viewport of ['phone-390', 'desktop'] as const) {
  for (const role of ['owner', 'finance'] as const) {
    test(`${role} legacy invoice issue markers block lifecycle controls at ${viewport}`, async ({
      page,
    }, info) => {
      test.skip(info.project.name !== viewport);
      test.setTimeout(90_000);
      const legacyId = `invoice-${randomUUID().replaceAll('-', '').slice(0, 24)}`;
      const legacy = cloneInvoice('draft', 'none', null, {
        id: legacyId,
        historicalMarker: role === 'owner' ? 'number' : 'issuedAt',
      });
      const before = invoiceSnapshot(legacy.id);
      let mutationPosts = 0;
      page.on('request', (request) => {
        if (
          request.method() === 'POST' &&
          /\?\/(approveInvoice|deleteInvoice|setInvoicePlanningDates|recalculateApprovedInvoice)/.test(
            request.url(),
          )
        )
          mutationPosts += 1;
      });
      await signIn(page, role);
      for (const locale of ['en', 'es', 'pt'] as const) {
        const sheet = await openInvoice(page, legacy.id, viewport, locale);
        const notice = sheet.locator(
          '[data-problem-code="BILLING_INVOICE_HISTORICAL_ISSUE_MARKERS"]',
        );
        await expect(notice).toBeVisible();
        await expect(notice).toHaveAttribute('role', 'alert');
        await expect(notice).toContainText(historicalCopy[locale]);
        for (const action of [
          'setInvoicePlanningDates',
          'approveInvoice',
          'deleteInvoice',
          'recalculateApprovedInvoice',
        ])
          await expect(sheet.locator(`form[action="?/${action}"]`)).toHaveCount(0);
        const remedy = notice.getByRole('link');
        await expect(remedy).toBeVisible();
        await expect(remedy).toHaveAttribute(
          'href',
          new RegExp(`/app/billing/invoices/${legacy.id}$`),
        );
        expect(invoiceSnapshot(legacy.id)).toEqual(before);
        expect(mutationPosts).toBe(0);
        await remedy.click();
        await expect(page).toHaveURL(new RegExp(`/app/billing/invoices/${legacy.id}$`));
        expect(invoiceSnapshot(legacy.id)).toEqual(before);
      }

      await page.goto(portal('/billing?view=invoices&lang=en'));
      const responsePromise = page.waitForResponse(
        (response) =>
          response.request().method() === 'POST' && response.url().includes('?/approveInvoice'),
      );
      await page.evaluate((invoiceId) => {
        const form = document.createElement('form');
        form.method = 'POST';
        form.action = '?/approveInvoice';
        const input = document.createElement('input');
        input.name = 'invoiceId';
        input.value = invoiceId;
        form.append(input);
        document.body.append(form);
        form.submit();
      }, legacy.id);
      const response = await responsePromise;
      expect(response.status()).toBe(409);
      expect(await response.text()).toContain('BILLING_INVOICE_HISTORICAL_ISSUE_MARKERS');
      expect(invoiceSnapshot(legacy.id)).toEqual(before);
    });
  }
}
