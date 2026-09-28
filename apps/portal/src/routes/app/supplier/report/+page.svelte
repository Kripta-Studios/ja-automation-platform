<script lang="ts">
  import { base } from '$app/paths';
  import { beforeNavigate, afterNavigate } from '$app/navigation';
  import type { ProblemData } from '$lib/problem/contract';
  import { translateControlledValue } from '$lib/i18n/controlled-values';
  import { privateDownloadFilename } from '$lib/portal/ui/private-document-download';
  import { portalText } from '$lib/portal-i18n';
  import { ProblemNotice, SectionCard } from '$lib/portal/ui';
  import { supplierCopy, supplierStateLabel, supplierCategoryLabel } from '../copy';
  import { tick } from 'svelte';
  import { page } from '$app/stores';
  let { data } = $props();
  const c = $derived(supplierCopy[data.locale as keyof typeof supplierCopy]);
  const fromError = $derived(data.periodProblem?.fieldErrors.from?.[0] ?? '');
  const toError = $derived(data.periodProblem?.fieldErrors.to?.[0] ?? '');
  const periodDateInvalid = $derived(
    data.periodProblem?.code === 'SUPPLIER_REPORT_PERIOD_DATE_INVALID',
  );
  let projectProblemContainer = $state<HTMLDivElement>();
  let supplierProblemContainer = $state<HTMLDivElement>();
  let periodProblemContainer = $state<HTMLDivElement>();
  let csvProblemContainer = $state<HTMLDivElement>();
  let csvProblem = $state<ProblemData | null>(null);
  let csvController: AbortController | null = null;
  const csvKeys: Readonly<Record<string, ProblemData['messageKey']>> = {
    SUPPLIER_REPORT_SIGN_IN_REQUIRED: 'problem.supplier.reportSignInRequired',
    SUPPLIER_REPORT_ROLE_REQUIRED: 'problem.supplier.reportRoleRequired',
    SUPPLIER_REPORT_PROJECT_REQUIRED: 'problem.supplier.reportProjectRequired',
    SUPPLIER_REPORT_PROJECT_UNAVAILABLE: 'problem.supplier.reportProjectUnavailable',
    SUPPLIER_REPORT_PROJECT_SCOPE_CHANGED: 'problem.supplier.reportProjectScopeChanged',
    SUPPLIER_REPORT_SUPPLIER_UNAVAILABLE: 'problem.supplier.reportSupplierUnavailable',
    SUPPLIER_REPORT_PERIOD_DATE_INVALID: 'problem.supplier.reportPeriodDateInvalid',
    SUPPLIER_REPORT_PERIOD_ORDER_INVALID: 'problem.supplier.reportPeriodOrderInvalid',
    SUPPLIER_REPORT_SERVICE_UNAVAILABLE: 'problem.supplier.reportServiceUnavailable',
  };
  const csvRemedyIds = new Set([
    'sign_in_again',
    'contact_owner',
    'choose_operational_project',
    'review_supplier_project',
    'choose_supplier',
    'review_report_period',
    'retry_supplier_report_download',
  ]);
  const csvRemedyLinks = $derived({
    sign_in_again: {
      label: portalText(data.locale, 'problem.remedy.signInAgain'),
      href: `${base}/app/login`,
    },
    contact_owner: { label: portalText(data.locale, 'problem.remedy.contactOwner') },
    choose_operational_project: {
      label: portalText(data.locale, 'problem.remedy.chooseOperationalProject'),
      href: '#supplier-report-project',
    },
    review_supplier_project: {
      label: portalText(data.locale, 'problem.remedy.reviewSupplierProject'),
      href:
        data.owner && data.projectId
          ? `${base}/app/projects/${encodeURIComponent(data.projectId)}`
          : undefined,
    },
    choose_supplier: {
      label: portalText(data.locale, 'problem.remedy.chooseSupplier'),
      href: '#supplier-report-supplier',
    },
    review_report_period: {
      label: portalText(data.locale, 'problem.remedy.reviewReportPeriod'),
      href: '#supplier-report-period-from',
    },
    retry_supplier_report_download: {
      label: portalText(data.locale, 'problem.remedy.retrySupplierReportDownload'),
      href: '#supplier-report-download',
    },
    review_supplier_projects: {
      label: portalText(data.locale, 'problem.remedy.reviewSupplierProject'),
      href: data.owner ? `${base}/app/projects` : undefined,
    },
  });
  const decimalHours = (minutes: number): string => String(Number((minutes / 60).toFixed(4)));
  const query = $derived(
    new URLSearchParams({
      projectId: data.projectId || '',
      from: data.from,
      to: data.to,
      lang: data.locale,
      ...(data.supplierId ? { supplierId: data.supplierId } : {}),
    }).toString(),
  );
  const backHref = $derived(
    data.technician
      ? '/j-aautomation/app'
      : `/j-aautomation/app/supplier?${new URLSearchParams({
          projectId: data.projectId || '',
          from: data.from,
          to: data.to,
          lang: data.locale,
          workspaceAction: 'report',
        })}#supplier-workspace`,
  );
  function csvFallback(kind: 'network' | 'invalid' | 'signIn', reference = ''): ProblemData {
    const definitions = {
      network: {
        code: 'SUPPLIER_REPORT_CSV_NETWORK_UNAVAILABLE',
        messageKey: 'problem.supplier.reportCsvNetworkUnavailable',
        message:
          'The CSV could not be reached. No report data was changed. Check your connection and try the download again.',
        remedies: [{ id: 'retry_supplier_report_download' }],
      },
      invalid: {
        code: 'SUPPLIER_REPORT_CSV_INVALID_RESPONSE',
        messageKey: 'problem.supplier.reportCsvInvalidResponse',
        message:
          'The CSV response could not be verified. No report data was changed. Review the report and try the download again.',
        remedies: [{ id: 'retry_supplier_report_download' }],
      },
      signIn: {
        code: 'SUPPLIER_REPORT_SIGN_IN_REQUIRED',
        messageKey: 'problem.supplier.reportSignInRequired',
        message: 'Your session ended. Sign in again to download the operational report.',
        remedies: [{ id: 'sign_in_again' }],
      },
    } as const;
    return {
      ...definitions[kind],
      params: {},
      fieldErrors: {},
      correlationId: /^[A-Za-z0-9._:-]{8,96}$/u.test(reference) ? reference : '',
    };
  }
  function responseProblem(payload: unknown, reference: string): ProblemData | null {
    if (!payload || typeof payload !== 'object') return null;
    const body = payload as Record<string, unknown>;
    const messageKey = typeof body.code === 'string' ? csvKeys[body.code] : undefined;
    if (
      typeof body.code !== 'string' ||
      !messageKey ||
      body.messageKey !== messageKey ||
      !Array.isArray(body.remedies) ||
      !body.remedies.every(
        (remedy) =>
          remedy &&
          typeof remedy === 'object' &&
          typeof remedy.id === 'string' &&
          csvRemedyIds.has(remedy.id),
      )
    )
      return null;
    const correlationId =
      typeof body.correlationId === 'string' && /^[A-Za-z0-9._:-]{8,96}$/u.test(body.correlationId)
        ? body.correlationId
        : reference;
    const params: ProblemData['params'] =
      body.code === 'SUPPLIER_REPORT_PROJECT_UNAVAILABLE' &&
      data.owner &&
      body.params &&
      typeof body.params === 'object'
        ? {
            projectName: String((body.params as Record<string, unknown>).projectName ?? ''),
            status: String((body.params as Record<string, unknown>).status ?? ''),
          }
        : body.code === 'SUPPLIER_REPORT_SERVICE_UNAVAILABLE'
          ? { correlationId }
          : {};
    return {
      code: body.code,
      messageKey,
      params,
      fieldErrors: {},
      remedies: body.remedies as ProblemData['remedies'],
      correlationId,
    };
  }
  async function showCsvProblem(problem: ProblemData): Promise<void> {
    csvProblem = problem;
    await tick();
    requestAnimationFrame(() => {
      const notice = csvProblemContainer?.querySelector<HTMLElement>('[data-ui="problem-notice"]');
      if (!notice?.isConnected) return;
      notice.focus({ preventScroll: true });
      const bounds = notice.getBoundingClientRect();
      if (bounds.top < 72 || bounds.bottom > window.innerHeight - 88)
        notice.scrollIntoView({ block: 'nearest' });
    });
  }
  async function downloadCsv(event: MouseEvent): Promise<void> {
    if (event.button !== 0 && event.button !== 1) return;
    event.preventDefault();
    csvController?.abort();
    const controller = new AbortController();
    csvController = controller;
    csvProblem = null;
    try {
      const response = await fetch((event.currentTarget as HTMLAnchorElement).href, {
        method: 'GET',
        credentials: 'same-origin',
        cache: 'no-store',
        signal: controller.signal,
        headers: { accept: 'text/csv, application/problem+json, application/json' },
      });
      if (controller.signal.aborted) return;
      const rawReference = response.headers.get('x-correlation-id') ?? '';
      const reference = /^[A-Za-z0-9._:-]{8,96}$/u.test(rawReference) ? rawReference : '';
      if (response.redirected) {
        const destination = new URL(response.url);
        await showCsvProblem(
          csvFallback(
            destination.origin === location.origin && destination.pathname.endsWith('/app/login')
              ? 'signIn'
              : 'invalid',
            reference,
          ),
        );
        return;
      }
      if (!response.ok) {
        const type = response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase();
        const payload =
          type === 'application/problem+json' || type === 'application/json'
            ? await response.json().catch(() => null)
            : null;
        if (controller.signal.aborted) return;
        await showCsvProblem(
          responseProblem(payload, reference) ??
            csvFallback(response.status === 401 ? 'signIn' : 'invalid', reference),
        );
        return;
      }
      const type = response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase();
      const disposition = response.headers.get('content-disposition');
      if (type !== 'text/csv' || !/^attachment(?:\s*;|\s*$)/iu.test(disposition ?? '')) {
        await showCsvProblem(csvFallback('invalid', reference));
        return;
      }
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (controller.signal.aborted) return;
      const expectedLength = response.headers.get('content-length');
      let validUtf8 = true;
      try {
        new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      } catch {
        validUtf8 = false;
      }
      if (
        bytes.length === 0 ||
        bytes.includes(0) ||
        !validUtf8 ||
        (expectedLength !== null &&
          (!/^\d+$/u.test(expectedLength) || Number(expectedLength) !== bytes.length))
      ) {
        await showCsvProblem(csvFallback('invalid', reference));
        return;
      }
      const filename = privateDownloadFilename(disposition, 'operational-report.csv');
      const safeName = filename
        .replace(/\.[^.]*$/u, '')
        .replace(/[<>:"|?*]/gu, '_')
        .replace(/^\.+/u, '')
        .trim();
      const url = URL.createObjectURL(new Blob([bytes], { type: 'text/csv;charset=utf-8' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `${safeName || 'operational-report'}.csv`;
      link.hidden = true;
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch {
      if (!controller.signal.aborted) await showCsvProblem(csvFallback('network'));
    } finally {
      if (csvController === controller) csvController = null;
    }
  }
  beforeNavigate(() => {
    csvController?.abort();
    csvController = null;
  });
  function rememberPeriodScroll(event: SubmitEvent): void {
    const form = event.currentTarget as HTMLFormElement;
    const scrollInput = form.elements.namedItem('viewportScrollY');
    if (scrollInput instanceof HTMLInputElement)
      scrollInput.value = String(Math.max(0, Math.round(window.scrollY)));
  }
  function focusPageProblem(): void {
    const container = data.projectProblem
      ? projectProblemContainer
      : data.supplierProblem
        ? supplierProblemContainer
        : data.periodProblem
          ? periodProblemContainer
          : undefined;
    if (!container) return;
    void tick().then(() =>
      requestAnimationFrame(() => {
        if (!container.isConnected) return;
        const notice = container.querySelector<HTMLElement>('[data-ui="problem-notice"]');
        const target =
          data.periodProblem && container === periodProblemContainer
            ? (container.querySelector<HTMLElement>('[data-ui="validation-summary"]') ?? notice)
            : notice;
        if (!target) return;
        const scroll = $page.url.searchParams.get('viewportScrollY');
        if (scroll && /^\d{1,7}$/.test(scroll)) window.scrollTo(0, Number(scroll));
        if (document.activeElement !== target && !target.contains(document.activeElement))
          target.focus({ preventScroll: true });
        const bounds = target.getBoundingClientRect();
        if (bounds.top < 72 || bounds.bottom > window.innerHeight - 72)
          target.scrollIntoView({ block: 'nearest' });
      }),
    );
  }
  $effect(() => {
    if (data.projectProblem || data.supplierProblem || data.periodProblem) focusPageProblem();
  });
  // Kit applies fragment focus in a timer after navigation. Run after that timer.
  afterNavigate(() => {
    if (data.projectProblem || data.supplierProblem || data.periodProblem)
      setTimeout(focusPageProblem, 160);
  });
</script>

<svelte:head><title>{c.report} · J&A</title></svelte:head>
<div class="supplier-page" lang={data.locale}>
  <nav><a href={backHref}>{c.back}</a></nav>
  <h1 class="supplier-title">{c.report}</h1>
  <p>{c.reportNote}</p>
  {#if data.projectProblem}
    <div id="supplier-report-project-problem" bind:this={projectProblemContainer}>
      <ProblemNotice
        problem={data.projectProblem}
        locale={data.locale}
        remedyLinks={csvRemedyLinks}
      />
    </div>
  {/if}
  {#if data.supplierProblem}
    <div id="supplier-report-supplier-problem" bind:this={supplierProblemContainer}>
      <ProblemNotice
        problem={data.supplierProblem}
        locale={data.locale}
        remedyLinks={csvRemedyLinks}
      />
    </div>
  {/if}
  {#if data.periodProblem}
    <div id="supplier-report-period-problem" bind:this={periodProblemContainer}>
      <ProblemNotice
        problem={data.periodProblem}
        kind="error"
        locale={data.locale}
        remedyLinks={{
          review_report_period: {
            label: portalText(data.locale, 'problem.remedy.reviewReportPeriod'),
            href: fromError ? '#supplier-report-period-from' : '#supplier-report-period-to',
          },
        }}
      />
      {#if fromError && toError}
        <div data-ui="validation-summary" tabindex="-1">
          <strong>{portalText(data.locale, 'Check the highlighted fields')}</strong>
          <ul>
            <li>
              <a href="#supplier-report-period-from"
                >{c.from}: {portalText(data.locale, fromError)}</a
              >
            </li>
            <li>
              <a href="#supplier-report-period-to">{c.to}: {portalText(data.locale, toError)}</a>
            </li>
          </ul>
        </div>
      {/if}
    </div>
  {/if}
  <form method="GET" action="#supplier-report" onsubmit={rememberPeriodScroll}>
    <input type="hidden" name="viewportScrollY" value="" />
    <label
      >{c.project}<select
        id="supplier-report-project"
        name="projectId"
        value={data.projectId}
        aria-invalid={data.projectProblem?.fieldErrors.projectId ? 'true' : undefined}
        aria-describedby={data.projectProblem ? 'supplier-report-project-problem' : undefined}
        ><option value="">—</option>
        {#if data.unavailableProject}
          <option value={data.unavailableProject.id}
            >{data.owner && data.unavailableProject.name
              ? `${data.unavailableProject.name} — ${translateControlledValue(data.locale, 'status', data.unavailableProject.status ?? '')}`
              : portalText(data.locale, 'problem.supplier.reportUnavailableProjectOption')}</option
          >
        {/if}
        {#each data.projects as project}<option value={project.id}>{project.name}</option
          >{/each}</select
      ></label
    >
    {#if data.owner}<label
        >{c.provider}<select
          id="supplier-report-supplier"
          name="supplierId"
          value={data.supplierId || ''}
          aria-invalid={data.supplierProblem ? 'true' : undefined}
          aria-describedby={data.supplierProblem ? 'supplier-report-supplier-problem' : undefined}
          ><option value="">—</option>{#if data.supplierProblem && data.supplierId}<option
              value={data.supplierId}
              >{portalText(data.locale, 'problem.supplier.reportSupplierUnavailable')}</option
            >{/if}{#each data.suppliers as supplier}<option value={supplier.id}
              >{supplier.name}</option
            >{/each}</select
        ></label
      >{/if}
    <label
      >{c.from}<input
        id="supplier-report-period-from"
        type={periodDateInvalid && fromError ? 'text' : 'date'}
        name="from"
        value={data.from}
        required
        aria-invalid={fromError ? 'true' : undefined}
        aria-describedby={fromError ? 'supplier-report-period-from-error' : undefined}
      />{#if fromError}<small id="supplier-report-period-from-error" role="alert"
          >{portalText(data.locale, fromError)}</small
        >{/if}</label
    ><label
      >{c.to}<input
        id="supplier-report-period-to"
        type={periodDateInvalid && toError ? 'text' : 'date'}
        name="to"
        value={data.to}
        required
        aria-invalid={toError ? 'true' : undefined}
        aria-describedby={toError ? 'supplier-report-period-to-error' : undefined}
      />{#if toError}<small id="supplier-report-period-to-error" role="alert"
          >{portalText(data.locale, toError)}</small
        >{/if}</label
    >
    <label
      >{portalText(data.locale, 'Language')}<select name="lang" value={data.locale}
        ><option value="en">{portalText(data.locale, 'English')}</option><option value="es"
          >{portalText(data.locale, 'Spanish')}</option
        ><option value="pt">{portalText(data.locale, 'Portuguese')}</option></select
      ></label
    ><button class="primary-button">{c.apply}</button>
  </form>
  <div id="supplier-report" class="supplier-report-results">
    {#if data.report}
      <h2>{data.report.project.name}</h2>
      <p>{data.from} — {data.to}</p>
      <strong>{c.totalHours}: {decimalHours(data.report.totalMinutes)}</strong>
      <nav>
        <a
          id="supplier-report-download"
          href={`${base}/app/supplier/report.csv?${query}`}
          onclick={downloadCsv}
          onauxclick={downloadCsv}>{c.download}</a
        ><button onclick={() => window.print()}>{c.print}</button>
      </nav>
      {#if csvProblem}
        <div bind:this={csvProblemContainer} class="csv-problem-container">
          <ProblemNotice problem={csvProblem} locale={data.locale} remedyLinks={csvRemedyLinks} />
        </div>
      {/if}
      <SectionCard title={c.report}>
        {#each data.report.rows as row}
          <article>
            <h3>{row.workerName} · {row.workDate}</h3>
            <dl>
              <dt>{c.category}</dt>
              <dd>{supplierCategoryLabel(data.locale, row.category)}</dd>
              {#if row.startTime && row.endTime}
                <dt>{c.interval}</dt>
                <dd>{row.startTime} – {row.endTime}</dd>
                <dt>{c.breakHours}</dt>
                <dd>{decimalHours(row.breakMinutes ?? 0)}</dd>
              {/if}
              <dt>{c.actualHours}</dt>
              <dd>{decimalHours(row.minutes)}</dd>
              <dt>{c.state}</dt>
              <dd>
                {supplierStateLabel(data.locale, row.state)}{#if row.isSuperseded}
                  · {c.superseded}{/if}
              </dd>
              <dt>{c.recordedBy}</dt>
              <dd>{row.recordedByName}</dd>
            </dl>
            <p>{row.summary}</p>
          </article>
        {:else}<p>{c.reportEmpty}</p>{/each}
      </SectionCard>
    {:else if !data.periodProblem && !data.projectProblem && !data.supplierProblem}<p>
        {c.reportEmpty}
      </p>{/if}
  </div>
</div>

<style>
  h1 {
    font-size: 1.65rem;
    font-weight: 700;
    line-height: 1.25;
  }
  .supplier-page {
    min-width: 0;
    display: grid;
    gap: 1rem;
  }
  .supplier-report-results {
    scroll-margin-top: 5rem;
  }
  .csv-problem-container :global([data-ui='problem-notice']) {
    scroll-margin-top: 5rem;
    scroll-margin-bottom: 6rem;
  }
  form {
    display: grid;
    gap: 1rem;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 14rem), 1fr));
    align-items: end;
  }
  label {
    display: grid;
    gap: 0.4rem;
    min-width: 0;
  }
  input,
  select {
    max-width: 100%;
    box-sizing: border-box;
  }
  nav {
    display: flex;
    gap: 1rem;
    align-items: center;
    flex-wrap: wrap;
  }
  a {
    padding: 0.65rem 0;
  }
  article {
    padding: 1rem 0;
    border-bottom: 1px solid #d4d3d0;
    break-inside: avoid;
    overflow-wrap: anywhere;
  }
  dl {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.4rem;
  }
  dd {
    margin: 0;
  }
  @media print {
    nav,
    form {
      display: none;
    }
    .supplier-page {
      padding: 0;
      max-width: none;
    }
  }
</style>
