<script lang="ts">
  import { base } from '$app/paths';

  type Value = string | number | boolean | null | undefined;
  type Report = Record<string, Value>;
  type HistoryRow = Record<string, Value>;

  let { data, form } = $props();
  const report = $derived(data.detail.report as Report);
  const history = $derived((data.detail.history ?? []) as HistoryRow[]);
  const isDaily = $derived(data.detail.type === 'daily');
  const display = (value: Value): string =>
    value === null || value === undefined ? '' : String(value);
  const checked = (value: Value): boolean => value === true || value === 1 || value === '1';
  const changedFields = (value: Value): string[] => {
    if (typeof value !== 'string') return [];
    try {
      const parsed = JSON.parse(value) as { changedFields?: unknown };
      return Array.isArray(parsed.changedFields)
        ? parsed.changedFields.filter((field): field is string => typeof field === 'string')
        : [];
    } catch {
      return [];
    }
  };
</script>

<svelte:head><title>{isDaily ? 'Daily report' : 'PLC report'} | J&A Automation</title></svelte:head>

<main class="record-detail-page report-detail-page">
  <nav class="detail-nav">
    <a href={base + '/app/reports'}>← Reports</a>
    <a href={base + '/app/projects/' + display(report.project_id)}>Open project</a>
  </nav>

  <header class="record-detail-header">
    <div>
      <span class="portal-kicker"
        >{isDaily ? 'DAILY FIELD REPORT' : 'PLC / TECHNICAL REPORT'} · SOURCE RECORD</span
      >
      <h1>{isDaily ? display(report.summary) : display(report.system_name)}</h1>
      <p>
        {display(report.project_number)} · {display(report.project_name)} ·
        {isDaily ? display(report.work_date) : display(report.created_at).slice(0, 10)} ·
        {display(report.author_name)}
      </p>
    </div>
    <div class="detail-status-stack">
      <span class="state-tag">{display(report.approval_state)}</span>
      {#if data.detail.locked}<small class="locked-note">Finalized source · read-only</small>{/if}
    </div>
  </header>

  {#if form?.message}
    <p class:success={form.success} class="action-message" role="status">{form.message}</p>
  {/if}

  {#if data.detail.canEdit && report.approval_state === 'needs_changes'}
    <section class="change-alert">
      <strong>This report needs changes before it can be approved.</strong>
      <span
        >Update the fields below and submit it again. The owner and admin team can see exactly what
        changed.</span
      >
    </section>
  {/if}

  {#if data.detail.canEdit}
    <section class="detail-panel report-edit-panel">
      <div class="panel-title">
        <div>
          <h2>Modify report</h2>
          <p class="form-help">Changes are versioned and notify the owner/admin review group.</p>
        </div>
        <span class="state-tag">v{display(report.version)}</span>
      </div>

      <form method="POST" action="?/updateReport" class="report-detail-form">
        <input type="hidden" name="id" value={report.id} />
        <input type="hidden" name="version" value={report.version} />
        <input type="hidden" name="type" value={data.detail.type} />
        <input type="hidden" name="projectId" value={report.project_id} />

        {#if isDaily}
          <div class="two-up">
            <label
              >Work date<input
                name="workDate"
                type="date"
                value={report.work_date}
                required
              /></label
            >
            <label>Site / shift<input name="siteShift" value={display(report.site_shift)} /></label>
          </div>
          <label
            >Shift summary<textarea name="summary" required>{display(report.summary)}</textarea
            ></label
          >
          <label
            >Tasks completed<textarea name="tasksCompleted" required
              >{display(report.tasks_completed)}</textarea
            ></label
          >
          <div class="two-up">
            <label
              >Problems found<textarea name="problemsFound"
                >{display(report.problems_found)}</textarea
              ></label
            >
            <label
              >Corrective actions<textarea name="correctiveActions"
                >{display(report.corrective_actions)}</textarea
              ></label
            >
          </div>
          <div class="two-up">
            <label
              >Client decisions<textarea name="clientDecisions"
                >{display(report.client_decisions)}</textarea
              ></label
            >
            <label
              >Open items<textarea name="openItems">{display(report.open_items)}</textarea></label
            >
          </div>
          <div class="two-up">
            <label
              >Downtime minutes<input
                name="downtimeMinutes"
                type="number"
                min="0"
                max="1440"
                value={report.downtime_minutes ?? 0}
              /></label
            >
            <label
              >Standby reason<input
                name="standbyReason"
                value={display(report.standby_reason)}
              /></label
            >
          </div>
          <div class="two-up">
            <label>Blockers<textarea name="blockers">{display(report.blockers)}</textarea></label>
            <label
              >Next-day plan<textarea name="nextDayPlan">{display(report.next_day_plan)}</textarea
              ></label
            >
          </div>
          <label
            >Customer contact<input
              name="customerContact"
              value={display(report.customer_contact)}
            /></label
          >
          <label class="check"
            ><input name="safetyRelated" type="checkbox" checked={checked(report.safety_related)} /> Safety-related</label
          >
        {:else}
          <div class="two-up">
            <label
              >System name<input
                name="systemName"
                value={display(report.system_name)}
                required
              /></label
            >
            <label>Plant / site<input name="plantSite" value={display(report.plant_site)} /></label>
          </div>
          <div class="two-up">
            <label>Area / line<input name="areaLine" value={display(report.area_line)} /></label>
            <label
              >Station / machine<input
                name="stationMachine"
                value={display(report.station_machine)}
              /></label
            >
          </div>
          <div class="three-up">
            <label>System type<input name="systemType" value={display(report.system_type)} /></label
            >
            <label
              >PLC platform<input name="plcPlatform" value={display(report.plc_platform)} /></label
            >
            <label>Controller<input name="controller" value={display(report.controller)} /></label>
          </div>
          <div class="three-up">
            <label>HMI / SCADA<input name="hmiScada" value={display(report.hmi_scada)} /></label>
            <label
              >Network protocol<input
                name="networkProtocol"
                value={display(report.network_protocol)}
              /></label
            >
            <label
              >Software version<input
                name="softwareVersion"
                value={display(report.software_version)}
              /></label
            >
          </div>
          <label
            >Program reference<input
              name="programReference"
              value={display(report.program_reference)}
            /></label
          >
          <label
            >Change summary<textarea name="changeSummary" required
              >{display(report.change_summary)}</textarea
            ></label
          >
          <label
            >Production impact<textarea name="productionImpact"
              >{display(report.production_impact)}</textarea
            ></label
          >
          <div class="two-up">
            <label
              >Validation<textarea name="validation">{display(report.validation)}</textarea></label
            >
            <label
              >Validation result<textarea name="validationResult"
                >{display(report.validation_result)}</textarea
              ></label
            >
          </div>
          <div class="two-up">
            <label
              >Open risk / issue<textarea name="openRisk">{display(report.open_risk)}</textarea
              ></label
            >
            <label
              >Rollback plan<textarea name="rollbackPlan">{display(report.rollback_plan)}</textarea
              ></label
            >
          </div>
          <label class="check"
            ><input name="safetyRelated" type="checkbox" checked={checked(report.safety_related)} /> Safety
            impact</label
          >
        {/if}
        <button>Save changes and notify reviewers</button>
      </form>
    </section>
  {/if}

  <section class="record-detail-grid report-summary-grid">
    <article>
      <span>PROJECT</span><strong>{display(report.project_number)}</strong><small
        >{display(report.project_name)}</small
      >
    </article>
    <article>
      <span>AUTHOR</span><strong>{display(report.author_name)}</strong><small
        >{display(report.author_email)}</small
      >
    </article>
    <article>
      <span>SAFETY</span><strong
        >{checked(report.safety_related) ? 'Review required' : 'No safety flag'}</strong
      ><small>Recorded with the source</small>
    </article>
    <article>
      <span>VERSION</span><strong>{display(report.version)}</strong><small
        >{display(report.updated_at)}</small
      >
    </article>
  </section>

  <section class="detail-panel report-history-panel">
    <div class="panel-title">
      <div>
        <h2>Change history</h2>
        <p class="form-help">Immutable audit trail for this source record.</p>
      </div>
      <span>{history.length} events</span>
    </div>
    {#each history as event}
      <article class="history-event">
        <div>
          <strong>{display(event.action).replaceAll('_', ' ')}</strong>
          <small
            >{display(event.actor_name) || 'System'} · {display(event.occurred_at)
              .replace('T', ' ')
              .slice(0, 19)}</small
          >
        </div>
        {#if changedFields(event.details_json).length > 0}
          <span class="change-summary">Changed: {changedFields(event.details_json).join(', ')}</span
          >
        {:else}
          <code>{display(event.details_json)}</code>
        {/if}
      </article>
    {:else}<p class="empty">No audit history recorded.</p>{/each}
  </section>

  {#if data.detail.canDelete}
    <section class="danger-zone">
      <div>
        <strong>Owner controls</strong>
        <p>
          Deleting removes this draft source record and records the action in the audit trail.
          Finalized reports cannot be deleted.
        </p>
      </div>
      <form
        method="POST"
        action="?/deleteReport"
        onsubmit={(event) => {
          if (!confirm('Delete this report? This cannot be undone.')) event.preventDefault();
        }}
      >
        <input type="hidden" name="id" value={report.id} />
        <input type="hidden" name="version" value={report.version} />
        <input type="hidden" name="type" value={data.detail.type} />
        <button class="danger-button">Delete report</button>
      </form>
    </section>
  {/if}
</main>
