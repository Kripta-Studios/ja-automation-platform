<script lang="ts">
  import { base } from '$app/paths';
  import { Field, SectionCard } from '$lib/portal/ui';
  import { closeoutCopy } from './copy';
  let { data, form } = $props();
  const locale = $derived(data.locale === 'es' ? 'es' : data.locale === 'pt' ? 'pt' : 'en');
  const t = $derived(closeoutCopy[locale]);
  const project = $derived(data.project as Record<string, unknown>);
  const revisions = $derived((data.closeout.revisions ?? []) as Array<Record<string, unknown>>);
  const artifacts = $derived((data.closeout.artifacts ?? []) as Array<Record<string, unknown>>);
  const draft = $derived(revisions.find((revision) => revision.state === 'draft'));
  const eligible = $derived((data.documents ?? []) as Array<Record<string, unknown>>);
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
    return `${text(row.currency)} ${text(row[amount])} minor units`;
  }
  const internalSnapshot = $derived(draft ? snapshot(draft.internal_snapshot_json) : {});
  const clientSnapshot = $derived(draft ? snapshot(draft.client_snapshot_json) : {});
</script>

<svelte:head><title>Closeout · {String(project.project_number ?? '')}</title></svelte:head>
<main
  class="closeout-page"
  data-closeout-page
  data-role={data.user.role}
  lang={locale === 'pt' ? 'pt-BR' : locale}
>
  <a href={base + '/app/projects/' + encodeURIComponent(String(project.id)) + '?lang=' + locale}
    >← {t.back}</a
  >
  <header>
    <p>{t.kicker}</p>
    <h1>{String(project.name ?? 'Project')}</h1>
    <p>{t.immutable}</p>
  </header>
  {#if form?.message}<p role="status">{String(form.message)}</p>{/if}
  {#if !draft}
    <SectionCard title={t.prepare}
      ><form method="POST" action="?/prepare">
        <p>{t.selection}</p>
        {#each eligible as document}<label
            ><input type="checkbox" name="documentId" value={String(document.id)} />
            {String(document.safe_filename ?? document.original_filename ?? document.id)} · {String(
              document.artifact_type,
            )} · {String(document.sensitivity)}</label
          >{/each}<button type="submit">{t.prepareAction}</button>
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
                {text(invoice.invoice_number)} · {money(invoice)} · {text(invoice.state)}
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
                {text(item.safe_filename ?? item.original_filename)} · {text(item.artifact_type)}
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
      <form method="POST" action="?/refresh">
        <input type="hidden" name="revisionId" value={String(draft.id)} /><button type="submit"
          >{t.refresh}</button
        >
      </form>
      <form method="POST" action="?/refresh">
        <input type="hidden" name="revisionId" value={String(draft.id)} /><input
          type="hidden"
          name="replaceSelection"
          value="true"
        />
        <fieldset>
          <legend>{t.replace}</legend>{#each eligible as document}<label
              ><input type="checkbox" name="documentId" value={String(document.id)} />
              {String(document.safe_filename ?? document.original_filename ?? document.id)} · {String(
                document.artifact_type,
              )}</label
            >{/each}
        </fieldset>
        <button type="submit">{t.replace}</button>
      </form>
      {#if !draft.client_confirmation_hash}<form method="POST" action="?/confirmClient">
          <input type="hidden" name="revisionId" value={String(draft.id)} /><input
            type="hidden"
            name="clientSnapshotHash"
            value={String(draft.client_snapshot_sha256)}
          /><label><input type="checkbox" required /> {t.confirm}</label><button type="submit"
            >{t.confirmAction}</button
          >
        </form>{:else}<form method="POST" action="?/finalize">
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
            >
              <input type="hidden" name="revisionId" value={String(revision.id)} /><Field
                id={`reopen-${String(revision.id)}`}
                label={t.reason}
                required
                ><input
                  id={`reopen-${String(revision.id)}`}
                  name="reason"
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
    border: 1px solid #d5dbe3;
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
