<script lang="ts">
  import { base } from '$app/paths';
  import { enhance, type SubmitFunction } from '$app/forms';
  import { invalidateAll } from '$app/navigation';
  import { onMount, tick } from 'svelte';
  import { standaloneActionMessage } from '../../../standalone-locale';
  import { portalText } from '$lib/portal-i18n';
  import { translateControlledValue } from '$lib/i18n/controlled-values';
  import { Field, SectionCard, formValidation } from '$lib/portal/ui';
  import ProblemNotice from '$lib/portal/ui/ProblemNotice.svelte';
  import { reportFormFieldErrors } from '$lib/portal/ui/form-validation';
  import type { ProblemData } from '$lib/problem/contract';
  import { closeoutCopy } from './copy';
  let { data, form } = $props();
  const locale = $derived(data.locale === 'es' ? 'es' : data.locale === 'pt' ? 'pt' : 'en');
  const t = $derived(closeoutCopy[locale]);
  type CloseoutForm = Partial<ProblemData> & {
    success?: boolean;
    actionName?: string;
    values?: {
      documentId?: string[];
      revisionId?: string;
      reason?: string;
      replaceSelection?: boolean;
      confirmationChecked?: boolean;
    };
  };
  const closeoutForm = $derived(form as CloseoutForm | null | undefined);
  const problem = $derived(
    closeoutForm?.code && closeoutForm.messageKey && closeoutForm.correlationId
      ? (closeoutForm as ProblemData)
      : null,
  );
  const actionFeedback = $derived(
    closeoutForm?.success ? standaloneActionMessage(locale, form) : null,
  );
  const closeoutHref = $derived(
    base +
      '/app/projects/' +
      encodeURIComponent(String(data.project.id)) +
      '/closeout?lang=' +
      locale,
  );
  const remedyLinks = $derived({
    review_projects: {
      label: portalText(locale, 'problem.remedy.reviewProjects'),
      href: base + '/app/projects',
    },
    review_closeout: {
      label: portalText(locale, 'problem.remedy.reviewCloseout'),
      href: closeoutHref,
    },
    review_closeout_documents: {
      label: portalText(locale, 'problem.remedy.reviewCloseoutDocuments'),
      href: closeoutHref + '#closeout-documents',
    },
    contact_owner: { label: portalText(locale, 'problem.remedy.contactOwner') },
    sign_in_again: {
      label: portalText(locale, 'problem.remedy.signInAgain'),
      href: base + '/app/login',
    },
    enter_reason: {
      label: portalText(locale, 'problem.remedy.enterReason'),
      href: '#reopen-reason',
    },
  });
  const selected = (action: string, id: string, replaceSelection = false) =>
    closeoutForm?.actionName === action &&
    !(action === 'refresh' && problem?.code === 'CLOSEOUT_DRAFT_CHANGED') &&
    Boolean(closeoutForm.values?.replaceSelection) === replaceSelection &&
    (closeoutForm.values?.documentId ?? []).includes(id);
  const scrollKey = $derived(`closeout-form-scroll:${String(data.project.id)}`);
  function rememberScroll() {
    sessionStorage.setItem(scrollKey, String(window.scrollY));
  }
  onMount(() => {
    window.addEventListener('pagehide', rememberScroll);
    if (problem) {
      const saved = sessionStorage.getItem(scrollKey);
      if (saved !== null) {
        sessionStorage.removeItem(scrollKey);
        window.scrollTo({ top: Number(saved), behavior: 'auto' });
      }
    }
    return () => window.removeEventListener('pagehide', rememberScroll);
  });
  let focusedProblemId = '';
  $effect(() => {
    const id = problem?.correlationId;
    if (!id || id === focusedProblemId) return;
    focusedProblemId = id;
    void tick().then(() => {
      const targetForm = document.querySelector<HTMLFormElement>(
        `form[data-closeout-action="${closeoutForm?.actionName === 'refresh' && closeoutForm.values?.replaceSelection ? 'refreshSelection' : (closeoutForm?.actionName ?? '')}"]`,
      );
      if (targetForm && problem?.fieldErrors)
        reportFormFieldErrors(targetForm, problem.fieldErrors);
      const target =
        targetForm?.querySelector<HTMLElement>('[data-validation-summary]') ??
        document.querySelector<HTMLElement>('[data-closeout-problem] [data-ui="problem-notice"]');
      target?.focus({ preventScroll: true });
    });
  });
  const submitCloseout: SubmitFunction = () => {
    rememberScroll();
    return async ({ result, update }) => {
      await update({ reset: false, invalidateAll: true });
      if (
        result.type === 'failure' &&
        ['CLOSEOUT_DOCUMENT_UNAVAILABLE', 'CLOSEOUT_DOCUMENT_SELECTION_INVALID'].includes(
          (result.data as { code?: string } | undefined)?.code ?? '',
        )
      )
        await invalidateAll();
      const saved = sessionStorage.getItem(scrollKey);
      if (saved !== null) {
        sessionStorage.removeItem(scrollKey);
        window.scrollTo({ top: Number(saved), behavior: 'auto' });
      }
    };
  };
  function documentLabel(value: unknown): string {
    const labels: Record<string, string> = {
      customer_period_pdf: 'Customer period report',
      customer_report_pdf: 'Customer report',
      technical_reference: 'Technical reference',
      system_reference: 'System reference',
      backup_reference: 'Backup reference',
      approved_customer_document: 'Approved customer document',
      customer_private: 'Customer private',
      operational: 'Operational',
    };
    const raw = String(value ?? '—');
    return labels[raw] ? portalText(locale, labels[raw]) : raw;
  }
  const project = $derived(data.project as Record<string, unknown>);
  const revisions = $derived((data.closeout.revisions ?? []) as Array<Record<string, unknown>>);
  const artifacts = $derived((data.closeout.artifacts ?? []) as Array<Record<string, unknown>>);
  const draft = $derived(revisions.find((revision) => revision.state === 'draft'));
  const eligible = $derived((data.documents ?? []) as Array<Record<string, unknown>>);
  function unavailableSelection(action: string, replaceSelection = false): string[] {
    if (
      closeoutForm?.actionName !== action ||
      Boolean(closeoutForm.values?.replaceSelection) !== replaceSelection
    )
      return [];
    const available = new Set(eligible.map((document) => String(document.id)));
    return (closeoutForm.values?.documentId ?? []).filter((id) => !available.has(id));
  }
  function snapshot(value: unknown): Record<string, unknown> {
    try {
      const parsed = JSON.parse(String(value));
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : {};
    } catch {
      return {};
    }
  }
  function rows(value: unknown): Array<Record<string, unknown>> {
    return Array.isArray(value)
      ? value.filter(
          (entry): entry is Record<string, unknown> =>
            Boolean(entry) && typeof entry === 'object' && !Array.isArray(entry),
        )
      : [];
  }
  function text(value: unknown): string {
    return value === null || value === undefined || value === '' ? '—' : String(value);
  }
  function money(row: Record<string, unknown>, amount = 'total_minor'): string {
    return `${text(row.currency)} ${text(row[amount])} ${portalText(locale, 'minor units')}`;
  }
  const internalSnapshot = $derived(draft ? snapshot(draft.internal_snapshot_json) : {});
  const clientSnapshot = $derived(draft ? snapshot(draft.client_snapshot_json) : {});
</script>

<svelte:head
  ><title>{portalText(locale, 'Project closeout')} · {String(project.project_number ?? '')}</title
  ></svelte:head
>
<main
  class="closeout-page"
  data-closeout-page
  data-role={data.user.role}
  lang={locale === 'pt' ? 'pt-BR' : locale}
>
  <a
    href={base + '/app/projects/' + encodeURIComponent(String(project.id)) + '?lang=' + locale}
    data-origin-back>← {t.back}</a
  >
  <header>
    <p>{t.kicker}</p>
    <h1>{String(project.name ?? t.project)}</h1>
    <p>{t.immutable}</p>
  </header>
  {#if problem}
    <div data-closeout-problem>
      <ProblemNotice
        {problem}
        {remedyLinks}
        kind={problem.code === 'CLOSEOUT_ARTIFACT_WRITE_INCOMPLETE' ||
        problem.code === 'UNEXPECTED_ERROR'
          ? 'service'
          : 'error'}
      />
      {#if closeoutForm?.actionName === 'reopen' && closeoutForm.values?.reason}
        <p>
          <strong>{portalText(locale, 'problem.closeout.reasonRetained')}:</strong>
          {closeoutForm.values.reason}
        </p>
      {/if}
      {#if closeoutForm?.actionName === 'confirmClient' && closeoutForm.values?.confirmationChecked}
        <p>{portalText(locale, 'problem.closeout.previousConfirmation')}</p>
      {/if}
      {#if ((closeoutForm?.actionName === 'prepare' && draft) || (closeoutForm?.actionName === 'refresh' && closeoutForm.values?.replaceSelection && problem.code === 'CLOSEOUT_DRAFT_CHANGED')) && closeoutForm.values?.documentId?.length}
        <div data-closeout-retained-selection>
          <strong>{portalText(locale, 'problem.closeout.selectionRetained')}</strong>
          <ul>
            {#each closeoutForm.values.documentId as id}
              {@const document = eligible.find((candidate) => String(candidate.id) === id)}
              <li>
                {document
                  ? String(document.safe_filename ?? document.original_filename ?? document.id)
                  : portalText(locale, 'problem.closeout.documentNoLongerAvailable')}
              </li>
            {/each}
          </ul>
        </div>
      {/if}
    </div>
  {/if}
  {#if actionFeedback}<p role="status">{actionFeedback}</p>{/if}
  {#if !draft}
    <SectionCard title={t.prepare}
      ><form
        method="POST"
        action="?/prepare"
        data-closeout-action="prepare"
        use:formValidation
        use:enhance={submitCloseout}
        onsubmit={rememberScroll}
      >
        <p>{t.selection}</p>
        <div id="closeout-documents">
          {#each eligible as document}<label
              ><input
                type="checkbox"
                name="documentId"
                value={String(document.id)}
                checked={selected('prepare', String(document.id))}
              />
              {String(document.safe_filename ?? document.original_filename ?? document.id)} · {documentLabel(
                document.artifact_type,
              )} · {documentLabel(document.sensitivity)}</label
            >{/each}
          {#each unavailableSelection('prepare') as id}<label
              ><input type="checkbox" checked disabled />
              {id} · {portalText(locale, 'problem.closeout.documentUnavailable')}</label
            >{/each}
        </div>
        <button type="submit">{t.prepareAction}</button>
      </form></SectionCard
    >
  {:else}
    <SectionCard title={`${t.draft} ${String(draft.revision_number)}`}
      ><p>SHA-256: <code>{String(draft.client_snapshot_sha256)}</code></p>
      <div class="preview-grid">
        <article>
          <h3>{t.internal}</h3>
          <h4>{t.project}</h4>
          <p>
            {text((internalSnapshot.project as Record<string, unknown>)?.project_number)} · {text(
              (internalSnapshot.project as Record<string, unknown>)?.name,
            )}
          </p>
          <h4>{t.reports}</h4>
          <ul>
            {#each rows(internalSnapshot.technicalReports) as report}<li>
                {text(report.report_date)} · {text(report.system_name)}
              </li>{:else}<li>{t.noItems}</li>{/each}
          </ul>
          <h4>{t.backups}</h4>
          <ul>
            {#each rows(internalSnapshot.systemBackupRegister) as item}<li>
                {text(item.report_date)} · {text(item.system_name)} · {text(
                  item.attachment_kind ?? item.system_reference_snapshot,
                )}
              </li>{:else}<li>{t.noItems}</li>{/each}
          </ul>
          <h4>{t.risks}</h4>
          <ul>
            {#each rows(internalSnapshot.technicalReports) as report}<li>
                {text(report.system_name)}: {text(report.validation_result)} · {text(
                  report.open_risk,
                )}
              </li>{:else}<li>{t.noItems}</li>{/each}
          </ul>
          <h4>{t.invoices}</h4>
          <ul>
            {#each rows(internalSnapshot.invoiceRegister) as invoice}<li>
                {text(invoice.invoice_number)} · {money(invoice)} · {translateControlledValue(
                  locale,
                  'status',
                  text(invoice.state),
                )}
              </li>{:else}<li>{t.noItems}</li>{/each}
          </ul>
          <h4>{t.payments}</h4>
          <ul>
            {#each rows(internalSnapshot.paymentCollectionStatus) as payment}<li>
                {text(payment.reference)} · {money(payment, 'amount_minor')} · {text(
                  payment.received_at,
                )}
              </li>{:else}<li>{t.noItems}</li>{/each}
          </ul>
          <h4>{t.expenses}</h4>
          <ul>
            {#each rows((internalSnapshot.expenseSummary as Record<string, unknown>)?.entries) as expense}<li
              >
                {money(expense, 'amount_minor')} · {text(expense.spent_on)} · {text(
                  expense.description,
                )}
              </li>{:else}<li>{t.noItems}</li>{/each}
          </ul>
          <h4>{t.documents}</h4>
          <ul>
            {#each rows(internalSnapshot.documentIndex) as item}<li>
                {text(item.safe_filename ?? item.original_filename)} · {documentLabel(
                  item.artifact_type,
                )}
              </li>{:else}<li>{t.noItems}</li>{/each}
          </ul>
          <details>
            <summary>{t.rawSnapshot}</summary>
            <pre>{JSON.stringify(internalSnapshot, null, 2)}</pre>
          </details>
        </article>
        <article>
          <h3>{t.client}</h3>
          <h4>{t.project}</h4>
          <p>
            {text((clientSnapshot.project as Record<string, unknown>)?.projectNumber)} · {text(
              (clientSnapshot.project as Record<string, unknown>)?.name,
            )}
          </p>
          <h4>{t.reports}</h4>
          <ul>
            {#each rows(clientSnapshot.technicalReports) as report}<li>
                {text(report.reportDate)} · {text(report.systemName)}
              </li>{:else}<li>{t.noItems}</li>{/each}
          </ul>
          <h4>{t.backups}</h4>
          <ul>
            {#each rows(clientSnapshot.systemBackupRegister) as item}<li>
                {text(item.systemName)} · {text(item.attachmentKind ?? item.systemReference)}
              </li>{:else}<li>{t.noItems}</li>{/each}
          </ul>
          <h4>{t.risks}</h4>
          <ul>
            {#each rows(clientSnapshot.technicalReports) as report}<li>
                {text(report.systemName)}: {text(report.validationResult)} · {text(report.openRisk)}
              </li>{:else}<li>{t.noItems}</li>{/each}
          </ul>
          <h4>{t.periods}</h4>
          <ul>
            {#each rows(clientSnapshot.acceptedPeriodReferences) as item}<li>
                {text(item.periodStart)} – {text(item.periodEnd)}
              </li>{:else}<li>{t.noItems}</li>{/each}
          </ul>
          <h4>{t.documents}</h4>
          <ul>
            {#each rows(clientSnapshot.selectedDocuments) as item}<li>
                {text(item.filename)} · {text(item.mediaType)}
              </li>{:else}<li>{t.noItems}</li>{/each}
          </ul>
          <details>
            <summary>{t.rawSnapshot}</summary>
            <pre>{JSON.stringify(clientSnapshot, null, 2)}</pre>
          </details>
        </article>
      </div>
      <form
        method="POST"
        action="?/refresh"
        data-closeout-action="refresh"
        use:formValidation
        use:enhance={submitCloseout}
        onsubmit={rememberScroll}
      >
        <input type="hidden" name="revisionId" value={String(draft.id)} />
        <input
          type="hidden"
          name="expectedClientSnapshotHash"
          value={String(draft.client_snapshot_sha256)}
        />
        <input
          type="hidden"
          name="expectedInternalSnapshotHash"
          value={String(draft.internal_snapshot_sha256)}
        />
        <input
          type="hidden"
          name="expectedConfirmationHash"
          value={String(draft.client_confirmation_hash ?? '')}
        />
        <input type="hidden" name="expectedUpdatedAt" value={String(draft.updated_at)} />
        <button type="submit">{t.refresh}</button>
      </form>
      <form
        method="POST"
        action="?/refresh"
        data-closeout-action="refreshSelection"
        use:formValidation
        use:enhance={submitCloseout}
        onsubmit={rememberScroll}
      >
        <input type="hidden" name="revisionId" value={String(draft.id)} />
        <input
          type="hidden"
          name="expectedClientSnapshotHash"
          value={String(draft.client_snapshot_sha256)}
        />
        <input
          type="hidden"
          name="expectedInternalSnapshotHash"
          value={String(draft.internal_snapshot_sha256)}
        />
        <input
          type="hidden"
          name="expectedConfirmationHash"
          value={String(draft.client_confirmation_hash ?? '')}
        />
        <input type="hidden" name="expectedUpdatedAt" value={String(draft.updated_at)} />
        <input type="hidden" name="replaceSelection" value="true" />
        <fieldset id="closeout-documents">
          <legend>{t.replace}</legend>{#each eligible as document}<label
              ><input
                type="checkbox"
                name="documentId"
                value={String(document.id)}
                checked={selected('refresh', String(document.id), true)}
              />
              {String(document.safe_filename ?? document.original_filename ?? document.id)} · {documentLabel(
                document.artifact_type,
              )}</label
            >{/each}
          {#each unavailableSelection('refresh', true) as id}<label
              ><input type="checkbox" checked disabled />
              {id} · {portalText(locale, 'problem.closeout.documentUnavailable')}</label
            >{/each}
        </fieldset>
        <button type="submit">{t.replace}</button>
      </form>
      {#if !draft.client_confirmation_hash}<form
          method="POST"
          action="?/confirmClient"
          data-closeout-action="confirmClient"
          use:formValidation
          use:enhance={submitCloseout}
          onsubmit={rememberScroll}
        >
          <input type="hidden" name="revisionId" value={String(draft.id)} /><input
            type="hidden"
            name="clientSnapshotHash"
            value={String(draft.client_snapshot_sha256)}
          /><label
            ><input type="checkbox" name="confirmationChecked" value="yes" required />
            {t.confirm}</label
          ><button type="submit">{t.confirmAction}</button>
        </form>{:else}<form
          method="POST"
          action="?/finalize"
          data-closeout-action="finalize"
          use:formValidation
          use:enhance={submitCloseout}
          onsubmit={rememberScroll}
        >
          <input type="hidden" name="revisionId" value={String(draft.id)} /><button type="submit"
            >{t.finalize}</button
          >
        </form>{/if}
    </SectionCard>
  {/if}
  <SectionCard title={t.revisions}
    ><ul>
      {#each revisions as revision}<li>
          {t.revision}
          {String(revision.revision_number)} · {revision.state === 'final' ? t.final : t.draft} · {String(
            revision.finalized_at ?? revision.created_at,
          )}
          {#if revision.state === 'final'}<div class="artifact-links">
              {#each artifacts.filter((artifact) => artifact.revision_id === revision.id) as artifact}<a
                  href={base +
                    '/app/api/projects/closeout/artifact/' +
                    encodeURIComponent(String(artifact.id))}
                  download
                  >{artifact.audience === 'internal' ? t.internal : t.client} · {String(
                    artifact.semantic_filename,
                  )} · {t.ready}</a
                >{/each}
            </div>{/if}{#if data.user.role === 'owner_admin' && revision.state === 'final' && !draft && project.status === 'closed' && revision.id === revisions[0]?.id}<form
              method="POST"
              action="?/reopen"
              data-closeout-action="reopen"
              use:formValidation
              use:enhance={submitCloseout}
              onsubmit={rememberScroll}
            >
              <input type="hidden" name="revisionId" value={String(revision.id)} /><Field
                id="reopen-reason"
                label={t.reason}
                required
                ><input
                  id="reopen-reason"
                  name="reason"
                  value={closeoutForm?.actionName === 'reopen' &&
                  closeoutForm.values?.revisionId === String(revision.id)
                    ? (closeoutForm.values.reason ?? '')
                    : ''}
                  required
                  maxlength="2000"
                /></Field
              ><button type="submit">{t.reopen}</button>
            </form>{/if}
        </li>{/each}
    </ul>
    {#if data.closeout.legacyEvidence}<p>{t.legacy}</p>{/if}</SectionCard
  >
</main>

<style>
  .closeout-page {
    max-width: 900px;
    margin: 2rem auto;
    padding: 1rem;
  }
  .closeout-page header,
  .closeout-page form {
    padding: 1rem;
    margin: 1rem 0;
    display: grid;
    gap: 0.75rem;
  }
  .closeout-page label {
    display: block;
  }
  .closeout-page button {
    min-height: 40px;
    width: max-content;
    max-width: 100%;
    padding: 0.6rem 1rem;
    white-space: normal;
    text-align: left;
  }
  .closeout-page code {
    overflow-wrap: anywhere;
  }
  .preview-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 1rem;
  }
  .preview-grid article {
    border: 1px solid #dcdbd9;
    padding: 0.75rem;
  }
  .preview-grid h4 {
    margin: 1.25rem 0 0.35rem;
  }
  .preview-grid ul {
    margin: 0.25rem 0;
    padding-inline-start: 1.25rem;
  }
  .preview-grid li {
    overflow-wrap: anywhere;
  }
  .preview-grid pre {
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    max-height: 24rem;
    overflow: auto;
  }
  .artifact-links {
    display: grid;
    gap: 0.35rem;
  }
  @media (max-width: 640px) {
    .preview-grid {
      grid-template-columns: 1fr;
    }
  }
  @media (max-width: 640px) {
    .closeout-page {
      padding: 0.75rem;
    }
    .closeout-page button {
      width: 100%;
    }
  }
</style>
