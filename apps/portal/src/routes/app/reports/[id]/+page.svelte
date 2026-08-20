<script lang="ts">
  import { base } from '$app/paths';
  import { ActionBar, Field, FieldGroup, FormCard, FormSection, SectionCard } from '$lib/portal/ui';
  import formValidation from '$lib/portal/ui/form-validation';

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
  <nav class="detail-nav" aria-label="Report navigation">
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
    <p class:success={form.success} class="action-message" role="status" aria-live="polite">
      {form.message}
    </p>
  {/if}

  {#if data.detail.canEdit && report.approval_state === 'needs_changes'}
    <section class="change-alert" aria-labelledby="report-change-alert-title">
      <strong id="report-change-alert-title"
        >This report needs changes before it can be approved.</strong
      >
      <span
        >Update the fields below and submit it again. The owner and admin team can see exactly what
        changed.</span
      >
    </section>
  {/if}

  {#if data.detail.canEdit}
    <FormCard
      title="Modify report"
      headingId="modify-report-title"
      class="report-edit-panel"
      data-report-edit
    >
      <div class="report-form-intro">
        <p class="form-help" id="modify-report-help">
          Changes are versioned and notify the owner/admin review group.
        </p>
        <span class="state-tag" aria-label={`Report version ${display(report.version)}`}
          >v{display(report.version)}</span
        >
      </div>

      <form
        method="POST"
        action="?/updateReport"
        class="report-detail-form"
        id="modify-report-form"
        data-form="modify-report"
        aria-describedby="modify-report-help"
        use:formValidation
      >
        <input id="report-id" type="hidden" name="id" value={report.id} />
        <input id="report-version" type="hidden" name="version" value={report.version} />
        <input id="report-type" type="hidden" name="type" value={data.detail.type} />
        <input id="report-project-id" type="hidden" name="projectId" value={report.project_id} />

        {#if isDaily}
          <FormSection
            title="Shift"
            description="Set the field date and the shift context for this source record."
          >
            <FieldGroup columns="2">
              <Field id="report-work-date" label="Work date" required data-field="workDate">
                <input
                  id="report-work-date"
                  data-field="workDate"
                  name="workDate"
                  type="date"
                  value={report.work_date}
                  required
                />
              </Field>
              <Field id="report-site-shift" label="Site / shift" data-field="siteShift">
                <input
                  id="report-site-shift"
                  data-field="siteShift"
                  name="siteShift"
                  value={display(report.site_shift)}
                />
              </Field>
            </FieldGroup>
          </FormSection>

          <FormSection
            title="Work performed"
            description="Record the work completed during this shift."
          >
            <Field id="report-summary" label="Shift summary" required data-field="summary">
              <textarea
                id="report-summary"
                data-field="summary"
                name="summary"
                required
                value={display(report.summary)}
              ></textarea>
            </Field>
            <Field
              id="report-tasks-completed"
              label="Tasks completed"
              required
              data-field="tasksCompleted"
            >
              <textarea
                id="report-tasks-completed"
                data-field="tasksCompleted"
                name="tasksCompleted"
                required
                value={display(report.tasks_completed)}
              ></textarea>
            </Field>
          </FormSection>

          <FormSection
            title="Issues / decisions"
            description="Capture problems, corrective action, customer decisions, and blockers."
          >
            <FieldGroup columns="2">
              <Field id="report-problems-found" label="Problems found" data-field="problemsFound">
                <textarea
                  id="report-problems-found"
                  data-field="problemsFound"
                  name="problemsFound"
                  value={display(report.problems_found)}
                ></textarea>
              </Field>
              <Field
                id="report-corrective-actions"
                label="Corrective actions"
                data-field="correctiveActions"
              >
                <textarea
                  id="report-corrective-actions"
                  data-field="correctiveActions"
                  name="correctiveActions"
                  value={display(report.corrective_actions)}
                ></textarea>
              </Field>
              <Field
                id="report-client-decisions"
                label="Client decisions"
                data-field="clientDecisions"
              >
                <textarea
                  id="report-client-decisions"
                  data-field="clientDecisions"
                  name="clientDecisions"
                  value={display(report.client_decisions)}
                ></textarea>
              </Field>
              <Field id="report-open-items" label="Open items" data-field="openItems">
                <textarea
                  id="report-open-items"
                  data-field="openItems"
                  name="openItems"
                  value={display(report.open_items)}
                ></textarea>
              </Field>
              <Field
                id="report-downtime-minutes"
                label="Downtime minutes"
                data-field="downtimeMinutes"
              >
                <input
                  id="report-downtime-minutes"
                  data-field="downtimeMinutes"
                  name="downtimeMinutes"
                  type="number"
                  min="0"
                  max="1440"
                  value={report.downtime_minutes ?? 0}
                />
              </Field>
              <Field id="report-standby-reason" label="Standby reason" data-field="standbyReason">
                <input
                  id="report-standby-reason"
                  data-field="standbyReason"
                  name="standbyReason"
                  value={display(report.standby_reason)}
                />
              </Field>
              <Field id="report-blockers" label="Blockers" data-field="blockers">
                <textarea
                  id="report-blockers"
                  data-field="blockers"
                  name="blockers"
                  value={display(report.blockers)}
                ></textarea>
              </Field>
            </FieldGroup>
          </FormSection>

          <FormSection
            title="Next steps"
            description="Leave the handover context needed for the next shift and review."
          >
            <FieldGroup columns="2">
              <Field id="report-next-day-plan" label="Next-day plan" data-field="nextDayPlan">
                <textarea
                  id="report-next-day-plan"
                  data-field="nextDayPlan"
                  name="nextDayPlan"
                  value={display(report.next_day_plan)}
                ></textarea>
              </Field>
              <Field
                id="report-customer-contact"
                label="Customer contact"
                data-field="customerContact"
              >
                <input
                  id="report-customer-contact"
                  data-field="customerContact"
                  name="customerContact"
                  value={display(report.customer_contact)}
                />
              </Field>
            </FieldGroup>
            <Field id="report-safety-related" label="Safety-related" data-field="safetyRelated">
              <input
                id="report-safety-related"
                data-field="safetyRelated"
                name="safetyRelated"
                type="checkbox"
                checked={checked(report.safety_related)}
              />
            </Field>
          </FormSection>
        {:else}
          <FormSection
            title="Equipment"
            description="Identify the plant, line, station, and automation equipment involved."
          >
            <FieldGroup columns="2">
              <Field id="report-system-name" label="System name" required data-field="systemName">
                <input
                  id="report-system-name"
                  data-field="systemName"
                  name="systemName"
                  value={display(report.system_name)}
                  required
                />
              </Field>
              <Field id="report-plant-site" label="Plant / site" data-field="plantSite">
                <input
                  id="report-plant-site"
                  data-field="plantSite"
                  name="plantSite"
                  value={display(report.plant_site)}
                />
              </Field>
              <Field id="report-area-line" label="Area / line" data-field="areaLine">
                <input
                  id="report-area-line"
                  data-field="areaLine"
                  name="areaLine"
                  value={display(report.area_line)}
                />
              </Field>
              <Field
                id="report-station-machine"
                label="Station / machine"
                data-field="stationMachine"
              >
                <input
                  id="report-station-machine"
                  data-field="stationMachine"
                  name="stationMachine"
                  value={display(report.station_machine)}
                />
              </Field>
            </FieldGroup>
            <FieldGroup columns="3">
              <Field id="report-system-type" label="System type" data-field="systemType">
                <input
                  id="report-system-type"
                  data-field="systemType"
                  name="systemType"
                  value={display(report.system_type)}
                />
              </Field>
              <Field id="report-plc-platform" label="PLC platform" data-field="plcPlatform">
                <input
                  id="report-plc-platform"
                  data-field="plcPlatform"
                  name="plcPlatform"
                  value={display(report.plc_platform)}
                />
              </Field>
              <Field id="report-controller" label="Controller" data-field="controller">
                <input
                  id="report-controller"
                  data-field="controller"
                  name="controller"
                  value={display(report.controller)}
                />
              </Field>
              <Field id="report-hmi-scada" label="HMI / SCADA" data-field="hmiScada">
                <input
                  id="report-hmi-scada"
                  data-field="hmiScada"
                  name="hmiScada"
                  value={display(report.hmi_scada)}
                />
              </Field>
              <Field
                id="report-network-protocol"
                label="Network protocol"
                data-field="networkProtocol"
              >
                <input
                  id="report-network-protocol"
                  data-field="networkProtocol"
                  name="networkProtocol"
                  value={display(report.network_protocol)}
                />
              </Field>
              <Field
                id="report-software-version"
                label="Software version"
                data-field="softwareVersion"
              >
                <input
                  id="report-software-version"
                  data-field="softwareVersion"
                  name="softwareVersion"
                  value={display(report.software_version)}
                />
              </Field>
            </FieldGroup>
          </FormSection>

          <FormSection
            title="Change"
            description="Describe the technical change and its production impact."
          >
            <Field
              id="report-program-reference"
              label="Program reference"
              data-field="programReference"
            >
              <input
                id="report-program-reference"
                data-field="programReference"
                name="programReference"
                value={display(report.program_reference)}
              />
            </Field>
            <Field
              id="report-change-summary"
              label="Change summary"
              required
              data-field="changeSummary"
            >
              <textarea
                id="report-change-summary"
                data-field="changeSummary"
                name="changeSummary"
                required
                value={display(report.change_summary)}
              ></textarea>
            </Field>
            <Field
              id="report-production-impact"
              label="Production impact"
              data-field="productionImpact"
            >
              <textarea
                id="report-production-impact"
                data-field="productionImpact"
                name="productionImpact"
                value={display(report.production_impact)}
              ></textarea>
            </Field>
          </FormSection>

          <FormSection
            title="Validation / risk"
            description="Record validation performed, results, open risk, and rollback information."
          >
            <FieldGroup columns="2">
              <Field id="report-validation" label="Validation" data-field="validation">
                <textarea
                  id="report-validation"
                  data-field="validation"
                  name="validation"
                  value={display(report.validation)}
                ></textarea>
              </Field>
              <Field
                id="report-validation-result"
                label="Validation result"
                data-field="validationResult"
              >
                <textarea
                  id="report-validation-result"
                  data-field="validationResult"
                  name="validationResult"
                  value={display(report.validation_result)}
                ></textarea>
              </Field>
              <Field id="report-open-risk" label="Open risk / issue" data-field="openRisk">
                <textarea
                  id="report-open-risk"
                  data-field="openRisk"
                  name="openRisk"
                  value={display(report.open_risk)}
                ></textarea>
              </Field>
              <Field id="report-rollback-plan" label="Rollback plan" data-field="rollbackPlan">
                <textarea
                  id="report-rollback-plan"
                  data-field="rollbackPlan"
                  name="rollbackPlan"
                  value={display(report.rollback_plan)}
                ></textarea>
              </Field>
            </FieldGroup>
          </FormSection>

          <FormSection title="Safety" description="Flag changes that require safety-impact review.">
            <Field
              id="report-technical-safety-related"
              label="Safety impact"
              data-field="safetyRelated"
            >
              <input
                id="report-technical-safety-related"
                data-field="safetyRelated"
                name="safetyRelated"
                type="checkbox"
                checked={checked(report.safety_related)}
              />
            </Field>
          </FormSection>
        {/if}

        <ActionBar class="report-form-actions">
          <a class="secondary-action" href={base + '/app/reports'}>Cancel</a>
          <button type="submit">Save changes and notify reviewers</button>
        </ActionBar>
      </form>
    </FormCard>
  {/if}

  <SectionCard title="Report summary" headingId="report-summary-title" class="report-summary-panel">
    <div class="record-detail-grid report-summary-grid">
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
    </div>
  </SectionCard>

  <SectionCard
    title="Change history"
    headingId="change-history-title"
    class="report-history-panel"
    data-history-panel
  >
    <div class="report-history-intro">
      <p class="form-help">Immutable audit trail for this source record.</p>
      <span class="history-count">{history.length} events</span>
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
  </SectionCard>

  {#if data.detail.canDelete}
    <section class="danger-zone" aria-labelledby="owner-controls-title">
      <div>
        <h2 id="owner-controls-title">Owner controls</h2>
        <p id="delete-report-warning">
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
        <button class="danger-button" type="submit" aria-describedby="delete-report-warning">
          Delete report
        </button>
      </form>
    </section>
  {/if}
</main>
