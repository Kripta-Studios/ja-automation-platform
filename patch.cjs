const fs = require('fs');
const path = require('path');

const file = path.join('apps', 'portal', 'src', 'lib', 'PortalShell.svelte');
let content = fs.readFileSync(file, 'utf8');

// Add imports
if (!content.includes('import { FormCard, FormSection, FieldGroup, Field }')) {
  content = content.replace(
    `import PortalChrome from './PortalChrome.svelte';`,
    `import PortalChrome from './PortalChrome.svelte';\n  import { FormCard, FormSection, FieldGroup, Field } from './portal/ui';`
  );
}

// Replace the finance section
const financeStartIdx = content.indexOf('<section class="record-list full">\n        <div class="panel-title">\n          <div>\n            <h2>Finance configuration</h2>');
const financeEndIdx = content.indexOf('</section>\n      <section class="record-list full economics-list">');

if (financeStartIdx !== -1 && financeEndIdx !== -1) {
  const newFinanceSection = `<FormCard title="Finance configuration" class="finance-config-panel">
        <div class="panel-title">
          <div>
            <h2>Finance configuration</h2>
            <p>
              Rates are effective-dated and resolved by assignment, category, activity, and project
              scope.
            </p>
          </div>
          <span>Exact minor units</span>
        </div>
        {#if !isAuditor}<div class="management-stack compact-stack">
            <FormSection title="Worker compensation">
              <form method="POST" action="?/createCompensationRule" class="admin-form-grid">
                <FieldGroup columns="2">
                  <Field id="finance-comp-worker" label="Worker" required data-field="workerId">
                    <select id="finance-comp-worker" name="workerId" required>
                      <option value="">Select worker</option>
                      {#each data.workers ?? [] as worker}
                        <option value={worker.id}>{worker.name} · {worker.role}</option>
                      {/each}
                    </select>
                  </Field>
                  <Field id="finance-comp-project" label="Project scope" data-field="projectId">
                    <select id="finance-comp-project" name="projectId">
                      <option value="">Global</option>
                      {#each availableProjects as project}
                        <option value={project.id} selected={project.id === data.selectedProjectId}>{project.project_number}</option>
                      {/each}
                    </select>
                  </Field>
                  <Field id="finance-comp-currency" label="Currency" data-field="currency">
                    <select id="finance-comp-currency" name="currency">
                      <option>USD</option><option>BRL</option><option>EUR</option>
                    </select>
                  </Field>
                  <Field id="finance-comp-ruletype" label="Rule type" data-field="ruleType">
                    <select id="finance-comp-ruletype" name="ruleType">
                      <option value="Hourly">Hourly</option>
                      <option value="Daily">Daily</option>
                      <option value="FixedPerBillingPeriod">Fixed per billing period</option>
                      <option value="FixedProjectAmount">Fixed project amount</option>
                      <option value="PercentageOfEligibleClientLabor">Percentage of eligible client labor</option>
                      <option value="CustomApprovedAdjustment">Custom approved adjustment</option>
                    </select>
                  </Field>
                  <Field id="finance-comp-rate" label="Rate (minor units)" required data-field="rateMinor">
                    <input id="finance-comp-rate" name="rateMinor" type="number" min="0" value="0" required />
                  </Field>
                  <Field id="finance-comp-ratebasis" label="Rate basis" data-field="rateBasis">
                    <select id="finance-comp-ratebasis" name="rateBasis">
                      <option value="hourly">Hourly</option>
                      <option value="daily">Daily</option>
                    </select>
                  </Field>
                  <Field id="finance-comp-percentage" label="Percentage (basis points)" data-field="percentageBps">
                    <input id="finance-comp-percentage" name="percentageBps" type="number" min="0" max="10000" placeholder="e.g. 5500 = 55%" />
                  </Field>
                  <Field id="finance-comp-percentagebasis" label="Percentage basis" data-field="percentageBasis">
                    <select id="finance-comp-percentagebasis" name="percentageBasis">
                      <option value="CLIENT_LABOR_BEFORE_TAX">Client labor before tax</option>
                      <option value="CLIENT_LABOR_AFTER_APPROVED_DISCOUNT">Client labor after approved discount</option>
                      <option value="ISSUED_ELIGIBLE_LABOR">Issued eligible labor</option>
                      <option value="COLLECTED_ELIGIBLE_LABOR">Collected eligible labor</option>
                    </select>
                  </Field>
                  <Field id="finance-comp-trigger" label="Settlement trigger" data-field="settlementTrigger">
                    <select id="finance-comp-trigger" name="settlementTrigger">
                      <option value="ON_APPROVED_BILLABLE_LABOR">Approved billable labor</option>
                      <option value="ON_INVOICE_ISSUE">Invoice issue</option>
                      <option value="ON_CLIENT_PAYMENT">Client payment</option>
                    </select>
                  </Field>
                  <Field id="finance-comp-daily" label="Daily guarantee (minutes)" data-field="dailyGuaranteeMinutes">
                    <input id="finance-comp-daily" name="dailyGuaranteeMinutes" type="number" min="0" max="1440" />
                  </Field>
                  <Field id="finance-comp-effective" label="Effective from" required data-field="effectiveFrom">
                    <input id="finance-comp-effective" name="effectiveFrom" type="date" required />
                  </Field>
                </FieldGroup>
                <div class="form-actions">
                  <button>Save compensation rule</button>
                </div>
              </form>
            </FormSection>

            <FormSection title="Client labor rate">
              <form method="POST" action="?/createClientLaborRate" class="admin-form-grid">
                <input type="hidden" name="projectId" value={data.selectedProjectId} />
                <FieldGroup columns="2">
                  <Field id="finance-client-worker" label="Worker scope" data-field="workerId">
                    <select id="finance-client-worker" name="workerId">
                      <option value="">All assigned workers</option>
                      {#each data.workers ?? [] as worker}
                        <option value={worker.id}>{worker.name}</option>
                      {/each}
                    </select>
                  </Field>
                  <Field id="finance-client-category" label="Time category" data-field="category">
                    <input id="finance-client-category" name="category" placeholder="regular, overtime, travel" />
                  </Field>
                  <Field id="finance-client-currency" label="Currency" data-field="currency">
                    <select id="finance-client-currency" name="currency">
                      <option>USD</option><option>BRL</option><option>EUR</option>
                    </select>
                  </Field>
                  <Field id="finance-client-rate" label="Hourly rate (minor units)" required data-field="hourlyRateMinor">
                    <input id="finance-client-rate" name="hourlyRateMinor" type="number" min="0" required />
                  </Field>
                  <Field id="finance-client-overtime" label="Overtime method" data-field="overtimeMethod">
                    <select id="finance-client-overtime" name="overtimeMethod">
                      <option value="BASE_RATE_MULTIPLIER">Base rate multiplier</option>
                      <option value="NONE">None</option>
                      <option value="FIXED_RATE">Fixed rate</option>
                      <option value="FIXED_ADDITION_PER_HOUR">Fixed addition per hour</option>
                      <option value="PERCENTAGE_OF_ELIGIBLE_CLIENT_OVERTIME">Percentage of eligible overtime</option>
                    </select>
                  </Field>
                  <Field id="finance-client-overtimemult" label="Overtime multiplier (bps)" data-field="overtimeMultiplierBps">
                    <input id="finance-client-overtimemult" name="overtimeMultiplierBps" type="number" min="0" value="15000" />
                  </Field>
                  <Field id="finance-client-effective" label="Effective from" required data-field="effectiveFrom">
                    <input id="finance-client-effective" name="effectiveFrom" type="date" required />
                  </Field>
                  <Field id="finance-client-eligible" label="Percentage compensation" data-field="eligibleForPercentage">
                    <label class="check">
                      <input id="finance-client-eligible" name="eligibleForPercentage" type="checkbox" checked /> Eligible for percentage compensation
                    </label>
                  </Field>
                </FieldGroup>
                <div class="form-actions">
                  <button>Save client rate</button>
                </div>
              </form>
            </FormSection>

            <FormSection title="Internal loaded cost">
              <form method="POST" action="?/createInternalCostRule" class="admin-form-grid">
                <input type="hidden" name="projectId" value={data.selectedProjectId} />
                <FieldGroup columns="2">
                  <Field id="finance-internal-worker" label="Worker" required data-field="workerId">
                    <select id="finance-internal-worker" name="workerId" required>
                      <option value="">Select worker</option>
                      {#each data.workers ?? [] as worker}
                        <option value={worker.id}>{worker.name}</option>
                      {/each}
                    </select>
                  </Field>
                  <Field id="finance-internal-currency" label="Currency" data-field="currency">
                    <select id="finance-internal-currency" name="currency">
                      <option>USD</option><option>BRL</option><option>EUR</option>
                    </select>
                  </Field>
                  <Field id="finance-internal-cost" label="Hourly cost (minor units)" required data-field="hourlyRateMinor">
                    <input id="finance-internal-cost" name="hourlyRateMinor" type="number" min="0" required />
                  </Field>
                  <Field id="finance-internal-method" label="Cost method" required data-field="costMethod">
                    <input id="finance-internal-method" name="costMethod" value="loaded_cost" required />
                  </Field>
                  <Field id="finance-internal-overtime" label="Overtime method" data-field="overtimeMethod">
                    <select id="finance-internal-overtime" name="overtimeMethod">
                      <option value="BASE_RATE_MULTIPLIER">Base rate multiplier</option>
                      <option value="NONE">None</option>
                      <option value="FIXED_RATE">Fixed rate</option>
                      <option value="FIXED_ADDITION_PER_HOUR">Fixed addition per hour</option>
                    </select>
                  </Field>
                  <Field id="finance-internal-overtimemult" label="Overtime multiplier (bps)" data-field="overtimeMultiplierBps">
                    <input id="finance-internal-overtimemult" name="overtimeMultiplierBps" type="number" min="0" value="15000" />
                  </Field>
                  <Field id="finance-internal-effective" label="Effective from" required data-field="effectiveFrom">
                    <input id="finance-internal-effective" name="effectiveFrom" type="date" required />
                  </Field>
                </FieldGroup>
                <div class="form-actions">
                  <button>Save internal cost</button>
                </div>
              </form>
            </FormSection>
          </div>{/if}
      </FormCard>`;
  
  content = content.substring(0, financeStartIdx) + newFinanceSection + '\n' + content.substring(financeEndIdx);
  fs.writeFileSync(file, content, 'utf8');
  console.log('Successfully patched PortalShell.svelte');
} else {
  console.log('Could not find finance section!', financeStartIdx, financeEndIdx);
}
