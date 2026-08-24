<script lang="ts">
  import type { PortalLocale } from '../../portal-i18n';
  import type { ControlledValueDomain } from '../../i18n/controlled-values';
  import AccountingPackArtifactStatus from '../ui/localized-pdf/AccountingPackArtifactStatus.svelte';
  import type { PortalData } from '../portal-data';
  import { SectionCard } from '../ui';

  type Props = {
    data: PortalData;
    isAuditor: boolean;
    locale: PortalLocale;
    translate: (value: string) => string;
    controlledValue: (domain: ControlledValueDomain, value: unknown) => string;
  };

  let { data, isAuditor, locale, translate, controlledValue }: Props = $props();

  const packs = $derived(data.packs ?? []);

  function packState(pack: Record<string, unknown>): string {
    return String(pack.state ?? 'pending').toLowerCase();
  }

  function stateCount(state: string): number {
    return packs.filter((pack) => packState(pack) === state).length;
  }
</script>

<div class="accounting-section" data-ui="accounting-section">
  <header class="accounting-section__context">
    <div>
      <p class="accounting-section__eyebrow">{translate('Finance operations')}</p>
      <h2>{translate('Accounting')}</h2>
      <p>
        {translate(
          'Create a reviewable Accounting Pack and follow each artifact until it is ready, failed or queued for automatic processing.',
        )}
      </p>
    </div>
  </header>

  <div
    class="accounting-section__attention"
    aria-label={translate('Accounting Pack attention summary')}
  >
    <article>
      <span>{translate('Packs')}</span>
      <strong>{packs.length}</strong>
      <small>{translate('Immutable period registers')}</small>
    </article>
    <article>
      <span>{translate('Queued')}</span>
      <strong>{stateCount('queued')}</strong>
      <small>{translate('Automatic artifact processing pending')}</small>
    </article>
    <article>
      <span>{translate('Failed')}</span>
      <strong>{stateCount('failed')}</strong>
      <small>{translate('Independent artifact retry may be available')}</small>
    </article>
  </div>

  {#if !isAuditor}
    <SectionCard
      title={translate('Generate monthly Accounting Pack')}
      class="accounting-section__create"
    >
      <form method="POST" action="?/createAccountingPack" class="accounting-section__form">
        <p>
          {translate(
            'The pack contains invoice register, collections, worker/direct costs, expenses, accounts receivable, contribution, source counts and deterministic artifacts.',
          )}
        </p>
        <div class="accounting-section__fields">
          <label>
            <span>{translate('Period start')}</span>
            <input name="periodStart" type="date" required />
          </label>
          <label>
            <span>{translate('Period end')}</span>
            <input name="periodEnd" type="date" required />
          </label>
          <label>
            <span>{translate('Report language')}</span>
            <select name="reportLocale" aria-label={translate('Accounting Pack report language')}>
              <option value="en">{translate('English')}</option>
              <option value="pt">{translate('Português (BR)')}</option>
              <option value="es">{translate('Spanish')}</option>
            </select>
          </label>
        </div>
        <div class="accounting-section__actions">
          <button type="submit">{translate('Generate pack')}</button>
        </div>
      </form>
    </SectionCard>
  {/if}

  <SectionCard title={translate('Accounting Pack register')} class="accounting-section__register">
    {#if packs.length > 0}
      <div class="accounting-section__packs" aria-live="polite">
        {#each packs as pack}
          <AccountingPackArtifactStatus {pack} {isAuditor} {locale} {translate} {controlledValue} />
        {/each}
      </div>
    {:else}
      <div class="accounting-section__empty" role="status">
        <strong>{translate('No Accounting Packs have been generated.')}</strong>
        <span
          >{translate('Generate a period pack when the source records are ready for review.')}</span
        >
      </div>
    {/if}
  </SectionCard>
</div>

<style>
  .accounting-section {
    display: grid;
    gap: 1.25rem;
  }

  .accounting-section__context {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 1rem;
  }

  .accounting-section__eyebrow {
    margin: 0 0 0.35rem;
    color: var(--portal-muted, #64748b);
    font-size: 0.72rem;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }

  .accounting-section__context h2 {
    margin: 0;
    color: var(--portal-ink, #16202a);
    font-size: clamp(1.55rem, 2vw, 2rem);
    letter-spacing: -0.025em;
  }

  .accounting-section__context p:last-child {
    max-width: 48rem;
    margin: 0.4rem 0 0;
    color: var(--portal-muted, #64748b);
  }

  .accounting-section__attention {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 0.75rem;
  }

  .accounting-section__attention article {
    display: grid;
    gap: 0.22rem;
    min-height: 6rem;
    padding: 0.9rem 1rem;
    border: 1px solid var(--portal-border, #d7dee8);
    border-radius: 0.75rem;
    background: var(--portal-surface, #fff);
  }

  .accounting-section__attention span,
  .accounting-section__attention small {
    color: var(--portal-muted, #64748b);
    font-size: 0.8rem;
  }

  .accounting-section__attention strong {
    color: var(--portal-ink, #16202a);
    font-size: 1.45rem;
    font-variant-numeric: tabular-nums;
  }

  .accounting-section__form {
    display: grid;
    gap: 1rem;
  }

  .accounting-section__form > p {
    max-width: 60rem;
    margin: 0;
    color: var(--portal-muted, #64748b);
  }

  .accounting-section__fields {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 0.75rem;
  }

  .accounting-section__fields label {
    display: grid;
    gap: 0.35rem;
    color: var(--portal-muted, #64748b);
    font-size: 0.78rem;
    font-weight: 650;
  }

  .accounting-section__fields input,
  .accounting-section__fields select {
    min-height: 2.75rem;
    padding: 0.55rem 0.7rem;
    border: 1px solid var(--portal-border-strong, #b8c3d1);
    border-radius: 0.5rem;
    background: var(--portal-surface, #fff);
    color: var(--portal-ink, #16202a);
    font: inherit;
  }

  .accounting-section__actions {
    display: flex;
    justify-content: flex-end;
  }

  .accounting-section__actions button {
    min-height: 2.75rem;
  }

  .accounting-section__packs {
    display: grid;
    gap: 0.9rem;
  }

  .accounting-section__empty {
    display: grid;
    gap: 0.3rem;
    padding: 1.25rem 0.5rem;
    text-align: center;
  }

  .accounting-section__empty span {
    color: var(--portal-muted, #64748b);
  }

  .accounting-section__fields input:focus-visible,
  .accounting-section__fields select:focus-visible,
  .accounting-section__actions button:focus-visible {
    outline: 3px solid color-mix(in srgb, var(--portal-accent, #0f5f73) 32%, transparent);
    outline-offset: 2px;
  }

  @media (max-width: 52rem) {
    .accounting-section__fields {
      grid-template-columns: 1fr;
    }

    .accounting-section__actions,
    .accounting-section__actions button {
      width: 100%;
    }
  }

  @media (max-width: 36rem) {
    .accounting-section__attention {
      grid-template-columns: 1fr;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .accounting-section * {
      scroll-behavior: auto;
    }
  }
</style>
