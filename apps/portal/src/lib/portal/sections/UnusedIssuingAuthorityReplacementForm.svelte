<script lang="ts">
  import { page } from '$app/stores';
  import { Field, FieldGroup, formValidation } from '../ui';
  import { portalText, type PortalLocale } from '../../portal-i18n';
  import type { PortalRow as Row } from '../portal-data';

  let {
    assignment,
    options,
    projectCurrency,
    commandToken,
    locale,
  }: {
    assignment: Row;
    options: Row[];
    projectCurrency: string;
    commandToken: string;
    locale: PortalLocale;
  } = $props();
  const t = (key: string) => portalText(locale, key);
  const value = (row: Row, key: string): string => String(row[key] ?? '');
  const assignmentId = $derived(value(assignment, 'assignmentId'));
  const prefix = $derived(`issuer-replacement-${assignmentId}`);
  const failed = $derived.by(() => {
    const result = $page.form as
      | {
          success?: boolean;
          actionName?: string;
          values?: Record<string, unknown>;
          fieldErrors?: Record<string, string[]>;
        }
      | null
      | undefined;
    return result?.success === false &&
      result.actionName === 'replaceUnusedProjectIssuingAuthority' &&
      result.values?.originalAssignmentId === assignmentId
      ? result
      : null;
  });
  const retained = (field: string, fallback = ''): string =>
    typeof failed?.values?.[field] === 'string' ? String(failed.values[field]) : fallback;
  const fieldError = (field: string): string | undefined =>
    failed?.fieldErrors?.[field]?.length
      ? failed.fieldErrors[field].map((key) => t(key)).join(' ')
      : undefined;
  const compatibleOptions = $derived(
    options.filter(
      (option) =>
        value(option, 'revisionId') !== value(assignment, 'revisionId') &&
        value(option, 'baseCurrency').toUpperCase() === projectCurrency.toUpperCase() &&
        value(option, 'effectiveFrom') <= value(assignment, 'effectiveFrom') &&
        (!value(option, 'effectiveTo') ||
          (value(assignment, 'effectiveTo') &&
            value(option, 'effectiveTo') >= value(assignment, 'effectiveTo'))),
    ),
  );
  const actionUrl = $derived.by(() => {
    const query = new URLSearchParams();
    for (const key of ['asOf', 'lang', 'tab']) {
      const current = $page.url.searchParams.get(key);
      if (current) query.set(key, current);
    }
    query.set('view', $page.url.searchParams.get('view') || 'commercial');
    query.set('project', value(assignment, 'projectId'));
    query.set('lang', locale);
    query.set('task', 'Project issuing authority');
    return `?/replaceUnusedProjectIssuingAuthority&${query.toString()}#project-issuing-authority`;
  });
</script>

<details open={Boolean(failed)} data-unused-issuer-replacement>
  <summary>{t('finance.issuerReplacement.title')}</summary>
  <p class="muted">{t('finance.issuerReplacement.help')}</p>
  <form method="POST" action={actionUrl} class="admin-form-grid" use:formValidation>
    <input type="hidden" name="originalAssignmentId" value={assignmentId} />
    <input
      type="hidden"
      name="idempotencyKey"
      value={retained('idempotencyKey', `${commandToken}:${assignmentId}:replace`)}
    />
    <FieldGroup columns="2">
      <Field
        id={`${prefix}-revision`}
        label={t('finance.issuerReplacement.revision')}
        help={t('finance.issuerReplacement.compatible')}
        error={fieldError('legalEntityRevisionId')}
        required
        data-field="legalEntityRevisionId"
      >
        <select id={`${prefix}-revision`} name="legalEntityRevisionId" required>
          <option value="">{t('Select issuing authority')}</option>
          {#if retained('legalEntityRevisionId') && !compatibleOptions.some((option) => value(option, 'revisionId') === retained('legalEntityRevisionId'))}
            <option value={retained('legalEntityRevisionId')} selected disabled
              >{t('problem.finance.revisionUnavailableOption')}</option
            >
          {/if}
          {#each compatibleOptions as option}
            <option
              value={value(option, 'revisionId')}
              selected={value(option, 'revisionId') === retained('legalEntityRevisionId')}
            >
              {value(option, 'legalName')} · {value(option, 'legalEntityCode')} ·
              {value(option, 'baseCurrency')} · {t('Revision')}
              {value(option, 'revisionNumber')}
            </option>
          {/each}
        </select>
      </Field>
      <Field
        id={`${prefix}-reason`}
        label={t('Reason')}
        error={fieldError('reason')}
        required
        data-field="reason"
      >
        <textarea id={`${prefix}-reason`} name="reason" minlength="5" maxlength="2000" required
          >{retained('reason')}</textarea
        >
      </Field>
    </FieldGroup>
    <div class="form-actions">
      <button type="submit" disabled={!compatibleOptions.length}
        >{t('finance.issuerReplacement.submit')}</button
      >
    </div>
    {#if !compatibleOptions.length}
      <p class="muted">{t('finance.issuerReplacement.noCompatibleRevision')}</p>
    {/if}
  </form>
</details>
