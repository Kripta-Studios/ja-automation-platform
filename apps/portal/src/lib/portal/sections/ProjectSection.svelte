<script lang="ts">
  import { SectionCard, StatusBadge, TableRegion } from '../ui';
  import type { TableCardRow } from '../ui';
  import type { PortalRow } from '../portal-data';

  /**
   * Project-section actions are deliberately supplied by the route seam. The
   * section does not infer a transition, create route, or commercial policy.
   * For example, a lifecycle action may pass `fields: { status: 'closed' }`.
   * Values remain scalar so route-specific hidden inputs cannot carry nested
   * untrusted objects into a form submission.
   */
  export type ProjectLifecycleAction = {
    label: string;
    action: string;
    fields?: Readonly<Record<string, string | number>>;
    destructive?: boolean;
  };

  export type ProjectSectionCapabilities = {
    canCreateProject?: boolean;
    canTransitionProject?: boolean;
    canManageClients?: boolean;
  };

  export type ProjectSectionPrimaryAction = {
    label: string;
    href?: string;
    scope?: 'operational' | 'management';
    onactivate?: () => void;
  };

  type ProjectSectionProps = {
    base: string;
    projects: PortalRow[];
    clients?: PortalRow[];
    role?: string;
    capabilities?: ProjectSectionCapabilities;
    primaryAction?: ProjectSectionPrimaryAction;
    getProjectLifecycleActions?: (
      project: PortalRow,
    ) => readonly ProjectLifecycleAction[] | undefined;
    translate: (value: string) => string;
    controlledValue?: (domain: 'status', value: unknown) => string;
  };

  let {
    base,
    projects,
    clients = [],
    role = '',
    capabilities = {},
    primaryAction,
    getProjectLifecycleActions,
    translate,
    controlledValue,
  }: ProjectSectionProps = $props();

  let search = $state('');
  let statusFilter = $state('');

  const isOwnerOrFinance = $derived(role === 'owner_admin' || role === 'finance_admin');
  const canCreateProject = $derived(isOwnerOrFinance && capabilities.canCreateProject === true);
  const canTransitionProject = $derived(
    isOwnerOrFinance && capabilities.canTransitionProject === true,
  );
  const canManageClients = $derived(isOwnerOrFinance && capabilities.canManageClients === true);
  const normalizedSearch = $derived(search.trim().toLowerCase());

  function value(row: PortalRow, ...keys: string[]): string {
    for (const key of keys) {
      const candidate = row[key];
      if (candidate !== null && candidate !== undefined && String(candidate).trim()) {
        return String(candidate);
      }
    }
    return '';
  }

  function projectId(row: PortalRow): string {
    return value(row, 'id', 'project_id');
  }

  function projectName(row: PortalRow): string {
    return value(row, 'name', 'project_name') || translate('Unnamed project');
  }

  function projectNumber(row: PortalRow): string {
    return value(row, 'project_number', 'projectNumber') || translate('No project number');
  }

  function projectStatus(row: PortalRow): string {
    return value(row, 'status') || 'active';
  }

  function statusLabel(status: string): string {
    return controlledValue?.('status', status) || translate(status);
  }

  function statusVariant(status: string): 'success' | 'warning' | 'danger' | 'info' | 'neutral' {
    switch (status) {
      case 'active':
        return 'success';
      case 'planned':
        return 'info';
      case 'paused':
      case 'closing':
        return 'warning';
      case 'closed':
      case 'archived':
        return 'neutral';
      default:
        return 'neutral';
    }
  }

  function clientLabel(row: PortalRow): string {
    return value(row, 'client_display_name', 'client_name', 'client_number');
  }

  function projectReference(row: PortalRow): string {
    return value(row, 'cost_center', 'project_cost_center', 'po_reference');
  }

  function projectSchedule(row: PortalRow): string {
    const start = value(row, 'start_date', 'planned_start_date');
    const end = value(row, 'planned_end_date', 'end_date');
    const timezone = value(row, 'timezone', 'site_timezone');
    const dates = start || end ? `${start || '—'} → ${end || translate('Open target')}` : '';
    return [dates, timezone].filter(Boolean).join(' · ');
  }

  const visibleProjects = $derived.by(() => {
    return (projects ?? []).filter((project) => {
      const searchable = [
        projectNumber(project),
        projectName(project),
        clientLabel(project),
        projectReference(project),
      ]
        .join(' ')
        .toLowerCase();
      const matchesSearch = !normalizedSearch || searchable.includes(normalizedSearch);
      const matchesStatus = !statusFilter || projectStatus(project) === statusFilter;
      return matchesSearch && matchesStatus;
    });
  });

  const activeCount = $derived(
    (projects ?? []).filter((project) => projectStatus(project) === 'active').length,
  );
  const plannedCount = $derived(
    (projects ?? []).filter((project) => projectStatus(project) === 'planned').length,
  );
  const attentionCount = $derived(
    (projects ?? []).filter((project) => ['paused', 'closing'].includes(projectStatus(project)))
      .length,
  );

  const projectCardRows = $derived.by((): TableCardRow[] =>
    visibleProjects.map((project) => ({
      id: projectId(project),
      cells: [
        {
          label: translate('Project'),
          value: `${projectNumber(project)} · ${projectName(project)}`,
        },
        { label: translate('Client'), value: clientLabel(project) || translate('Not assigned') },
        { label: translate('Status'), value: statusLabel(projectStatus(project)) },
        {
          label: translate('Schedule'),
          value: projectSchedule(project) || translate('Not scheduled'),
        },
      ],
    })),
  );

  const showPrimaryAction = $derived(
    Boolean(
      primaryAction &&
      (primaryAction.href || primaryAction.onactivate) &&
      (primaryAction.scope !== 'management' || isOwnerOrFinance) &&
      (primaryAction.scope !== 'management' || canCreateProject),
    ),
  );

  function projectHref(row: PortalRow): string {
    return `${base}/app/projects/${encodeURIComponent(projectId(row))}`;
  }

  function lifecycleActions(row: PortalRow): readonly ProjectLifecycleAction[] {
    return getProjectLifecycleActions?.(row) ?? [];
  }

  function lifecycleFields(action: ProjectLifecycleAction): Array<[string, string | number]> {
    const entries = Object.entries(action.fields ?? {}) as Array<[string, unknown]>;
    return entries.filter((entry): entry is [string, string | number] => {
      const [name, fieldValue] = entry;
      return (
        /^[A-Za-z][A-Za-z0-9_-]*$/.test(name) &&
        (typeof fieldValue === 'string' ||
          (typeof fieldValue === 'number' && Number.isFinite(fieldValue)))
      );
    });
  }

  function activatePrimaryAction(): void {
    primaryAction?.onactivate?.();
  }
</script>

<div class="project-section" data-ui="project-section">
  <header class="project-section__context">
    <div>
      <p class="project-section__eyebrow">{translate('Project workspace')}</p>
      <h2>{translate('Projects')}</h2>
      <p>{translate('Review project identity, status, schedule and operational scope.')}</p>
    </div>
  </header>

  <div class="project-section__attention" aria-label={translate('Project attention summary')}>
    <div class="project-section__attention-card">
      <span>{translate('Active')}</span>
      <strong>{activeCount}</strong>
      <small>{translate('Operational projects')}</small>
    </div>
    <div class="project-section__attention-card">
      <span>{translate('Planned')}</span>
      <strong>{plannedCount}</strong>
      <small>{translate('Preparing to start')}</small>
    </div>
    <div class="project-section__attention-card project-section__attention-card--notice">
      <span>{translate('Needs attention')}</span>
      <strong>{attentionCount}</strong>
      <small>{translate('Paused or closing')}</small>
    </div>
  </div>

  <form
    class="project-section__filters"
    aria-label={translate('Filter projects')}
    onsubmit={(event) => event.preventDefault()}
  >
    <label>
      <span>{translate('Search projects')}</span>
      <input
        bind:value={search}
        type="search"
        placeholder={translate('Project, client or reference')}
      />
    </label>
    <label>
      <span>{translate('Status')}</span>
      <select bind:value={statusFilter}>
        <option value="">{translate('All statuses')}</option>
        <option value="active">{translate('Active')}</option>
        <option value="planned">{translate('Planned')}</option>
        <option value="paused">{translate('Paused')}</option>
        <option value="closing">{translate('Closing')}</option>
        <option value="closed">{translate('Closed')}</option>
        <option value="archived">{translate('Archived')}</option>
      </select>
    </label>
  </form>

  <SectionCard title={translate('Authorized projects')} class="project-section__list-surface">
    <TableRegion
      ariaLabel={translate('Authorized projects list')}
      mobileMode="cards"
      cardRows={projectCardRows}
    >
      <table class="project-section__table">
        <caption class="sr-only">{translate('Authorized projects')}</caption>
        <thead>
          <tr>
            <th scope="col">{translate('Project')}</th>
            <th scope="col">{translate('Client')}</th>
            <th scope="col">{translate('Status')}</th>
            <th scope="col">{translate('Schedule')}</th>
            {#if canTransitionProject}<th scope="col">{translate('Actions')}</th>{/if}
          </tr>
        </thead>
        <tbody>
          {#each visibleProjects as project}
            {@const status = projectStatus(project)}
            {@const actions = lifecycleActions(project)}
            <tr data-project-row={projectId(project)}>
              <td>
                {#if projectId(project)}
                  <a class="project-section__project-link" href={projectHref(project)}>
                    <strong>{projectNumber(project)}</strong>
                    <span>{projectName(project)}</span>
                  </a>
                {:else}
                  <strong>{projectNumber(project)}</strong>
                  <span>{projectName(project)}</span>
                {/if}
              </td>
              <td>
                <span>{clientLabel(project) || translate('Not assigned')}</span>
                {#if projectReference(project)}<small>{projectReference(project)}</small>{/if}
              </td>
              <td>
                <StatusBadge variant={statusVariant(status)} text={statusLabel(status)} />
              </td>
              <td>{projectSchedule(project) || translate('Not scheduled')}</td>
              {#if canTransitionProject}
                <td>
                  {#if actions.length > 0}
                    <details class="project-section__actions">
                      <summary>{translate('Actions')}</summary>
                      <div>
                        {#each actions as action}
                          <form method="POST" action={action.action}>
                            <input type="hidden" name="projectId" value={projectId(project)} />
                            <input
                              type="hidden"
                              name="version"
                              value={value(project, 'version') || '1'}
                            />
                            {#each lifecycleFields(action) as [name, fieldValue]}
                              <input type="hidden" {name} value={String(fieldValue)} />
                            {/each}
                            <label>
                              <span>{translate('Reason')}</span>
                              <input name="reason" required />
                            </label>
                            <button
                              class={action.destructive ? 'danger' : 'secondary-button'}
                              type="submit"
                            >
                              {action.label}
                            </button>
                          </form>
                        {/each}
                      </div>
                    </details>
                  {/if}
                </td>
              {/if}
            </tr>
          {:else}
            <tr>
              <td colspan={canTransitionProject ? 5 : 4}>
                <div class="project-section__empty">
                  <strong>{translate('No projects found')}</strong>
                  <span>{translate('Try another filter or add an authorized project.')}</span>
                </div>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </TableRegion>
  </SectionCard>

  {#if showPrimaryAction && primaryAction}
    <div class="project-section__post-list-action">
      {#if primaryAction.href}
        <a class="primary-button project-section__primary" href={primaryAction.href}>
          {primaryAction.label}
        </a>
      {:else}
        <button
          class="primary-button project-section__primary"
          type="button"
          onclick={activatePrimaryAction}
        >
          {primaryAction.label}
        </button>
      {/if}
    </div>
  {/if}

  {#if canManageClients && clients.length > 0}
    <SectionCard title={translate('Clients')} class="project-section__client-surface">
      <div class="project-section__clients" data-client-directory>
        {#each clients as client}
          <article
            class="project-section__client"
            data-client-id={value(client, 'id', 'client_id')}
          >
            <div>
              <strong>{value(client, 'client_number') || translate('No client number')}</strong>
              <span
                >{value(client, 'display_name', 'legal_name') || translate('Unnamed client')}</span
              >
            </div>
            <StatusBadge
              variant={statusVariant(value(client, 'status') || 'active')}
              text={statusLabel(value(client, 'status') || 'active')}
            />
          </article>
        {/each}
      </div>
    </SectionCard>
  {/if}
</div>

<style>
  .project-section {
    display: grid;
    gap: 1.25rem;
  }

  .project-section__context {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 1rem;
    padding-block: 0.25rem;
  }

  .project-section__eyebrow {
    margin: 0 0 0.35rem;
    color: var(--portal-muted, #64748b);
    font-size: 0.72rem;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }

  .project-section__context h2 {
    margin: 0;
    color: var(--portal-ink, #16202a);
    font-size: clamp(1.55rem, 2vw, 2rem);
    letter-spacing: -0.025em;
  }

  .project-section__context p:last-child {
    max-width: 42rem;
    margin: 0.4rem 0 0;
    color: var(--portal-muted, #64748b);
  }

  .project-section__primary {
    flex: 0 0 auto;
    min-height: 2.75rem;
  }

  .project-section__post-list-action {
    display: flex;
    justify-content: flex-end;
  }

  .project-section__attention {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 0.75rem;
  }

  .project-section__attention-card {
    display: grid;
    gap: 0.22rem;
    min-height: 6rem;
    padding: 0.9rem 1rem;
    border: 1px solid var(--portal-border, #d7dee8);
    border-radius: 0.75rem;
    background: var(--portal-surface, #fff);
  }

  .project-section__attention-card--notice {
    border-color: color-mix(
      in srgb,
      var(--portal-warning, #b7791f) 38%,
      var(--portal-border, #d7dee8)
    );
  }

  .project-section__attention-card span,
  .project-section__attention-card small {
    color: var(--portal-muted, #64748b);
    font-size: 0.8rem;
  }

  .project-section__attention-card strong {
    color: var(--portal-ink, #16202a);
    font-size: 1.45rem;
    font-variant-numeric: tabular-nums;
  }

  .project-section__filters {
    display: grid;
    grid-template-columns: minmax(16rem, 2fr) minmax(12rem, 1fr);
    gap: 0.75rem;
    padding: 0.9rem 1rem;
    border: 1px solid var(--portal-border, #d7dee8);
    border-radius: 0.75rem;
    background: color-mix(in srgb, var(--portal-surface, #fff) 92%, var(--portal-wash, #eef2f5));
  }

  .project-section__filters label,
  .project-section__actions label {
    display: grid;
    gap: 0.35rem;
    color: var(--portal-muted, #64748b);
    font-size: 0.78rem;
    font-weight: 650;
  }

  .project-section__filters input,
  .project-section__filters select,
  .project-section__actions input {
    min-height: 2.6rem;
    padding: 0.55rem 0.7rem;
    border: 1px solid var(--portal-border-strong, #b8c3d1);
    border-radius: 0.5rem;
    background: var(--portal-surface, #fff);
    color: var(--portal-ink, #16202a);
    font: inherit;
  }

  .project-section__table {
    width: 100%;
    border-collapse: collapse;
  }

  .project-section__table th,
  .project-section__table td {
    padding: 0.85rem 0.75rem;
    border-bottom: 1px solid var(--portal-border, #d7dee8);
    text-align: left;
    vertical-align: top;
  }

  .project-section__table th {
    color: var(--portal-muted, #64748b);
    font-size: 0.72rem;
    letter-spacing: 0.07em;
    text-transform: uppercase;
  }

  .project-section__table td {
    color: var(--portal-ink, #16202a);
    font-size: 0.9rem;
  }

  .project-section__table td > span,
  .project-section__table td > small,
  .project-section__project-link {
    display: grid;
    gap: 0.2rem;
  }

  .project-section__table td > small {
    margin-top: 0.25rem;
    color: var(--portal-muted, #64748b);
  }

  .project-section__project-link {
    color: var(--portal-ink, #16202a);
    text-decoration: none;
  }

  .project-section__project-link strong {
    color: var(--portal-accent, #0f5f73);
  }

  .project-section__project-link:focus-visible,
  .project-section__actions summary:focus-visible,
  .project-section__filters input:focus-visible,
  .project-section__filters select:focus-visible,
  .project-section__actions input:focus-visible,
  .project-section__actions button:focus-visible {
    outline: 3px solid color-mix(in srgb, var(--portal-accent, #0f5f73) 32%, transparent);
    outline-offset: 2px;
  }

  .project-section__actions {
    position: relative;
    min-width: 9rem;
  }

  .project-section__actions summary {
    width: fit-content;
    padding: 0.5rem 0.65rem;
    border: 1px solid var(--portal-border-strong, #b8c3d1);
    border-radius: 0.45rem;
    color: var(--portal-ink, #16202a);
    cursor: pointer;
    font-size: 0.82rem;
    font-weight: 700;
    list-style: none;
  }

  .project-section__actions summary::-webkit-details-marker {
    display: none;
  }

  .project-section__actions > div {
    display: grid;
    gap: 0.7rem;
    min-width: 15rem;
    margin-top: 0.5rem;
    padding: 0.75rem;
    border: 1px solid var(--portal-border, #d7dee8);
    border-radius: 0.6rem;
    background: var(--portal-surface, #fff);
    box-shadow: 0 0.4rem 1.2rem rgb(15 23 42 / 9%);
  }

  .project-section__actions form {
    display: grid;
    gap: 0.5rem;
  }

  .project-section__actions button {
    min-height: 2.5rem;
  }

  .project-section__empty span {
    color: var(--portal-muted, #64748b);
  }

  .project-section__empty {
    display: grid;
    gap: 0.3rem;
    padding: 1.25rem 0.5rem;
    text-align: center;
  }

  .project-section__clients {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr));
    gap: 0.75rem;
  }

  .project-section__client {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 0.75rem;
    padding: 0.9rem;
    border: 1px solid var(--portal-border, #d7dee8);
    border-radius: 0.6rem;
  }

  .project-section__client > div {
    display: grid;
    gap: 0.2rem;
  }

  .project-section__client span {
    color: var(--portal-muted, #64748b);
  }

  @media (max-width: 52rem) {
    .project-section__context {
      align-items: flex-start;
      flex-direction: column;
    }

    .project-section__primary {
      width: 100%;
    }

    .project-section__post-list-action {
      justify-content: stretch;
    }

    .project-section__filters {
      grid-template-columns: 1fr;
    }
  }

  @media (max-width: 36rem) {
    .project-section__attention {
      grid-template-columns: 1fr;
    }

    .project-section__attention-card {
      min-height: auto;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .project-section * {
      scroll-behavior: auto;
    }
  }
</style>
