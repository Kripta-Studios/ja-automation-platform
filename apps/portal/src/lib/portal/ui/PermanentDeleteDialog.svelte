<script lang="ts">
  import { projectCopy, type ProjectCopyKey } from '$lib/portal/project-ux-round3-copy';

  let {
    kind,
    recordId,
    action,
    base,
    locale = 'en',
    compact = false,
  }: {
    kind: 'project' | 'client';
    recordId: string;
    action: string;
    base: string;
    locale?: string;
    compact?: boolean;
  } = $props();

  type Preview = Record<string, number | string> & {
    label: string;
    confirmationText: string;
  };

  let dialog: HTMLDialogElement | undefined = $state();
  let preview = $state<Preview | null>(null);
  let failed = $state(false);
  let typed = $state('');
  let submitting = $state(false);
  const c = (key: ProjectCopyKey, params: Record<string, string | number> = {}) =>
    projectCopy(locale, key, params);

  const countKeys = [
    'projects',
    'timeEntries',
    'expenses',
    'dailyReports',
    'technicalReports',
    'periodReports',
    'invoices',
    'payments',
    'documents',
    'files',
    'assignments',
    'planning',
    'milestones',
    'contacts',
  ] as const;
  const rows = $derived(
    preview
      ? countKeys
          .filter((key) => Number(preview?.[key] ?? 0) > 0)
          .filter((key) => !(kind === 'project' && key === 'projects'))
          .map((key) => ({ key, count: Number(preview?.[key] ?? 0) }))
      : [],
  );
  const hasFinance = $derived(
    Boolean(preview && (Number(preview.invoices) > 0 || Number(preview.payments) > 0)),
  );
  const confirmed = $derived(Boolean(preview && typed.trim() === preview.confirmationText));

  async function openDialog() {
    preview = null;
    failed = false;
    typed = '';
    submitting = false;
    dialog?.showModal();
    try {
      const param = kind === 'project' ? 'projectId' : 'clientId';
      const response = await fetch(
        `${base}/app/projects/delete-preview?${param}=${encodeURIComponent(recordId)}`,
        { headers: { accept: 'application/json' } },
      );
      if (!response.ok) throw new Error(String(response.status));
      preview = (await response.json()) as Preview;
    } catch {
      failed = true;
    }
  }
</script>

<section class="danger-zone" class:danger-zone--compact={compact} data-permanent-delete={kind}>
  {#if !compact}
    <h3>{c('dangerTitle')}</h3>
    <p>{kind === 'project' ? c('dangerProjectBody') : c('dangerClientBody')}</p>
  {/if}
  <button type="button" class="danger-button" onclick={openDialog}
    >{kind === 'project' ? c('deleteProjectButton') : c('deleteClientButton')}</button
  >
</section>

<dialog
  bind:this={dialog}
  class="permanent-delete-dialog"
  aria-labelledby={`permanent-delete-title-${recordId}`}
>
  <form method="POST" {action} onsubmit={() => (submitting = true)}>
    <input type="hidden" name={kind === 'project' ? 'projectId' : 'clientId'} value={recordId} />
    <h2 id={`permanent-delete-title-${recordId}`}>
      {preview ? c('dialogTitle', { label: preview.label }) : c('dangerTitle')}
    </h2>
    {#if failed}
      <p role="alert" class="permanent-delete-dialog__error">{c('countsFailed')}</p>
    {:else if !preview}
      <p role="status">{c('loadingCounts')}</p>
    {:else}
      <p><strong>{c('willDelete')}</strong></p>
      {#if rows.length > 0}
        <ul class="permanent-delete-dialog__counts" data-delete-counts>
          {#each rows as row (row.key)}
            <li>
              <span>{c(`count_${row.key}` as ProjectCopyKey)}</span><strong>{row.count}</strong>
            </li>
          {/each}
          <li class="permanent-delete-dialog__total">
            <span>{c('count_totalRows')}</span><strong>{preview.totalRows}</strong>
          </li>
        </ul>
      {:else}
        <p>{c('nothingElse')}</p>
      {/if}
      {#if hasFinance}<p class="permanent-delete-dialog__warning">{c('financeWarning')}</p>{/if}
      <p class="form-help">{c('auditNote')}</p>
      <label class="permanent-delete-dialog__confirm"
        >{c('typeToConfirm', { reference: preview.confirmationText })}
        <input
          name="confirmation"
          autocomplete="off"
          autocapitalize="off"
          spellcheck="false"
          bind:value={typed}
          required
        /></label
      >
    {/if}
    <div class="permanent-delete-dialog__actions">
      <button type="button" class="secondary-button" onclick={() => dialog?.close()}
        >{c('cancel')}</button
      >
      <button type="submit" class="danger-button" disabled={!confirmed || submitting}
        >{submitting ? c('deleting') : c('confirmDelete')}</button
      >
    </div>
  </form>
</dialog>

<style>
  .danger-zone {
    border: 1px solid var(--danger-border, #e3a5a0);
    background: var(--danger-surface, #fff5f4);
    border-radius: 12px;
    padding: 1rem;
    display: grid;
    gap: 0.6rem;
  }
  .danger-zone--compact {
    border: 0;
    background: none;
    padding: 0;
  }
  .danger-zone h3 {
    margin: 0;
    color: var(--danger-text, #8a1c13);
  }
  .danger-zone p {
    margin: 0;
  }
  .danger-button {
    justify-self: start;
    min-height: 2.75rem;
    padding: 0.55rem 1rem;
    border-radius: 10px;
    border: 1px solid var(--danger-strong, #b42318);
    background: var(--danger-strong, #b42318);
    color: #fff;
    font-weight: 600;
    cursor: pointer;
  }
  .danger-button:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
  .permanent-delete-dialog {
    position: fixed;
    inset: 0;
    margin: auto;
    height: fit-content;
    max-height: calc(100dvh - 2rem);
    overflow: auto;
    width: min(32rem, calc(100vw - 2rem));
    border: 0;
    border-radius: 16px;
    padding: 1.25rem;
    box-shadow: 0 20px 60px rgb(0 0 0 / 0.3);
  }
  .permanent-delete-dialog::backdrop {
    background: rgb(0 0 0 / 0.45);
  }
  .permanent-delete-dialog form {
    display: grid;
    gap: 0.75rem;
  }
  .permanent-delete-dialog h2 {
    margin: 0;
    font-size: 1.15rem;
    overflow-wrap: anywhere;
  }
  .permanent-delete-dialog p {
    margin: 0;
  }
  .permanent-delete-dialog__counts {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0.25rem;
  }
  .permanent-delete-dialog__counts li {
    display: flex;
    justify-content: space-between;
    gap: 1rem;
    padding: 0.3rem 0;
    border-bottom: 1px solid var(--line, #e6e3dd);
  }
  .permanent-delete-dialog__total {
    font-weight: 600;
  }
  .permanent-delete-dialog__warning,
  .permanent-delete-dialog__error {
    color: var(--danger-text, #8a1c13);
    font-weight: 600;
  }
  .permanent-delete-dialog__confirm {
    display: grid;
    gap: 0.35rem;
    font-weight: 600;
    overflow-wrap: anywhere;
  }
  .permanent-delete-dialog__actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 0.5rem;
  }
</style>
