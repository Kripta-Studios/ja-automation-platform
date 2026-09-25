<script lang="ts">
  import { SectionCard } from '$lib/portal/ui';
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import type { PortalLocale } from '$lib/portal-i18n';
  import { translateControlledValue } from '$lib/i18n/controlled-values';
  import {
    applyStandaloneDocumentLocale,
    persistStandaloneLocale,
    resolveStandaloneLocale,
    standaloneText,
  } from '../../../standalone-locale';
  let { data, form } = $props();
  let localeOverride = $state<PortalLocale | null>(null);
  const locale = $derived(
    localeOverride ?? data.locale ?? resolveStandaloneLocale($page.url.searchParams.get('lang')),
  );
  const t = (key: string, params?: Record<string, string | number>) =>
    standaloneText(locale, key, params);
  const record = $derived(data.record);
  const approvalLabel = (value: string) => translateControlledValue(locale, 'status', value);
  const correctionHref = $derived(
    record.activeCorrectionId
      ? `/j-aautomation/app/crew/time/${encodeURIComponent(record.activeCorrectionId)}`
      : null,
  );
  const submittedValue = (name: string, fallback: string) =>
    form && ['update', 'correct'].includes(form.operation)
      ? String(form.values?.[name] ?? fallback)
      : fallback;
  const crewHref = $derived(
    `/j-aautomation/app/crew?${new URLSearchParams({ project: record.projectId, date: record.workDate })}#crew-entries`,
  );
  const expenseHref = $derived(
    `/j-aautomation/app/expenses?${new URLSearchParams({
      project: record.projectId,
      worker: record.workerId,
      date: record.workDate,
      timeEntry: record.id,
    })}`,
  );
  onMount(() => {
    localeOverride = resolveStandaloneLocale($page.url.searchParams.get('lang'), data.locale);
    persistStandaloneLocale(locale);
    applyStandaloneDocumentLocale(locale);
  });
  $effect(() => applyStandaloneDocumentLocale(locale));
</script>

<svelte:head><title>{t('Crew time · J&A Automation')}</title></svelte:head>
<main class="crew-detail">
  <a href={crewHref}>{t('← Back to crew hours')}</a>
  <h1>{record.workerName} · {record.workDate}</h1>
  {#if form?.message}<div class="notice error" role="alert">{form.message}</div>{/if}
  <SectionCard title={t('Recorded work')}>
    <dl>
      <div>
        <dt>{t('Project')}</dt>
        <dd>{record.projectName}</dd>
      </div>
      <div>
        <dt>{t('Person')}</dt>
        <dd>{record.workerName}</dd>
      </div>
      <div>
        <dt>{t('Work date')}</dt>
        <dd>{record.workDate}</dd>
      </div>
      <div>
        <dt>{t('Actual time')}</dt>
        <dd>{Math.floor(record.minutes / 60)} h {record.minutes % 60} {t('min')}</dd>
      </div>
      <div>
        <dt>{t('Category')}</dt>
        <dd>{record.category}</dd>
      </div>
      <div>
        <dt>{t('Work performed')}</dt>
        <dd>{record.summary}</dd>
      </div>
      {#if record.site}<div>
          <dt>{t('Site')}</dt>
          <dd>{record.site}</dd>
        </div>{/if}
      {#if record.startTime && record.endTime}
        <div>
          <dt>{t('Interval')}</dt>
          <dd>{record.startTime}–{record.endTime}</dd>
        </div>
      {/if}
      <div>
        <dt>{t('Approval')}</dt>
        <dd>{approvalLabel(record.approvalState)}</dd>
      </div>
    </dl>
    {#if !['needs_changes', 'rejected'].includes(record.approvalState)}
      <a class="expense-link" href={expenseHref}>{t('Add expense for')} {record.workerName}</a>
    {/if}
  </SectionCard>
  {#if ['needs_changes', 'rejected'].includes(record.approvalState)}
    <SectionCard title={t('Review outcome')}>
      <p>
        <strong>{t('Review reason')}:</strong>
        {record.reviewReason || t('No review reason was recorded.')}
      </p>
      {#if record.activeCorrectionState}
        <p>{t('An existing correction is')} {approvalLabel(record.activeCorrectionState)}.</p>
        {#if correctionHref}
          <a href={correctionHref}>{t('Open existing correction')} →</a>
        {:else}
          <p>
            {t(
              'The recorded worker owns this correction. Ask them to review it from their Time register.',
            )}
          </p>
        {/if}
      {:else}
        <p>{t('Create corrected draft')}</p>
      {/if}
    </SectionCard>
  {/if}
  {#if record.approvalState === 'needs_changes' && !record.activeCorrectionState}
    <SectionCard title={t('Create corrected draft')}>
      <p>
        {t(
          'Review every revised field before creating the correction. The linked draft cannot be edited afterward.',
        )}
      </p>
      <form method="POST" action="?/correct" class="draft-form">
        <input type="hidden" name="version" value={record.version} />
        <input
          type="hidden"
          name="requestId"
          value={submittedValue('requestId', data.correctionRequestId)}
        />
        <label
          >{t('Correction reason')}
          <textarea name="reason" rows="2" minlength="3" maxlength="2000" required
            >{submittedValue('reason', '')}</textarea
          >
        </label>
        <label
          >{t('Work date')}
          <input
            type="date"
            name="workDate"
            value={submittedValue('workDate', record.workDate)}
            required
          />
        </label>
        <label
          >{t('Time category')}
          <select name="category" value={submittedValue('category', record.category)}>
            <option value="regular">{t('Regular')}</option>
            <option value="overtime">{t('Overtime')}</option>
            <option value="travel">{t('Travel')}</option>
            <option value="standby">{t('Standby')}</option>
          </select>
        </label>
        <label
          >{t('Minutes')}
          <input
            type="number"
            name="minutes"
            min="1"
            max="1440"
            step="1"
            value={submittedValue('minutes', String(record.minutes))}
            required
          />
        </label>
        {#if record.startTime && record.endTime}
          <label
            >{t('Start time')}
            <input
              type="time"
              name="startTime"
              value={submittedValue('startTime', record.startTime)}
              required
            />
          </label>
          <label
            >{t('End time')}
            <input
              type="time"
              name="endTime"
              value={submittedValue('endTime', record.endTime)}
              required
            />
          </label>
          <label
            >{t('Break')}
            <input
              type="number"
              name="breakMinutes"
              min="0"
              max="1439"
              step="1"
              value={submittedValue('breakMinutes', String(record.breakMinutes ?? 0))}
              required
            />
          </label>
        {/if}
        <label
          >{t('Work performed')}
          <textarea name="summary" rows="3" maxlength="5000" required
            >{submittedValue('summary', record.summary)}</textarea
          >
        </label>
        <button type="submit">{t('Create corrected draft')}</button>
      </form>
    </SectionCard>
  {/if}
  {#if record.approvalState === 'draft'}
    <form method="POST" action="?/submit">
      <input type="hidden" name="version" value={record.version} />
      <button type="submit" class="submit-draft">{t('Submit for approval now')}</button>
    </form>
  {/if}
  {#if record.editable}
    <SectionCard title={t('Edit draft')}>
      <form method="POST" action="?/update" class="draft-form">
        <input type="hidden" name="version" value={record.version} />
        <label
          >{t('Work date')}
          <input
            type="date"
            name="workDate"
            value={submittedValue('workDate', record.workDate)}
            required
          />
        </label>
        <label
          >{t('Time category')}
          <select name="category" value={submittedValue('category', record.category)}>
            <option value="regular">{t('Regular')}</option>
            <option value="overtime">{t('Overtime')}</option>
            <option value="travel">{t('Travel')}</option>
            <option value="standby">{t('Standby')}</option>
          </select>
        </label>
        <label
          >{t('Minutes')}
          <input
            type="number"
            name="minutes"
            min="1"
            max="1440"
            step="1"
            value={submittedValue('minutes', String(record.minutes))}
            required
          />
        </label>
        <label
          >{t('Work performed')}
          <textarea name="summary" rows="3" maxlength="5000" required
            >{submittedValue('summary', record.summary)}</textarea
          >
        </label>
        <button type="submit">{t('Save changes')}</button>
      </form>
      <form method="POST" action="?/discard">
        <input type="hidden" name="version" value={record.version} />
        <button type="submit" class="discard">{t('Discard draft')}</button>
      </form>
    </SectionCard>
  {:else if record.approvalState === 'draft'}
    <p class="notice">
      {record.isCorrectionDraft
        ? t(
            'This correction draft is linked to the reviewed record. Check the revised fields and submit it for approval.',
          )
        : t('This draft is linked to another record and cannot be edited or discarded.')}
    </p>
  {/if}
</main>

<style>
  .crew-detail {
    max-width: 52rem;
    margin: 0 auto;
    padding: 1rem 1rem 4rem;
    display: grid;
    gap: 1.25rem;
  }
  .crew-detail h1 {
    margin: 0;
  }
  dl {
    display: grid;
    gap: 0.75rem;
  }
  dl div {
    display: grid;
    grid-template-columns: minmax(8rem, 1fr) 2fr;
    gap: 1rem;
    padding: 0.5rem 0;
    border-bottom: 1px solid #e3e9ef;
  }
  dt {
    font-weight: 700;
  }
  dd {
    margin: 0;
    overflow-wrap: anywhere;
  }
  .expense-link {
    display: inline-flex;
    align-items: center;
    min-height: 2.75rem;
    padding: 0.55rem 1rem;
    border-radius: 0.45rem;
    background: #eaf1f5;
    color: #164c68;
    font-weight: 700;
    text-decoration: none;
  }
  .draft-form {
    display: grid;
    gap: 0.85rem;
    margin-bottom: 1.2rem;
  }
  .draft-form label {
    display: grid;
    gap: 0.35rem;
    font-weight: 700;
  }
  .draft-form input,
  .draft-form select,
  .draft-form textarea {
    width: 100%;
    min-height: 2.7rem;
    padding: 0.55rem;
    border: 1px solid #9baebd;
    border-radius: 0.45rem;
    font: inherit;
  }
  .draft-form button,
  .discard {
    min-height: 2.7rem;
    padding: 0.55rem 1rem;
    border: 0;
    border-radius: 0.45rem;
    background: #145478;
    color: #fff;
    font: inherit;
    font-weight: 700;
    cursor: pointer;
  }
  .submit-draft {
    min-height: 2.75rem;
    padding: 0.65rem 1rem;
    border: 0;
    border-radius: 0.45rem;
    background: #145478;
    color: #fff;
    font: inherit;
    font-weight: 700;
    cursor: pointer;
  }
  .discard {
    background: #7c2d2d;
  }
  .notice {
    padding: 0.8rem;
    border-radius: 0.45rem;
    background: #fff4d9;
  }
  .notice.error {
    background: #fce8e8;
  }
  a:focus-visible {
    outline: 3px solid #e6a23c;
    outline-offset: 2px;
  }
  @media (max-width: 600px) {
    dl div {
      grid-template-columns: 1fr;
      gap: 0.25rem;
    }
    .crew-detail {
      padding: 0.8rem;
    }
  }
</style>
