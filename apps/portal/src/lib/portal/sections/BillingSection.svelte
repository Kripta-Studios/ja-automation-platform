<script lang="ts">
  import { base } from '$app/paths';
  import type { ControlledValueDomain } from '../../i18n/controlled-values';
  import type { PortalData, PortalRow as Row } from '../portal-data';
  import { SectionCard, StatusBadge } from '../ui';

  type BillingStage = 'all' | 'wip' | 'drafts' | 'outstanding' | 'overdue';

  type LedgerPayment = {
    id?: unknown;
    grossAmountMinor?: unknown;
    reversedMinor?: unknown;
    netAmountMinor?: unknown;
    currency?: unknown;
    received_at?: unknown;
    reference?: unknown;
  };

  type LedgerReversal = {
    id?: unknown;
    originalPaymentId?: unknown;
    amountMinor?: unknown;
    currency?: unknown;
    effectiveAt?: unknown;
    reasonCode?: unknown;
    reason?: unknown;
  };

  type BillingLedgerRow = {
    invoiceId?: unknown;
    invoiceNumber?: unknown;
    grossPaymentsMinor?: unknown;
    paymentReversalsMinor?: unknown;
    netCollectedMinor?: unknown;
    outstandingMinor?: unknown;
    paymentStatus?: unknown;
    firstPaymentDate?: unknown;
    lastPaymentDate?: unknown;
    paidAt?: unknown;
    payments?: LedgerPayment[];
    paymentReversals?: LedgerReversal[];
  };

  type IssueBlocker = {
    code: string;
    sourceId?: string;
    deepLink?: string;
  };

  type BillingActionResult = {
    success?: boolean;
    message?: string;
    messageKey?: unknown;
    reasons?: unknown;
    issueBlocker?: unknown;
    code?: unknown;
    deepLink?: unknown;
  } | null;

  let {
    data,
    form,
    isAuditor,
    availableProjects,
    translate,
    controlledValue,
    formatMoney,
  }: {
    data: PortalData;
    form?: BillingActionResult;
    isAuditor: boolean;
    availableProjects: Row[];
    translate: (value: string) => string;
    controlledValue: (domain: ControlledValueDomain, value: unknown) => string;
    /** The canonical exact-money formatter. This component never calculates money. */
    formatMoney: (minor: unknown, currency: string) => string;
  } = $props();

  let search = $state('');
  let projectFilter = $state('');
  let stageFilter = $state<BillingStage>('all');

  const invoices = $derived(data.invoices ?? []);
  const billingRules = $derived(data.billingRules ?? []);
  const ledgerRows = $derived(data.ledger ?? []);
  const canManageBilling = $derived(
    !isAuditor && ['owner_admin', 'finance_admin'].includes(String(data.user.role ?? '')),
  );

  function rowValue(row: Row | Record<string, unknown> | undefined, ...keys: string[]): string {
    if (!row) return '';
    const source = row as Record<string, unknown>;
    for (const key of keys) {
      const value = source[key];
      if (value !== null && value !== undefined && value !== '') return String(value);
    }
    return '';
  }

  function ledgerForInvoice(invoiceId: unknown): BillingLedgerRow | undefined {
    const id = String(invoiceId ?? '');
    return ledgerRows.find((row) => {
      const candidate = row as Record<string, unknown>;
      return String(candidate.invoiceId ?? candidate.invoice_id ?? '') === id;
    }) as BillingLedgerRow | undefined;
  }

  function invoiceState(invoice: Row): string {
    return rowValue(invoice, 'state').toLowerCase();
  }

  function invoiceStage(invoice: Row): Exclude<BillingStage, 'all'> | null {
    const state = invoiceState(invoice);
    const ledger = ledgerForInvoice(rowValue(invoice, 'id'));
    const paymentState = String(ledger?.paymentStatus ?? '').toLowerCase();
    if (state === 'overdue' || paymentState === 'overdue') return 'overdue';
    if (['wip', 'ready'].includes(state)) return 'wip';
    if (['draft', 'approved'].includes(state)) return 'drafts';
    if (['issued', 'sent', 'partially_paid', 'paid'].includes(state)) return 'outstanding';
    return null;
  }

  const stageCounts = $derived({
    wip: invoices.filter((invoice) => invoiceStage(invoice) === 'wip').length,
    drafts: invoices.filter((invoice) => invoiceStage(invoice) === 'drafts').length,
    outstanding: invoices.filter((invoice) => invoiceStage(invoice) === 'outstanding').length,
    overdue: invoices.filter((invoice) => invoiceStage(invoice) === 'overdue').length,
  });

  const visibleInvoices = $derived.by(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return invoices.filter((invoice) => {
      const invoiceProject = rowValue(invoice, 'project_id', 'projectId');
      const matchesProject = !projectFilter || invoiceProject === projectFilter;
      const matchesStage = stageFilter === 'all' || invoiceStage(invoice) === stageFilter;
      const matchesSearch =
        !normalizedSearch ||
        [
          rowValue(invoice, 'invoice_number', 'invoiceNumber'),
          rowValue(invoice, 'project_number', 'projectNumber'),
          rowValue(invoice, 'stream_type', 'streamType'),
          rowValue(invoice, 'currency'),
          rowValue(invoice, 'state'),
          rowValue(invoice, 'period_start', 'periodStart'),
          rowValue(invoice, 'period_end', 'periodEnd'),
        ]
          .join(' ')
          .toLowerCase()
          .includes(normalizedSearch);
      return matchesProject && matchesStage && matchesSearch;
    });
  });

  function stageLabel(stage: BillingStage): string {
    switch (stage) {
      case 'wip':
        return translate('WIP / Ready');
      case 'drafts':
        return translate('Drafts');
      case 'outstanding':
        return translate('Outstanding');
      case 'overdue':
        return translate('Overdue');
      default:
        return translate('All invoices');
    }
  }

  function statusVariant(value: unknown): 'success' | 'warning' | 'danger' | 'info' | 'neutral' {
    switch (String(value ?? '').toLowerCase()) {
      case 'paid':
        return 'success';
      case 'issued':
      case 'sent':
      case 'partially_paid':
      case 'approved':
        return 'info';
      case 'overdue':
        return 'danger';
      case 'draft':
      case 'wip':
      case 'ready':
        return 'warning';
      case 'void':
      case 'credited':
        return 'neutral';
      default:
        return 'neutral';
    }
  }

  function dateValue(value: unknown): string {
    const raw = String(value ?? '').trim();
    if (!raw) return translate('Not recorded');
    return raw.replace('T', ' ').slice(0, 16);
  }

  function minorToDecimal(value: unknown): string {
    const raw = String(value ?? '').trim();
    if (!/^\d+$/.test(raw)) return '0.00';
    const normalized = raw.replace(/^0+(?=\d)/, '').padStart(3, '0');
    return `${normalized.slice(0, -2)}.${normalized.slice(-2)}`;
  }

  function positiveMinor(value: unknown): boolean {
    const raw = String(value ?? '').trim();
    return /^\d+$/.test(raw) && raw.replace(/^0+/, '').length > 0;
  }

  function asIssueBlocker(value: unknown): IssueBlocker | undefined {
    if (!value || typeof value !== 'object') return undefined;
    const source = value as Record<string, unknown>;
    const code = String(source.code ?? '').trim();
    if (!code) return undefined;
    const deepLink = String(source.deepLink ?? source.deep_link ?? '').trim();
    const sourceId = String(source.sourceId ?? source.source_id ?? '').trim();
    return {
      code,
      ...(sourceId ? { sourceId } : {}),
      ...(deepLink ? { deepLink } : {}),
    };
  }

  function blockerFromReasons(value: unknown): IssueBlocker | undefined {
    if (Array.isArray(value)) {
      for (const reason of value) {
        const blocker = asIssueBlocker(reason);
        if (blocker) return blocker;
      }
      return undefined;
    }
    return asIssueBlocker(value);
  }

  const issueBlocker = $derived.by(() => {
    if (!form) return undefined;
    return (
      blockerFromReasons(form.reasons) ?? asIssueBlocker(form.issueBlocker) ?? asIssueBlocker(form)
    );
  });

  function invoiceIssueBlocker(invoice: Row): IssueBlocker | undefined {
    const source = invoice as Record<string, unknown>;
    return (
      asIssueBlocker(source.issueBlocker) ??
      asIssueBlocker(source.issue_blocker) ??
      blockerFromReasons(source.issueBlockers ?? source.issue_blockers)
    );
  }

  function blockerHref(blocker: IssueBlocker): string | undefined {
    if (!blocker.deepLink) return undefined;
    return blocker.deepLink.startsWith('/') ? `${base}${blocker.deepLink}` : blocker.deepLink;
  }

  function blockerMessage(blocker: IssueBlocker): string {
    if (blocker.code === 'customer_signoff_required')
      return translate('Customer sign-off is required before this invoice can be issued.');
    return translate('Invoice issue is blocked until billing readiness is complete.');
  }

  function projectLabel(project: Row): string {
    const number = rowValue(project, 'project_number', 'projectNumber');
    const name = rowValue(project, 'name', 'project_name', 'projectName');
    const currency = rowValue(project, 'currency');
    return [number, name, currency ? `(${currency})` : ''].filter(Boolean).join(' — ');
  }

  function invoiceCurrency(invoice: Row): string {
    return rowValue(invoice, 'currency') || 'USD';
  }

  function invoiceTotal(invoice: Row): string {
    return formatMoney(rowValue(invoice, 'total_minor', 'totalMinor'), invoiceCurrency(invoice));
  }

  function invoiceStatus(invoice: Row): string {
    return (
      controlledValue('status', rowValue(invoice, 'state')) ||
      rowValue(invoice, 'state') ||
      translate('Unknown')
    );
  }

  function invoiceTitle(invoice: Row): string {
    return rowValue(invoice, 'invoice_number', 'invoiceNumber') || translate('Draft invoice');
  }

  function paymentStatus(ledger: BillingLedgerRow | undefined): string {
    return ledger
      ? controlledValue('status', ledger.paymentStatus) || translate('Unpaid')
      : translate('No ledger row');
  }
</script>

<div class="billing-section" data-ui="billing-section">
  <header class="billing-section__context">
    <div>
      <p class="billing-section__eyebrow">{translate('Finance operations')}</p>
      <h2>{translate('Billing')}</h2>
      <p>
        {translate(
          'Move approved sources through draft, issue, collection and correction lifecycles with a reconciled ledger.',
        )}
      </p>
    </div>
    {#if isAuditor}
      <span class="billing-section__read-only" role="status">{translate('Read-only review')}</span>
    {/if}
  </header>

  {#if issueBlocker}
    <aside class="billing-section__issue-blocker" data-issue-blocker role="alert">
      <div>
        <strong>{translate('Invoice issue blocked')}</strong>
        <span>{blockerMessage(issueBlocker)}</span>
      </div>
      {#if blockerHref(issueBlocker)}
        <a href={blockerHref(issueBlocker)}>{translate('Open sign-off')}</a>
      {/if}
    </aside>
  {/if}

  <div class="billing-section__summary" aria-label={translate('Billing stage summary')}>
    {#each [['wip', 'WIP / Ready', stageCounts.wip], ['drafts', 'Drafts', stageCounts.drafts], ['outstanding', 'Outstanding', stageCounts.outstanding], ['overdue', 'Overdue', stageCounts.overdue]] as summary}
      <button
        type="button"
        class:billing-section__summary-card--active={stageFilter === summary[0]}
        class:billing-section__summary-card--danger={summary[0] === 'overdue'}
        class="billing-section__summary-card"
        aria-pressed={stageFilter === summary[0]}
        onclick={() => (stageFilter = summary[0] as BillingStage)}
      >
        <span>{translate(String(summary[1]))}</span>
        <strong>{summary[2]}</strong>
        <small>{translate('Open stage filter')}</small>
      </button>
    {/each}
  </div>

  <form
    class="billing-section__filters"
    aria-label={translate('Filter billing')}
    onsubmit={(event) => event.preventDefault()}
  >
    <label>
      <span>{translate('Search invoices')}</span>
      <input
        bind:value={search}
        type="search"
        placeholder={translate('Invoice, project or period')}
      />
    </label>
    <label>
      <span>{translate('Project')}</span>
      <select bind:value={projectFilter}>
        <option value="">{translate('All projects')}</option>
        {#each availableProjects as project}
          <option value={rowValue(project, 'id')}>{projectLabel(project)}</option>
        {/each}
      </select>
    </label>
    <label>
      <span>{translate('Stage')}</span>
      <select bind:value={stageFilter}>
        <option value="all">{translate('All invoices')}</option>
        <option value="wip">{translate('WIP / Ready')}</option>
        <option value="drafts">{translate('Drafts')}</option>
        <option value="outstanding">{translate('Outstanding')}</option>
        <option value="overdue">{translate('Overdue')}</option>
      </select>
    </label>
    <button
      type="button"
      class="secondary-button"
      onclick={() => {
        search = '';
        projectFilter = '';
        stageFilter = 'all';
      }}>{translate('Clear filters')}</button
    >
  </form>

  {#if canManageBilling}
    <details class="billing-section__config">
      <summary class="primary-button">{translate('Configure billing')}</summary>
      <div class="billing-section__config-body">
        <div class="billing-section__config-heading">
          <div>
            <h3>{translate('Billing configuration')}</h3>
            <p>
              {translate(
                'Configure effective billing streams and source rules. Configuration does not create actual time or payments.',
              )}
            </p>
          </div>
        </div>

        <form method="POST" action="?/createBillingRule" class="billing-section__config-form">
          <h4>{translate('New billing stream')}</h4>
          <label>
            <span>{translate('Project')}</span>
            <select name="projectId" required>
              <option value="">{translate('Select project')}</option>
              {#each availableProjects as project}
                <option value={rowValue(project, 'id')}>{projectLabel(project)}</option>
              {/each}
            </select>
          </label>
          <label>
            <span>{translate('Stream')}</span>
            <select name="streamType" required>
              <option value="labor">{translate('Labor')}</option>
              <option value="expense">{translate('Expenses')}</option>
              <option value="milestone">{translate('Milestone')}</option>
              <option value="other">{translate('Other')}</option>
            </select>
          </label>
          <label>
            <span>{translate('Cadence')}</span>
            <select name="cadenceType" required>
              <option value="weekly">{translate('Weekly')}</option>
              <option value="every_14_days">{translate('Every 14 days')}</option>
              <option value="semi_monthly">{translate('Semi-monthly')}</option>
              <option value="monthly">{translate('Monthly')}</option>
              <option value="custom">{translate('Custom')}</option>
              <option value="milestone">{translate('Milestone')}</option>
              <option value="manual">{translate('Manual')}</option>
            </select>
          </label>
          <label>
            <span>{translate('Effective from')}</span>
            <input name="effectiveFrom" type="date" required />
          </label>
          <label>
            <span>{translate('Anchor date')}</span>
            <input name="anchorDate" type="date" />
          </label>
          <label>
            <span>{translate('Legal entity')}</span>
            <select name="legalEntityId" required>
              <option value="">{translate('Select legal entity')}</option>
              {#each data.legalEntities ?? [] as entity}
                <option value={rowValue(entity, 'id')}>
                  {rowValue(entity, 'code')} — {rowValue(entity, 'legal_name', 'legalName')}
                </option>
              {/each}
            </select>
          </label>
          <label>
            <span>{translate('Tax profile')}</span>
            <select name="taxProfileId" required>
              <option value="">{translate('Select tax profile')}</option>
              {#each data.taxProfiles ?? [] as profile}
                <option value={rowValue(profile, 'id')}>
                  {rowValue(profile, 'name')} ({rowValue(profile, 'currency')})
                </option>
              {/each}
            </select>
          </label>
          <label>
            <span>{translate('Currency')}</span>
            <select name="currency" required>
              <option>USD</option>
              <option>BRL</option>
              <option>EUR</option>
            </select>
          </label>
          <label>
            <span>{translate('Invoice template')}</span>
            <select name="templateId" required>
              <option value="default">{translate('Default')}</option>
              <option value="labor-detailed">{translate('Labor detailed')}</option>
              <option value="labor-summary">{translate('Labor summary')}</option>
              <option value="expenses-detailed">{translate('Expenses detailed')}</option>
              <option value="fixed-milestone">{translate('Fixed milestone')}</option>
            </select>
          </label>
          <label>
            <span>{translate('Recipient email')}</span>
            <input name="recipientEmail" type="email" />
          </label>
          <label>
            <span>{translate('Billing contact')}</span>
            <select name="billingContactId">
              <option value="">{translate('Use recipient email')}</option>
              {#each data.contacts ?? [] as contact}
                <option value={rowValue(contact, 'id')}>
                  {rowValue(contact, 'client_number', 'clientNumber')} · {rowValue(contact, 'name')} ·
                  {rowValue(contact, 'email') || translate('no email')}
                </option>
              {/each}
            </select>
          </label>
          <label>
            <span>{translate('Payment terms (days)')}</span>
            <input name="paymentTermsDays" type="number" min="0" max="365" value="30" required />
          </label>
          <label>
            <span>{translate('PO reference')}</span>
            <input name="poNumberOverride" />
          </label>
          <label>
            <span>{translate('Grouping')}</span>
            <select name="groupingMode">
              <option value="summary">{translate('Summary')}</option>
              <option value="detail">{translate('Detail')}</option>
              <option value="by_worker">{translate('By worker')}</option>
              <option value="by_day">{translate('By day')}</option>
              <option value="by_category">{translate('By category')}</option>
            </select>
          </label>
          <label>
            <span>{translate('Semi-monthly rule')}</span>
            <input name="semiMonthlyRule" value="1_15_16_end" required />
          </label>
          <label class="billing-section__checkbox">
            <input name="autoGenerateDraft" type="checkbox" />
            <span>{translate('Generate drafts when the stream is due')}</span>
          </label>
          <button type="submit">{translate('Save billing stream')}</button>
        </form>

        <div class="billing-section__config-compact-grid">
          <form method="POST" action="?/createLegalEntity" class="billing-section__config-form">
            <h4>{translate('New legal entity')}</h4>
            <label><span>{translate('Code')}</span><input name="code" required /></label>
            <label><span>{translate('Legal name')}</span><input name="legalName" required /></label>
            <label>
              <span>{translate('Currency')}</span>
              <select name="currency"
                ><option>USD</option><option>BRL</option><option>EUR</option></select
              >
            </label>
            <label
              ><span>{translate('Billing address')}</span><textarea
                name="billingAddress"
                rows="3"
                required
              ></textarea></label
            >
            <label
              ><span>{translate('Company identifiers')}</span><textarea
                name="companyIdentifiers"
                rows="2"
                required
              ></textarea></label
            >
            <button type="submit">{translate('Save legal entity')}</button>
          </form>

          <form method="POST" action="?/createTaxProfile" class="billing-section__config-form">
            <h4>{translate('New tax profile')}</h4>
            <label>
              <span>{translate('Legal entity')}</span>
              <select name="legalEntityId">
                <option value="">{translate('Global profile')}</option>
                {#each data.legalEntities ?? [] as entity}
                  <option value={rowValue(entity, 'id')}
                    >{rowValue(entity, 'code')} — {rowValue(
                      entity,
                      'legal_name',
                      'legalName',
                    )}</option
                  >
                {/each}
              </select>
            </label>
            <label><span>{translate('Name')}</span><input name="name" required /></label>
            <label>
              <span>{translate('Currency')}</span>
              <select name="currency"
                ><option>USD</option><option>BRL</option><option>EUR</option></select
              >
            </label>
            <label
              ><span>{translate('Effective from')}</span><input
                name="effectiveFrom"
                type="date"
                required
              /></label
            >
            <label
              ><span>{translate('Component')}</span><input
                name="componentName"
                value="VAT / sales tax"
                required
              /></label
            >
            <label
              ><span>{translate('Rate (basis points)')}</span><input
                name="componentBasisPoints"
                type="number"
                min="0"
                max="100000"
                value="0"
                required
              /></label
            >
            <label class="billing-section__checkbox"
              ><input name="componentCompound" type="checkbox" /><span
                >{translate('Compound tax')}</span
              ></label
            >
            <button type="submit">{translate('Save tax profile')}</button>
          </form>

          <form
            method="POST"
            action="?/createInvoiceNumberPolicy"
            class="billing-section__config-form"
          >
            <h4>{translate('Invoice numbering policy')}</h4>
            <label>
              <span>{translate('Legal entity')}</span>
              <select name="legalEntityId" required>
                <option value="">{translate('Select entity')}</option>
                {#each data.legalEntities ?? [] as entity}
                  <option value={rowValue(entity, 'id')}
                    >{rowValue(entity, 'code')} — {rowValue(
                      entity,
                      'legal_name',
                      'legalName',
                    )}</option
                  >
                {/each}
              </select>
            </label>
            <label
              ><span>{translate('Prefix')}</span><input name="prefix" value="JA-" required /></label
            >
            <label
              ><span>{translate('Digits')}</span><input
                name="digits"
                type="number"
                min="4"
                max="10"
                value="6"
                required
              /></label
            >
            <label
              ><span>{translate('Effective from')}</span><input
                name="effectiveFrom"
                type="date"
                required
              /></label
            >
            <label
              ><span>{translate('Accountant approved at')}</span><input
                name="accountantApprovedAt"
                type="datetime-local"
                required
              /></label
            >
            <button type="submit">{translate('Save numbering policy')}</button>
          </form>
        </div>
      </div>
    </details>
  {/if}

  <SectionCard title={translate('Billing rules')} class="billing-section__rules">
    <div class="billing-section__section-intro">
      <p>{translate('Streams define source cadence and controlled invoice configuration.')}</p>
      <span>{billingRules.length}</span>
    </div>
    {#if billingRules.length > 0}
      <div class="billing-section__rule-list" aria-live="polite">
        {#each billingRules as rule}
          <article class="billing-section__rule" data-billing-rule={rowValue(rule, 'id')}>
            <div>
              <strong
                >{rowValue(rule, 'project_number', 'projectNumber')} · {rowValue(
                  rule,
                  'stream_type',
                  'streamType',
                )}</strong
              >
              <small>
                {controlledValue('status', rowValue(rule, 'cadence_type', 'cadenceType'))} ·
                {rowValue(rule, 'currency')} ·
                {rowValue(rule, 'tax_profile_name', 'taxProfileName') ||
                  translate('No tax profile')}
              </small>
            </div>
            {#if canManageBilling}
              <details class="billing-section__rule-editor">
                <summary class="secondary-button">{translate('Manage stream')}</summary>
                <div class="billing-section__rule-actions">
                  <form
                    method="POST"
                    action="?/updateBillingRule"
                    class="billing-section__inline-form"
                  >
                    <input type="hidden" name="billingRuleId" value={rowValue(rule, 'id')} />
                    <label
                      ><span>{translate('Invoice template')}</span><select name="templateId">
                        <option
                          value="default"
                          selected={rowValue(rule, 'template_id', 'templateId') === 'default'}
                          >{translate('Default')}</option
                        >
                        <option
                          value="labor-detailed"
                          selected={rowValue(rule, 'template_id', 'templateId') ===
                            'labor-detailed'}>{translate('Labor detailed')}</option
                        >
                        <option
                          value="labor-summary"
                          selected={rowValue(rule, 'template_id', 'templateId') === 'labor-summary'}
                          >{translate('Labor summary')}</option
                        >
                        <option
                          value="expenses-detailed"
                          selected={rowValue(rule, 'template_id', 'templateId') ===
                            'expenses-detailed'}>{translate('Expenses detailed')}</option
                        >
                        <option
                          value="fixed-milestone"
                          selected={rowValue(rule, 'template_id', 'templateId') ===
                            'fixed-milestone'}>{translate('Fixed milestone')}</option
                        >
                      </select></label
                    >
                    <label
                      ><span>{translate('Recipient email')}</span><input
                        name="recipientEmail"
                        type="email"
                        value={rowValue(rule, 'recipient_email', 'recipientEmail')}
                      /></label
                    >
                    <label
                      ><span>{translate('Payment terms (days)')}</span><input
                        name="paymentTermsDays"
                        type="number"
                        min="0"
                        max="365"
                        value={rowValue(rule, 'payment_terms_days', 'paymentTermsDays') || '30'}
                      /></label
                    >
                    <label
                      ><span>{translate('PO reference')}</span><input
                        name="poNumberOverride"
                        value={rowValue(rule, 'po_number_override', 'poNumberOverride')}
                      /></label
                    >
                    <label
                      ><span>{translate('Grouping')}</span><select name="groupingMode">
                        <option
                          value="summary"
                          selected={rowValue(rule, 'grouping_mode', 'groupingMode') === 'summary'}
                          >{translate('Summary')}</option
                        >
                        <option
                          value="detail"
                          selected={rowValue(rule, 'grouping_mode', 'groupingMode') === 'detail'}
                          >{translate('Detail')}</option
                        >
                        <option
                          value="by_worker"
                          selected={rowValue(rule, 'grouping_mode', 'groupingMode') === 'by_worker'}
                          >{translate('By worker')}</option
                        >
                        <option
                          value="by_day"
                          selected={rowValue(rule, 'grouping_mode', 'groupingMode') === 'by_day'}
                          >{translate('By day')}</option
                        >
                        <option
                          value="by_category"
                          selected={rowValue(rule, 'grouping_mode', 'groupingMode') ===
                            'by_category'}>{translate('By category')}</option
                        >
                      </select></label
                    >
                    <button type="submit">{translate('Save billing stream')}</button>
                  </form>
                  <form
                    method="POST"
                    action="?/archiveBillingRule"
                    onsubmit={(event) => {
                      if (!confirm(translate('Archive this billing rule?'))) event.preventDefault();
                    }}
                  >
                    <input type="hidden" name="billingRuleId" value={rowValue(rule, 'id')} />
                    <button type="submit" class="danger"
                      >{translate('Archive billing stream')}</button
                    >
                  </form>
                  <form method="POST" action="?/createDraft" class="billing-section__period-form">
                    <input type="hidden" name="billingRuleId" value={rowValue(rule, 'id')} />
                    <label
                      ><span>{translate('Period start')}</span><input
                        name="periodStart"
                        type="date"
                        required
                      /></label
                    >
                    <label
                      ><span>{translate('Period end')}</span><input
                        name="periodEnd"
                        type="date"
                        required
                      /></label
                    >
                    <button type="submit">{translate('Build draft')}</button>
                  </form>
                  <form method="POST" action="?/closePeriod" class="billing-section__period-form">
                    <input type="hidden" name="billingRuleId" value={rowValue(rule, 'id')} />
                    <label
                      ><span>{translate('Close period start')}</span><input
                        name="periodStart"
                        type="date"
                        required
                      /></label
                    >
                    <label
                      ><span>{translate('Close period end')}</span><input
                        name="periodEnd"
                        type="date"
                        required
                      /></label
                    >
                    <label
                      ><span>{translate('Report language')}</span><select name="reportLocale"
                        ><option value="en">{translate('English')}</option><option value="pt"
                          >{translate('Português (BR)')}</option
                        ><option value="es">{translate('Spanish')}</option></select
                      ></label
                    >
                    <button type="submit">{translate('Close sources')}</button>
                  </form>
                </div>
              </details>
            {/if}
          </article>
        {/each}
      </div>
    {:else}
      <div class="billing-section__empty" role="status">
        <strong>{translate('No billing streams configured.')}</strong>
        <span>{translate('Create an effective-dated stream to prepare an invoice draft.')}</span>
      </div>
    {/if}
  </SectionCard>

  <SectionCard title={translate('Invoice register')} class="billing-section__invoices">
    <div class="billing-section__section-intro">
      <p>
        {stageFilter === 'all'
          ? translate('Invoices and reconciled collection history.')
          : `${stageLabel(stageFilter)} · ${translate('filtered')}`}
      </p>
      <span>{visibleInvoices.length}</span>
    </div>

    {#if visibleInvoices.length > 0}
      <div class="billing-section__invoice-list" data-billing-invoice-list aria-live="polite">
        {#each visibleInvoices as invoice}
          {@const invoiceId = rowValue(invoice, 'id')}
          {@const invoiceStateValue = invoiceState(invoice)}
          {@const ledger = ledgerForInvoice(invoiceId)}
          {@const currency = invoiceCurrency(invoice)}
          {@const rowBlocker = invoiceIssueBlocker(invoice)}
          <article class="billing-section__invoice" data-invoice-row={invoiceId}>
            <div class="billing-section__invoice-heading">
              <div>
                <strong
                  >{invoiceTitle(invoice)} · {rowValue(
                    invoice,
                    'project_number',
                    'projectNumber',
                  )}</strong
                >
                <small>
                  {controlledValue('billingStream', rowValue(invoice, 'stream_type', 'streamType'))} ·
                  {invoiceStatus(invoice)} · {invoiceTotal(invoice)} · {translate('Currency')}: {currency}
                </small>
              </div>
              <StatusBadge
                variant={statusVariant(invoiceStateValue)}
                text={invoiceStatus(invoice)}
              />
            </div>

            <div class="billing-section__invoice-dates" aria-label={translate('Invoice timeline')}>
              <div>
                <span>{translate('Planned issue')}</span><strong
                  >{dateValue(rowValue(invoice, 'planned_issue_on', 'plannedIssueOn'))}</strong
                >
              </div>
              <div>
                <span>{translate('Actual issue')}</span><strong
                  >{dateValue(rowValue(invoice, 'issued_at', 'issuedAt'))}</strong
                >
              </div>
              <div>
                <span>{translate('Expected collection')}</span><strong
                  >{dateValue(
                    rowValue(invoice, 'expected_collection_on', 'expectedCollectionOn'),
                  )}</strong
                >
              </div>
              <div>
                <span>{translate('Actual collection')}</span><strong
                  >{dateValue(ledger?.paidAt ?? ledger?.lastPaymentDate)}</strong
                >
              </div>
            </div>

            {#if canManageBilling && ['draft', 'approved'].includes(invoiceStateValue)}
              <form
                method="POST"
                action="?/setInvoicePlanningDates"
                class="billing-section__planning-form"
                aria-label={translate('Plan invoice dates')}
              >
                <fieldset>
                  <legend>{translate('Planned and expected dates')}</legend>
                  <p>
                    {translate(
                      'Planning and expected values are directional controls. They never count as actual time, paid cash, or collected revenue.',
                    )}
                  </p>
                  <div class="billing-section__planning-fields">
                    <label
                      ><span>{translate('Planned issue')}</span><input
                        name="plannedIssueOn"
                        type="date"
                        value={rowValue(invoice, 'planned_issue_on', 'plannedIssueOn')}
                      /></label
                    >
                    <label
                      ><span>{translate('Expected collection')}</span><input
                        name="expectedCollectionOn"
                        type="date"
                        value={rowValue(invoice, 'expected_collection_on', 'expectedCollectionOn')}
                      /></label
                    >
                    <input type="hidden" name="invoiceId" value={invoiceId} />
                    <input
                      type="hidden"
                      name="expectedVersion"
                      value={rowValue(invoice, 'version')}
                    />
                    <button type="submit">{translate('Save planning dates')}</button>
                  </div>
                </fieldset>
              </form>
            {/if}

            <p class="billing-section__timeline-note">
              {translate('Only append-only payment events count as collected')}
            </p>

            {#if ledger}
              <div class="billing-section__invoice-ledger">
                <span
                  >{translate('Collected')}:
                  <strong>{formatMoney(ledger.netCollectedMinor, currency)}</strong></span
                >
                <span
                  >{translate('Outstanding')}:
                  <strong>{formatMoney(ledger.outstandingMinor, currency)}</strong></span
                >
                <span>{translate('Payment state')}: <strong>{paymentStatus(ledger)}</strong></span>
              </div>
            {/if}

            {#if rowBlocker}
              <aside class="billing-section__row-blocker" data-invoice-issue-blocker role="alert">
                <span>{blockerMessage(rowBlocker)}</span>
                {#if blockerHref(rowBlocker)}<a href={blockerHref(rowBlocker)}
                    >{translate('Open sign-off')}</a
                  >{/if}
              </aside>
            {/if}

            {#if ledger}
              <details class="billing-section__payment-history">
                <summary>{translate('Collections and reversals')}</summary>
                <div class="billing-section__history-summary">
                  <span
                    >{translate('Gross')}: {formatMoney(ledger.grossPaymentsMinor, currency)}</span
                  >
                  <span
                    >{translate('Reversals')}: {formatMoney(
                      ledger.paymentReversalsMinor,
                      currency,
                    )}</span
                  >
                  <span>{translate('Net')}: {formatMoney(ledger.netCollectedMinor, currency)}</span>
                </div>
                {#each ledger.payments ?? [] as payment}
                  <article class="billing-section__payment-row">
                    <div>
                      <strong
                        >{translate('Payment')} · {String(payment.id ?? '—').slice(0, 12)}</strong
                      >
                      <small>
                        {formatMoney(
                          payment.grossAmountMinor,
                          String(payment.currency ?? currency),
                        )} ·
                        {dateValue(payment.received_at)} · {String(
                          payment.reference ?? translate('No reference'),
                        )}
                      </small>
                      <small>
                        {translate('Reversed')}: {formatMoney(
                          payment.reversedMinor,
                          String(payment.currency ?? currency),
                        )} ·
                        {translate('Net')}: {formatMoney(
                          payment.netAmountMinor,
                          String(payment.currency ?? currency),
                        )}
                      </small>
                    </div>
                    {#if canManageBilling && !['void', 'credited'].includes(invoiceStateValue) && positiveMinor(payment.netAmountMinor)}
                      <form
                        method="POST"
                        action="?/reversePayment"
                        class="billing-section__payment-form"
                      >
                        <input type="hidden" name="paymentId" value={String(payment.id ?? '')} />
                        <label
                          ><span>{translate('Reversal amount')}</span><input
                            name="amount"
                            inputmode="decimal"
                            type="number"
                            min="0.01"
                            step="0.01"
                            max={minorToDecimal(payment.netAmountMinor)}
                            value={minorToDecimal(payment.netAmountMinor)}
                            required
                          /></label
                        >
                        <label
                          ><span>{translate('Effective date')}</span><input
                            name="effectiveOn"
                            type="date"
                            required
                          /></label
                        >
                        <label
                          ><span>{translate('Reason code')}</span><select name="reasonCode" required
                            ><option value="bank_return">{translate('Bank return')}</option><option
                              value="duplicate">{translate('Duplicate')}</option
                            ><option value="entry_correction"
                              >{translate('Entry correction')}</option
                            ><option value="other">{translate('Other')}</option></select
                          ></label
                        >
                        <label
                          ><span>{translate('Reason')}</span><input name="reason" required /></label
                        >
                        <input
                          type="hidden"
                          name="idempotencyKey"
                          value={`reversal-${String(payment.id ?? '')}-${String(payment.netAmountMinor ?? '0')}`}
                        />
                        <button type="submit">{translate('Reverse payment')}</button>
                      </form>
                    {/if}
                  </article>
                {:else}
                  <p class="billing-section__empty">{translate('No payments recorded.')}</p>
                {/each}
                {#if (ledger.paymentReversals?.length ?? 0) > 0}
                  <div class="billing-section__reversal-table">
                    <table>
                      <caption>{translate('Immutable reversal history')}</caption>
                      <thead
                        ><tr
                          ><th scope="col">{translate('Payment')}</th><th scope="col"
                            >{translate('Amount')}</th
                          ><th scope="col">{translate('Effective date')}</th><th scope="col"
                            >{translate('Reason code')}</th
                          ><th scope="col">{translate('Reason')}</th></tr
                        ></thead
                      >
                      <tbody>
                        {#each ledger.paymentReversals ?? [] as reversal}
                          <tr
                            ><td>{String(reversal.originalPaymentId ?? '—').slice(0, 12)}</td><td
                              >{formatMoney(
                                reversal.amountMinor,
                                String(reversal.currency ?? currency),
                              )}</td
                            ><td>{dateValue(reversal.effectiveAt)}</td><td
                              >{controlledValue('status', reversal.reasonCode)}</td
                            ><td>{String(reversal.reason ?? '—')}</td></tr
                          >
                        {/each}
                      </tbody>
                    </table>
                  </div>
                {/if}
              </details>
            {/if}

            <div class="billing-section__invoice-actions">
              <a
                class="secondary-button"
                href={`${base}/app/billing/invoices/${encodeURIComponent(invoiceId)}`}
                >{translate('Preview')}</a
              >
              {#if isAuditor}
                <span class="billing-section__read-only"
                  >{translate('Issued history is immutable')}</span
                >
              {:else if invoiceStateValue === 'draft'}
                <form method="POST" action="?/approveInvoice">
                  <input type="hidden" name="invoiceId" value={invoiceId} />
                  <button type="submit">{translate('Approve')}</button>
                </form>
                <form method="POST" action="?/deleteInvoice">
                  <input type="hidden" name="invoiceId" value={invoiceId} />
                  <button type="submit" class="danger">{translate('Discard draft')}</button>
                </form>
              {:else if invoiceStateValue === 'approved'}
                <form method="POST" action="?/issueInvoice">
                  <input type="hidden" name="invoiceId" value={invoiceId} />
                  <label
                    ><span>{translate('Report language')}</span><select name="reportLocale"
                      ><option value="en">EN</option><option value="pt">PT-BR</option><option
                        value="es">ES</option
                      ></select
                    ></label
                  >
                  <button type="submit">{translate('Issue invoice')}</button>
                </form>
              {:else if ['issued', 'sent', 'partially_paid', 'overdue'].includes(invoiceStateValue)}
                <form method="POST" action="?/recordPayment" class="billing-section__payment-form">
                  <input type="hidden" name="invoiceId" value={invoiceId} />
                  <label
                    ><span>{translate('Payment amount')}</span><input
                      name="amount"
                      inputmode="decimal"
                      type="number"
                      min="0.01"
                      step="0.01"
                      max={minorToDecimal(
                        ledger?.outstandingMinor ?? rowValue(invoice, 'total_minor', 'totalMinor'),
                      )}
                      required
                    /></label
                  >
                  <label
                    ><span>{translate('Currency')}</span><input
                      name="currency"
                      value={currency}
                      readonly
                      aria-readonly="true"
                      required
                    /></label
                  >
                  <label
                    ><span>{translate('Received on')}</span><input
                      name="receivedOn"
                      type="date"
                      required
                    /></label
                  >
                  <label
                    ><span>{translate('Payment reference / note')}</span><input
                      name="reference"
                      required
                    /></label
                  >
                  <input
                    name="idempotencyKey"
                    type="hidden"
                    value={rowValue(invoice, 'paymentCommandToken') ||
                      `payment-${invoiceId}-${currency}`}
                  />
                  <button type="submit">{translate('Record payment')}</button>
                </form>
                {#if invoiceStateValue === 'issued'}
                  <form method="POST" action="?/sendInvoice">
                    <input type="hidden" name="invoiceId" value={invoiceId} />
                    <input type="hidden" name="idempotencyKey" value={`send-${invoiceId}`} />
                    <button type="submit">{translate('Mark sent')}</button>
                  </form>
                {/if}
                <form method="POST" action="?/voidInvoice">
                  <input type="hidden" name="invoiceId" value={invoiceId} />
                  <input type="hidden" name="idempotencyKey" value={`void-${invoiceId}`} />
                  <label
                    ><span>{translate('Void reason')}</span><input name="reason" required /></label
                  >
                  <button type="submit" class="danger">{translate('Void')}</button>
                </form>
                <form
                  method="POST"
                  action="?/createInvoiceAdjustment"
                  class="billing-section__payment-form"
                >
                  <input type="hidden" name="originalInvoiceId" value={invoiceId} />
                  <label
                    ><span>{translate('Adjustment type')}</span><select name="adjustmentType"
                      ><option value="credit">{translate('Credit')}</option><option value="debit"
                        >{translate('Debit')}</option
                      ><option value="correction">{translate('Correction')}</option></select
                    ></label
                  >
                  <label
                    ><span>{translate('Minor-unit amount')}</span><input
                      name="amountMinor"
                      required
                    /></label
                  >
                  <label
                    ><span>{translate('Adjustment reason')}</span><input
                      name="reason"
                      required
                    /></label
                  >
                  <button type="submit">{translate('Create adjustment')}</button>
                </form>
              {:else}
                <span class="billing-section__read-only"
                  >{translate('No lifecycle action available')}</span
                >
              {/if}
            </div>
          </article>
        {/each}
      </div>
    {:else}
      <div class="billing-section__empty" role="status">
        <strong>{translate('No invoices match this view.')}</strong>
        <span
          >{translate('Adjust filters or build a draft from an authorized billing stream.')}</span
        >
      </div>
    {/if}
  </SectionCard>
</div>

<style>
  .billing-section {
    display: grid;
    gap: 1.25rem;
  }

  .billing-section__context {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 1rem;
  }

  .billing-section__eyebrow {
    margin: 0 0 0.35rem;
    color: var(--portal-muted, #64748b);
    font-size: 0.72rem;
    font-weight: 750;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }

  .billing-section__context h2 {
    margin: 0;
    color: var(--portal-ink, #16202a);
    font-size: clamp(1.55rem, 2vw, 2rem);
    letter-spacing: -0.025em;
  }

  .billing-section__context p:last-child {
    max-width: 48rem;
    margin: 0.4rem 0 0;
    color: var(--portal-muted, #64748b);
  }

  .billing-section__read-only {
    color: var(--portal-muted, #64748b);
    font-size: 0.78rem;
    font-weight: 700;
  }

  .billing-section__issue-blocker,
  .billing-section__row-blocker {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1rem;
    padding: 0.9rem 1rem;
    border: 1px solid
      color-mix(in srgb, var(--portal-danger, #b42318) 44%, var(--portal-border, #d7dee8));
    border-radius: 0.7rem;
    background: color-mix(in srgb, var(--portal-danger, #b42318) 7%, var(--portal-surface, #fff));
  }

  .billing-section__issue-blocker > div,
  .billing-section__row-blocker {
    display: grid;
    gap: 0.25rem;
  }

  .billing-section__issue-blocker span,
  .billing-section__row-blocker span {
    color: var(--portal-muted, #64748b);
    font-size: 0.86rem;
  }

  .billing-section__issue-blocker a,
  .billing-section__row-blocker a {
    color: var(--portal-accent, #0f5f73);
    font-weight: 750;
    white-space: nowrap;
  }

  .billing-section__summary {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 0.75rem;
  }

  .billing-section__summary-card {
    display: grid;
    gap: 0.22rem;
    min-height: 6.25rem;
    padding: 0.9rem 1rem;
    border: 1px solid var(--portal-border, #d7dee8);
    border-radius: 0.75rem;
    background: var(--portal-surface, #fff);
    color: var(--portal-ink, #16202a);
    text-align: left;
    cursor: pointer;
    font: inherit;
  }

  .billing-section__summary-card:hover,
  .billing-section__summary-card--active {
    border-color: var(--portal-accent, #0f5f73);
    background: color-mix(in srgb, var(--portal-accent, #0f5f73) 7%, var(--portal-surface, #fff));
  }

  .billing-section__summary-card--danger {
    border-color: color-mix(
      in srgb,
      var(--portal-danger, #b42318) 40%,
      var(--portal-border, #d7dee8)
    );
  }

  .billing-section__summary-card span,
  .billing-section__summary-card small {
    color: var(--portal-muted, #64748b);
    font-size: 0.78rem;
  }

  .billing-section__summary-card strong {
    font-size: 1.45rem;
    font-variant-numeric: tabular-nums;
  }

  .billing-section__filters {
    display: grid;
    grid-template-columns: minmax(16rem, 2fr) minmax(12rem, 1fr) minmax(12rem, 1fr) auto;
    align-items: end;
    gap: 0.75rem;
    padding: 0.9rem 1rem;
    border: 1px solid var(--portal-border, #d7dee8);
    border-radius: 0.75rem;
    background: color-mix(in srgb, var(--portal-surface, #fff) 92%, var(--portal-wash, #eef2f5));
  }

  .billing-section__filters label,
  .billing-section__config-form label,
  .billing-section__inline-form label,
  .billing-section__period-form label,
  .billing-section__payment-form label,
  .billing-section__invoice-actions > form > label {
    display: grid;
    gap: 0.35rem;
    color: var(--portal-muted, #64748b);
    font-size: 0.78rem;
    font-weight: 650;
  }

  .billing-section__filters input,
  .billing-section__filters select,
  .billing-section__config-form input,
  .billing-section__config-form select,
  .billing-section__config-form textarea,
  .billing-section__inline-form input,
  .billing-section__inline-form select,
  .billing-section__period-form input,
  .billing-section__period-form select,
  .billing-section__payment-form input,
  .billing-section__payment-form select,
  .billing-section__invoice-actions input,
  .billing-section__invoice-actions select {
    box-sizing: border-box;
    width: 100%;
    min-height: 2.75rem;
    padding: 0.55rem 0.7rem;
    border: 1px solid var(--portal-border-strong, #b8c3d1);
    border-radius: 0.5rem;
    background: var(--portal-surface, #fff);
    color: var(--portal-ink, #16202a);
    font: inherit;
  }

  .billing-section__filters button,
  .billing-section__config button,
  .billing-section__rule-actions button,
  .billing-section__invoice-actions button,
  .billing-section__invoice-actions a,
  .billing-section__payment-form button,
  .billing-section__rule-editor summary {
    min-height: 2.75rem;
  }

  .billing-section__config {
    border: 1px solid var(--portal-border, #d7dee8);
    border-radius: 0.75rem;
    background: var(--portal-surface, #fff);
  }

  .billing-section__config > summary {
    width: fit-content;
    margin: 0.9rem;
    cursor: pointer;
    list-style: none;
  }

  .billing-section__config > summary::-webkit-details-marker,
  .billing-section__rule-editor > summary::-webkit-details-marker,
  .billing-section__payment-history > summary::-webkit-details-marker {
    display: none;
  }

  .billing-section__config-body {
    display: grid;
    gap: 1rem;
    padding: 0 1rem 1rem;
    border-top: 1px solid var(--portal-border, #d7dee8);
  }

  .billing-section__config-heading h3,
  .billing-section__config-form h4 {
    margin: 0;
    color: var(--portal-ink, #16202a);
  }

  .billing-section__config-heading p,
  .billing-section__section-intro p {
    margin: 0.35rem 0 0;
    color: var(--portal-muted, #64748b);
  }

  .billing-section__config-form {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 0.75rem;
    padding: 1rem 0;
    border-bottom: 1px solid var(--portal-border, #d7dee8);
  }

  .billing-section__config-form h4,
  .billing-section__config-form > button {
    grid-column: 1 / -1;
  }

  .billing-section__config-form textarea {
    min-height: 5rem;
    resize: vertical;
  }

  .billing-section__checkbox {
    display: flex !important;
    align-items: center;
    gap: 0.5rem !important;
    min-height: 2.75rem;
  }

  .billing-section__checkbox input {
    width: auto;
    min-height: auto;
  }

  .billing-section__config-compact-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 1rem;
  }

  .billing-section__config-compact-grid .billing-section__config-form {
    grid-template-columns: 1fr;
    border: 1px solid var(--portal-border, #d7dee8);
    border-radius: 0.65rem;
    padding: 0.9rem;
  }

  .billing-section__section-intro {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1rem;
  }

  .billing-section__section-intro > span {
    color: var(--portal-muted, #64748b);
    font-variant-numeric: tabular-nums;
    font-weight: 750;
  }

  .billing-section__rule-list,
  .billing-section__invoice-list {
    display: grid;
    gap: 0.75rem;
  }

  .billing-section__rule,
  .billing-section__invoice {
    display: grid;
    gap: 0.9rem;
    padding: 1rem;
    border: 1px solid var(--portal-border, #d7dee8);
    border-radius: 0.7rem;
    background: var(--portal-surface, #fff);
  }

  .billing-section__rule {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1rem;
  }

  .billing-section__rule > div:first-child,
  .billing-section__invoice-heading > div {
    display: grid;
    gap: 0.25rem;
  }

  .billing-section__rule small,
  .billing-section__invoice small,
  .billing-section__payment-row small {
    color: var(--portal-muted, #64748b);
  }

  .billing-section__rule-editor > summary,
  .billing-section__payment-history > summary {
    width: fit-content;
    padding: 0.55rem 0.7rem;
    border: 1px solid var(--portal-border-strong, #b8c3d1);
    border-radius: 0.5rem;
    color: var(--portal-ink, #16202a);
    cursor: pointer;
    font-size: 0.82rem;
    font-weight: 750;
    list-style: none;
  }

  .billing-section__rule-actions {
    display: grid;
    gap: 0.8rem;
    min-width: min(48rem, 80vw);
    margin-top: 0.65rem;
    padding: 0.85rem;
    border: 1px solid var(--portal-border, #d7dee8);
    border-radius: 0.65rem;
    background: var(--portal-wash, #f7f9fb);
  }

  .billing-section__inline-form,
  .billing-section__period-form,
  .billing-section__payment-form {
    display: flex;
    flex-wrap: wrap;
    align-items: end;
    gap: 0.65rem;
  }

  .billing-section__inline-form > label,
  .billing-section__period-form > label,
  .billing-section__payment-form > label {
    flex: 1 1 10rem;
  }

  .billing-section__invoice-heading {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1rem;
  }

  .billing-section__invoice-dates {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 0.65rem;
  }

  .billing-section__invoice-dates > div {
    display: grid;
    gap: 0.25rem;
    padding: 0.65rem;
    border: 1px solid var(--portal-border, #d7dee8);
    border-radius: 0.5rem;
  }

  .billing-section__invoice-dates span,
  .billing-section__invoice-ledger span {
    color: var(--portal-muted, #64748b);
    font-size: 0.75rem;
  }

  .billing-section__invoice-dates strong,
  .billing-section__invoice-ledger strong {
    font-variant-numeric: tabular-nums;
  }

  .billing-section__timeline-note {
    margin: -0.2rem 0 0;
    color: var(--portal-muted, #64748b);
    font-size: 0.78rem;
  }

  .billing-section__planning-form {
    padding: 0.8rem;
    border: 1px solid var(--portal-border, #d7dee8);
    border-radius: 0.65rem;
    background: var(--portal-wash, #f7f9fb);
  }

  .billing-section__planning-form fieldset {
    display: grid;
    gap: 0.75rem;
    min-width: 0;
    margin: 0;
    padding: 0;
    border: 0;
  }

  .billing-section__planning-form legend {
    padding: 0;
    color: var(--portal-ink, #16202a);
    font-weight: 750;
  }

  .billing-section__planning-form p {
    max-width: 58rem;
    margin: 0;
    color: var(--portal-muted, #64748b);
    font-size: 0.78rem;
  }

  .billing-section__planning-fields {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    align-items: end;
    gap: 0.65rem;
  }

  .billing-section__planning-fields label {
    display: grid;
    gap: 0.35rem;
    color: var(--portal-muted, #64748b);
    font-size: 0.78rem;
    font-weight: 650;
  }

  .billing-section__planning-fields input {
    box-sizing: border-box;
    width: 100%;
    min-height: 2.75rem;
    padding: 0.55rem 0.7rem;
    border: 1px solid var(--portal-border-strong, #b8c3d1);
    border-radius: 0.5rem;
    background: var(--portal-surface, #fff);
    color: var(--portal-ink, #16202a);
    font: inherit;
  }

  .billing-section__planning-fields button {
    min-height: 2.75rem;
  }

  .billing-section__invoice-ledger,
  .billing-section__history-summary {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem 1.25rem;
    color: var(--portal-muted, #64748b);
    font-size: 0.8rem;
  }

  .billing-section__payment-history {
    display: grid;
    gap: 0.75rem;
  }

  .billing-section__payment-row {
    display: grid;
    gap: 0.7rem;
    padding: 0.75rem;
    border-left: 3px solid var(--portal-border-strong, #b8c3d1);
    background: var(--portal-wash, #f7f9fb);
  }

  .billing-section__payment-row > div:first-child {
    display: grid;
    gap: 0.25rem;
  }

  .billing-section__invoice-actions {
    display: flex;
    flex-wrap: wrap;
    align-items: end;
    gap: 0.65rem;
    padding-top: 0.25rem;
    border-top: 1px solid var(--portal-border, #d7dee8);
  }

  .billing-section__invoice-actions > form {
    display: flex;
    flex-wrap: wrap;
    align-items: end;
    gap: 0.65rem;
  }

  .billing-section__invoice-actions > form > label {
    min-width: 11rem;
  }

  .billing-section__reversal-table {
    overflow-x: auto;
  }

  .billing-section__reversal-table table {
    width: 100%;
    border-collapse: collapse;
  }

  .billing-section__reversal-table th,
  .billing-section__reversal-table td {
    padding: 0.65rem;
    border-bottom: 1px solid var(--portal-border, #d7dee8);
    text-align: left;
    vertical-align: top;
  }

  .billing-section__reversal-table th {
    color: var(--portal-muted, #64748b);
    font-size: 0.72rem;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  .billing-section__empty {
    display: grid;
    gap: 0.3rem;
    padding: 1.25rem 0.5rem;
    color: var(--portal-muted, #64748b);
    text-align: center;
  }

  .billing-section button:focus-visible,
  .billing-section a:focus-visible,
  .billing-section input:focus-visible,
  .billing-section select:focus-visible,
  .billing-section textarea:focus-visible,
  .billing-section summary:focus-visible {
    outline: 3px solid color-mix(in srgb, var(--portal-accent, #0f5f73) 32%, transparent);
    outline-offset: 2px;
  }

  @media (max-width: 52rem) {
    .billing-section__filters {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .billing-section__filters label:first-child,
    .billing-section__filters button {
      grid-column: 1 / -1;
    }

    .billing-section__config-form,
    .billing-section__config-compact-grid {
      grid-template-columns: 1fr 1fr;
    }

    .billing-section__invoice-dates {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (max-width: 760px) {
    .billing-section__context,
    .billing-section__invoice-heading,
    .billing-section__rule {
      align-items: flex-start;
      flex-direction: column;
    }

    .billing-section__summary {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .billing-section__filters,
    .billing-section__config-form,
    .billing-section__config-compact-grid,
    .billing-section__invoice-dates,
    .billing-section__planning-fields {
      grid-template-columns: 1fr;
    }

    .billing-section__filters label:first-child,
    .billing-section__filters button,
    .billing-section__config-form h4,
    .billing-section__config-form > button {
      grid-column: auto;
    }

    .billing-section__config > summary,
    .billing-section__invoice-actions > a,
    .billing-section__invoice-actions > form,
    .billing-section__invoice-actions > form > button,
    .billing-section__invoice-actions > form > label,
    .billing-section__rule-editor,
    .billing-section__rule-editor > summary {
      width: 100%;
    }

    .billing-section__rule-actions,
    .billing-section__inline-form,
    .billing-section__period-form,
    .billing-section__payment-form,
    .billing-section__invoice-actions > form {
      display: grid;
      min-width: 0;
      width: 100%;
    }

    .billing-section__invoice-actions > form > label,
    .billing-section__inline-form > label,
    .billing-section__period-form > label,
    .billing-section__payment-form > label {
      min-width: 0;
      width: 100%;
    }

    .billing-section__issue-blocker,
    .billing-section__row-blocker {
      flex-direction: column;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .billing-section * {
      scroll-behavior: auto;
    }
  }
</style>
