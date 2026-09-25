<script lang="ts">
  import { page } from '$app/stores';
  import { normalizePortalLocale, portalText } from '$lib/portal-i18n';
  import { translateControlledValue } from '$lib/i18n/controlled-values';
  import type { ProblemData, ProblemRemedy } from '$lib/problem/contract';

  type NoticeKind = 'error' | 'warning' | 'service' | 'success';
  type RemedyLink = { label: string; href?: string };

  let {
    problem,
    kind = 'error',
    title,
    status,
    remedyLinks = {},
    class: className = '',
  }: {
    problem: ProblemData;
    kind?: NoticeKind;
    title?: string;
    status?: string;
    /** Only server-permitted remedy IDs are rendered. Callers provide route-safe labels/links. */
    remedyLinks?: Readonly<Record<string, RemedyLink>>;
    class?: string;
  } = $props();

  const locale = $derived(
    normalizePortalLocale($page.url.searchParams.get('lang') ?? $page.data.locale),
  );
  const params = $derived(
    Object.fromEntries(
      Object.entries(problem.params ?? {}).map(([key, value]) => [
        key,
        key === 'status'
          ? translateControlledValue(locale, 'status', String(value ?? ''))
          : String(value ?? ''),
      ]),
    ),
  );
  const message = $derived(portalText(locale, problem.messageKey, params));
  const heading = $derived(
    title ??
      portalText(
        locale,
        kind === 'success'
          ? 'problem.notice.saved'
          : kind === 'warning'
            ? 'problem.notice.beforeContinue'
            : kind === 'service'
              ? 'problem.notice.serviceUnavailable'
              : 'problem.notice.actionNeeded',
      ),
  );
  const visibleRemedies = $derived(
    (problem.remedies ?? [])
      .map((remedy: ProblemRemedy) => ({ remedy, link: remedyLinks[remedy.id] }))
      .filter((item): item is { remedy: ProblemRemedy; link: RemedyLink } => Boolean(item.link)),
  );
</script>

<aside
  data-ui="problem-notice"
  data-kind={kind}
  data-problem-code={problem.code}
  class={`ui-problem-notice ${className}`.trim()}
  role={kind === 'error' ? 'alert' : 'status'}
  tabindex="-1"
  aria-live={kind === 'error' ? 'assertive' : 'polite'}
  aria-atomic="true"
>
  <strong class="ui-problem-notice__title">{heading}</strong>
  <p>{message}</p>
  {#if status}<p class="ui-problem-notice__status">{status}</p>{/if}
  {#if kind === 'service'}
    <p>{portalText(locale, 'problem.notice.checkSaveBeforeRetry')}</p>
  {/if}
  {#if visibleRemedies.length}
    <ul>
      {#each visibleRemedies as { remedy, link } (remedy.id)}
        <li>
          {#if link.href}
            <a href={link.href}>{link.label}</a>
          {:else}
            <span>{link.label}</span>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
  {#if problem.correlationId && kind === 'service'}
    <small
      >{portalText(locale, 'problem.error.reference', {
        correlationId: problem.correlationId,
      })}</small
    >
  {/if}
</aside>

<style>
  [data-ui='problem-notice'] {
    min-width: 0;
    margin-block: 0 1rem;
    padding: 0.9rem 1rem;
    border: 1px solid var(--ja-border-subdued, #d6d5d2);
    border-inline-start: 0.3rem solid var(--ja-status-danger, #a40f18);
    border-radius: var(--ja-control-radius, 0.5rem);
    background: var(--ja-surface, #fff);
    color: var(--ja-text-primary, #181716);
    overflow-wrap: anywhere;
  }
  [data-kind='warning'] {
    border-inline-start-color: var(--ja-status-warning, #a66300);
  }
  [data-kind='service'] {
    border-inline-start-color: var(--ja-status-info, #3f5f85);
  }
  [data-kind='success'] {
    border-inline-start-color: var(--ja-status-success, #43734d);
  }
  .ui-problem-notice__title {
    display: block;
    margin-bottom: 0.3rem;
  }
  p {
    margin: 0.25rem 0;
    line-height: 1.45;
  }
  .ui-problem-notice__status {
    font-weight: 600;
  }
  ul {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem 1rem;
    margin: 0.65rem 0 0;
    padding: 0;
    list-style: none;
  }
  a {
    display: inline-flex;
    align-items: center;
    min-height: 2.75rem;
    text-decoration: underline;
    text-underline-offset: 0.15em;
  }
  a:focus-visible {
    outline: 2px solid var(--ja-border-focus, #727068);
    outline-offset: 2px;
  }
  small {
    display: block;
    margin-top: 0.4rem;
  }
</style>
