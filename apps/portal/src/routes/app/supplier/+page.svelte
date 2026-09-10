<script lang="ts">
  import { portalText } from '$lib/portal-i18n';
  import { SectionCard, StatusBadge, ResponsiveSheet } from '$lib/portal/ui';
  import { supplierCopy, supplierStateLabel, supplierManagementCopy } from './copy';
  import { standaloneActionMessage } from '../standalone-locale';
  import { enhance } from '$app/forms';
  import { untrack } from 'svelte';
  let { data, form } = $props();
  const c = $derived(supplierCopy[data.locale as keyof typeof supplierCopy]);
  const m = $derived(supplierManagementCopy[data.locale as keyof typeof supplierManagementCopy]);
  let search = $state('');
  let directoryStatus = $state('active');
  type Editor = {
    operation: string;
    id: string;
    name: string;
    email: string;
    hasLogin: number;
    status: string;
  };
  let editor = $state<Editor | null>(
    untrack(() =>
      form &&
      !form.success &&
      ['updateSupplier', 'updateTechnician', 'setSupplierStatus', 'setTechnicianStatus'].includes(
        form.operation,
      )
        ? {
            operation: form.operation,
            id: form.values?.id ?? '',
            name: form.values?.name ?? '',
            email: form.values?.email ?? '',
            hasLogin: Number(data.directory.find((t) => t.id === form.values?.id)?.hasLogin ?? 0),
            status: form.values?.status ?? '',
          }
        : null,
    ),
  );
  const matches = (text: string, status: string) =>
    (directoryStatus === 'all' ||
      (directoryStatus === 'active' ? status === 'active' : status !== 'active')) &&
    text.toLocaleLowerCase().includes(search.toLocaleLowerCase());
  function editRecord(
    operation: string,
    row: { id: string; name: string; email?: string; hasLogin?: number },
  ) {
    editor = {
      operation,
      id: row.id,
      name: row.name,
      email: row.email ?? '',
      hasLogin: row.hasLogin ?? 0,
      status: '',
    };
  }
  function changeStatus(operation: string, row: { id: string; name: string }, status: string) {
    editor = { operation, id: row.id, name: row.name, email: '', hasLogin: 0, status };
  }
  const base = '/j-aautomation/app';
  const today = new Date().toISOString().slice(0, 10);
  const actionUrl = (operation: string) =>
    `?/${operation}&${new URLSearchParams({ projectId: data.projectId, from: data.from, to: data.to, lang: data.locale }).toString()}`;
  const value = (operation: string, key: string, fallback = '') =>
    form?.operation === operation ? (form.values?.[key] ?? fallback) : fallback;
</script>

<svelte:head><title>{c.title} · J&A</title></svelte:head>
<div class="supplier-page" lang={data.locale}>
  <h1 class="supplier-title">{data.owner ? c.title : c.team}</h1>
  <p>{data.owner ? m.intro : c.intro}</p>
  {#if !data.owner}<p>{c.restricted}</p>{/if}
  {#if form}<p role={form.success ? 'status' : 'alert'}>{form.success ? c.saved : c.failed}</p>
    {#if !form.success}<p>{standaloneActionMessage(data.locale, form)}</p>{/if}{/if}
  <nav class="supplier-jump-links" aria-label={c.title}>
    {#if data.owner}<a href="#supplier-directory">{m.directory}</a><a href="#supplier-setup"
        >{m.setup}</a
      >{/if}
    <a href="#supplier-personnel">{m.personnel}</a><a href="#supplier-report">{c.report}</a>
  </nav>
  {#if data.owner}
    <SectionCard title={c.title} id="supplier-directory">
      <div class="directory-filters">
        <label data-ui="field"
          >{m.search}<input type="search" bind:value={search} placeholder={m.searchHint} /></label
        >
        <label data-ui="field"
          >{c.state}<select bind:value={directoryStatus}
            ><option value="active">{m.active}</option><option value="inactive">{m.inactive}</option
            ><option value="all">{m.all}</option></select
          ></label
        >
      </div>
      <h3>{m.suppliers}</h3>
      <div class="supplier-directory">
        {#each data.suppliers.filter((s) => matches(s.name, s.status)) as supplier}
          <article class="directory-record" data-supplier-id={supplier.id}>
            <div class="directory-identity">
              <strong>{supplier.name}</strong><StatusBadge
                variant={supplier.status === 'active' ? 'success' : 'neutral'}
                text={supplier.status === 'active' ? m.active : m.inactive}
              />
            </div>
            <div class="directory-actions">
              <button
                type="button"
                class="secondary-button"
                onclick={() => editRecord('updateSupplier', supplier)}>{m.edit}</button
              >
              <button
                type="button"
                class={supplier.status === 'active'
                  ? 'primary-button danger-button'
                  : 'secondary-button'}
                onclick={() =>
                  changeStatus(
                    'setSupplierStatus',
                    supplier,
                    supplier.status === 'active' ? 'inactive' : 'active',
                  )}>{supplier.status === 'active' ? m.remove : m.restore}</button
              >
            </div>
          </article>
        {:else}<p class="muted">{m.noMatches}</p>{/each}
      </div>
      <h3>{c.assigned}</h3>
      <div class="supplier-directory">
        {#each data.directory.filter( (t) => matches(`${t.name} ${t.email} ${t.supplierName}`, t.status), ) as technician}
          <article class="directory-record" data-technician-id={technician.id}>
            <div class="directory-identity">
              <strong>{technician.name}</strong><span class="muted">{technician.supplierName}</span
              >{#if technician.email}<span>{technician.email}</span>{/if}<StatusBadge
                variant={technician.status === 'active' ? 'success' : 'neutral'}
                text={technician.status === 'active' ? m.active : m.inactive}
              />
            </div>
            <div class="directory-actions">
              <button
                type="button"
                class="secondary-button"
                onclick={() => editRecord('updateTechnician', technician)}>{m.edit}</button
              >
              {#if ['active', 'suspended'].includes(technician.status)}<button
                  type="button"
                  class={technician.status === 'active'
                    ? 'primary-button danger-button'
                    : 'secondary-button'}
                  onclick={() =>
                    changeStatus(
                      'setTechnicianStatus',
                      technician,
                      technician.status === 'active' ? 'suspended' : 'active',
                    )}>{technician.status === 'active' ? m.remove : m.restore}</button
                >{/if}
            </div>
          </article>
        {:else}<p class="muted">{m.noMatches}</p>{/each}
      </div>
    </SectionCard>
  {/if}
  <ResponsiveSheet
    open={editor !== null}
    title={editor?.operation.startsWith('update')
      ? m.edit
      : editor?.status === 'active'
        ? m.restore
        : m.remove}
    closeLabel={m.cancel}
    onclose={() => (editor = null)}
  >
    {#if editor}
      <form
        method="POST"
        action={actionUrl(editor.operation)}
        class="supplier-editor"
        use:enhance={() => {
          return async ({ result, update }) => {
            await update({ reset: false });
            if (result.type === 'success') editor = null;
          };
        }}
      >
        <input type="hidden" name="id" value={editor.id} />
        {#if form && !form.success && form.operation === editor.operation}<p role="alert">
            {standaloneActionMessage(data.locale, form)}
          </p>{/if}
        {#if editor.operation.startsWith('update')}
          <label data-ui="field"
            >{c.name}<input
              name="name"
              bind:value={editor.name}
              required
              maxlength={editor.operation === 'updateSupplier' ? 200 : 160}
            /></label
          >
          {#if editor.operation === 'updateTechnician'}
            <label data-ui="field"
              >{c.email}<input
                name="email"
                type="email"
                bind:value={editor.email}
                readonly={Boolean(editor.hasLogin)}
                maxlength="254"
              /></label
            >
            {#if editor.hasLogin}<p class="muted">{m.loginEmail}</p>{/if}
          {/if}
        {:else}
          <input type="hidden" name="status" value={editor.status} />
          <strong>{editor.name}</strong>
          <p>
            {editor.status === 'active'
              ? editor.operation === 'setSupplierStatus'
                ? m.restoreSupplierNote
                : m.restoreTechnicianNote
              : editor.operation === 'setSupplierStatus'
                ? m.removeSupplierNote
                : m.removeTechnicianNote}
          </p>
          <label class="check"
            ><input type="checkbox" name="confirmed" value="yes" required />{m.confirm}</label
          >
        {/if}
        <div class="form-actions">
          <button type="button" class="secondary-button" onclick={() => (editor = null)}
            >{m.cancel}</button
          >
          <button
            class={editor.operation.startsWith('set') && editor.status !== 'active'
              ? 'primary-button danger-button'
              : 'primary-button'}
            >{editor.operation.startsWith('update')
              ? m.save
              : editor.status === 'active'
                ? m.restore
                : m.remove}</button
          >
        </div>
      </form>
    {/if}
  </ResponsiveSheet>
  <SectionCard title={m.filters}>
    <form method="GET" class="filters">
      <label data-ui="field"
        >{c.project}<select name="projectId" value={data.projectId}
          >{#each data.projects as p}<option value={p.id}>{p.name}</option>{/each}</select
        ></label
      >
      <label data-ui="field"
        >{c.from}<input type="date" name="from" value={data.from} required /></label
      >
      <label data-ui="field">{c.to}<input type="date" name="to" value={data.to} required /></label>
      <label data-ui="field"
        >{portalText(data.locale, 'Language')}<select name="lang" value={data.locale}
          ><option value="en">English</option><option value="es">Español</option><option value="pt"
            >Português</option
          ></select
        ></label
      >
      <button class="primary-button">{c.apply}</button>
    </form>
    <p>
      <a
        href={`${base}/supplier/report?projectId=${encodeURIComponent(data.projectId)}&from=${data.from}&to=${data.to}&lang=${data.locale}`}
        >{c.report}</a
      >
    </p>
  </SectionCard>
  {#snippet projects(operation: string)}
    <label data-ui="field"
      >{c.project}<select
        name="projectId"
        required
        value={value(operation, 'projectId', data.projectId)}
        ><option value="">{c.select}</option>{#each data.projects as p}<option value={p.id}
            >{p.name}</option
          >{/each}</select
      ></label
    >
  {/snippet}
  {#snippet suppliers(operation: string)}
    <label data-ui="field"
      >{c.provider}<select
        name="supplierId"
        required
        value={value(
          operation,
          'supplierId',
          String(data.suppliers.find((s) => s.status === 'active')?.id || ''),
        )}
        ><option value="">{c.select}</option
        >{#each data.suppliers.filter((s) => s.status === 'active') as s}<option value={s.id}
            >{s.name}</option
          >{/each}</select
      ></label
    >
  {/snippet}
  {#snippet dates(operation: string)}
    <label data-ui="field"
      >{c.starts}<input
        name="startsOn"
        type="date"
        value={value(operation, 'startsOn', today)}
        required
      /></label
    >
    <label data-ui="field"
      >{c.ends}<input name="endsOn" type="date" value={value(operation, 'endsOn')} /></label
    >
  {/snippet}
  {#if data.owner}
    <SectionCard title={c.createProvider} id="supplier-setup"
      ><form method="POST" action={actionUrl('createSupplier')}>
        <label data-ui="field"
          >{c.name}<input
            name="name"
            required
            maxlength="160"
            value={value('createSupplier', 'name')}
          /></label
        ><button class="primary-button">{c.createProvider}</button>
      </form></SectionCard
    >
    <SectionCard title={c.owner}>
      <p>{c.restricted}</p>
      <form method="POST" action={actionUrl('setProfile')}>
        <label data-ui="field"
          >{c.account}<select name="userId" required value={value('setProfile', 'userId')}
            ><option value="">{c.select}</option>{#each data.accounts as account}<option
                value={account.id}
                >{account.name} · {account.profile === 'supplier_coordinator'
                  ? c.coordinator
                  : account.profile === 'external_technician'
                    ? c.technician
                    : c.standard}</option
              >{/each}</select
          ></label
        >
        <label data-ui="field"
          >{c.profile}<select
            name="profile"
            required
            value={value('setProfile', 'profile', 'supplier_coordinator')}
            ><option value="supplier_coordinator">{c.coordinator}</option><option
              value="external_technician">{c.technician}</option
            ><option value="standard">{c.standard}</option></select
          ></label
        >
        {@render suppliers('setProfile')}<button class="primary-button">{c.saveProfile}</button>
      </form>
    </SectionCard>
    <SectionCard title={c.grant}>
      <form method="POST" action={actionUrl('grant')}>
        {@render suppliers('grant')}{@render projects('grant')}
        <label data-ui="field"
          >{c.coordinator}<select
            name="coordinatorId"
            required
            value={value('grant', 'coordinatorId')}
            ><option value="">{c.select}</option
            >{#each data.accounts.filter((a) => a.profile === 'supplier_coordinator') as account}<option
                value={account.id}>{account.name}</option
              >{/each}</select
          ></label
        >
        {@render dates('grant')}<button class="primary-button">{c.grant}</button>
      </form>
    </SectionCard>
    <SectionCard title={c.grants}>
      {#each data.grants as grant}<article>
          <p>
            <strong>{grant.supplierName}</strong> · {grant.projectName} · {grant.coordinatorName}
          </p>
          <p>
            {grant.startsOn} — {grant.endsOn || '…'} · {supplierStateLabel(
              data.locale,
              grant.status,
            )}
          </p>
          {#if grant.status === 'active'}<form method="POST" action={actionUrl('revoke')}>
              <input type="hidden" name="id" value={grant.id} /><button class="primary-button"
                >{c.revoke}</button
              >
            </form>{/if}
        </article>{:else}<p>{c.empty}</p>{/each}
    </SectionCard>
  {/if}
  {#if data.projects.length}
    <SectionCard title={c.add} id="supplier-personnel">
      <p>{c.personnel}</p>
      <form method="POST" action={actionUrl('addTechnician')}>
        {#if data.owner}{@render suppliers('addTechnician')}{/if}
        {@render projects('addTechnician')}
        <label data-ui="field"
          >{c.name}<input
            name="name"
            required
            maxlength="160"
            value={value('addTechnician', 'name')}
          /></label
        >
        <label data-ui="field"
          >{c.email}<input
            name="email"
            type="email"
            value={value('addTechnician', 'email')}
          /></label
        >
        {@render dates('addTechnician')}<button class="primary-button">{c.add}</button>
      </form>
    </SectionCard>
    <SectionCard title={c.assign}>
      <form method="POST" action={actionUrl('assignTechnician')}>
        <label data-ui="field"
          >{c.worker}<select name="workerId" required value={value('assignTechnician', 'workerId')}
            ><option value="">{c.select}</option>{#each data.technicians as t}<option value={t.id}
                >{t.name}</option
              >{/each}</select
          ></label
        >
        {@render projects('assignTechnician')}{@render dates('assignTechnician')}<button
          >{c.assign}</button
        >
      </form>
    </SectionCard>
    <SectionCard title={c.assigned}
      ><ul>
        {#each data.assigned as t}<li>{t.name}</li>{/each}
      </ul></SectionCard
    >
    {#if !data.owner}
      <SectionCard title={c.time}>
        <form method="POST" action={actionUrl('createTime')}>
          <input type="hidden" name="projectId" value={data.projectId} />
          <label data-ui="field"
            >{c.worker}<select name="workerId" required value={value('createTime', 'workerId')}
              ><option value="">{c.select}</option>{#each data.assigned as t}<option value={t.id}
                  >{t.name}</option
                >{/each}</select
            ></label
          >
          <label data-ui="field"
            >{c.date}<input
              type="date"
              name="workDate"
              value={value('createTime', 'workDate', today)}
              required
            /></label
          >
          <label data-ui="field"
            >{c.category}<select name="category" value={value('createTime', 'category', 'work')}
              ><option value="work">{c.work}</option><option value="travel">{c.travel}</option
              ></select
            ></label
          >
          <label data-ui="field"
            >{c.minutes}<input
              type="number"
              min="1"
              max="1440"
              step="1"
              name="minutes"
              value={value('createTime', 'minutes')}
              required
            /></label
          >
          <label data-ui="field"
            >{c.summary}<textarea name="summary" required maxlength="2000"
              >{value('createTime', 'summary')}</textarea
            ></label
          ><button class="primary-button">{c.save}</button>
        </form>
      </SectionCard>
    {/if}
    <SectionCard title={c.report} id="supplier-report">
      {#each data.entries as entry}
        <article>
          <h3>{entry.workerName} · {entry.workDate}</h3>
          <p>{entry.minutes} · {c.minutes} · {supplierStateLabel(data.locale, entry.state)}</p>
          <p>{entry.summary}</p>
          <p>{c.recordedBy}: {entry.recordedByName || entry.workerName}</p>
          {#if !data.owner && entry.state === 'needs_changes'}
            <form method="POST" action={actionUrl('correctTime')}>
              <input type="hidden" name="id" value={entry.id} /><input
                type="hidden"
                name="requestId"
                value={data.correctionRequestId}
              /><label data-ui="field"
                >{c.reason}<input
                  name="reason"
                  required
                  maxlength="1000"
                  value={value('correctTime', 'reason')}
                /></label
              ><button class="primary-button">{c.correction}</button>
            </form>
          {/if}
          {#if !data.owner && entry.state === 'draft'}
            <form method="POST" action={actionUrl('submitTime')}>
              <input type="hidden" name="id" value={String(entry.id)} /><input
                type="hidden"
                name="version"
                value={Number(entry.version)}
              /><button class="primary-button">{c.submit}</button>
            </form>
            <details>
              <summary>{c.edit}</summary>
              <form method="POST" action={actionUrl('updateTime')}>
                <input type="hidden" name="id" value={String(entry.id)} /><input
                  type="hidden"
                  name="version"
                  value={Number(entry.version)}
                />
                <label data-ui="field"
                  >{c.date}<input
                    type="date"
                    name="workDate"
                    required
                    value={form?.operation === 'updateTime' && form.values?.id === entry.id
                      ? form.values.workDate
                      : String(entry.workDate)}
                  /></label
                >
                <label data-ui="field"
                  >{c.category}<select
                    name="category"
                    value={form?.operation === 'updateTime' && form.values?.id === entry.id
                      ? form.values.category
                      : String(entry.category)}
                    ><option value="work">{c.work}</option><option value="travel">{c.travel}</option
                    ></select
                  ></label
                >
                <label data-ui="field"
                  >{c.minutes}<input
                    type="number"
                    name="minutes"
                    min="1"
                    max="1440"
                    required
                    value={form?.operation === 'updateTime' && form.values?.id === entry.id
                      ? Number(form.values.minutes)
                      : Number(entry.minutes)}
                  /></label
                >
                <label data-ui="field"
                  >{c.summary}<textarea name="summary" required
                    >{form?.operation === 'updateTime' && form.values?.id === entry.id
                      ? form.values.summary
                      : String(entry.summary)}</textarea
                  ></label
                ><button class="primary-button">{c.save}</button>
              </form>
            </details>
          {/if}
        </article>
      {:else}<p>{c.empty}</p>{/each}
    </SectionCard>
  {:else}<p>{c.empty}</p>{/if}
</div>

<style>
  h1 {
    font-size: clamp(1.65rem, 2.4vw, 2.25rem);
    font-weight: 700;
    line-height: 1.25;
  }
  .supplier-page {
    min-width: 0;
    display: grid;
    gap: 1rem;
  }
  form {
    display: grid;
    gap: 1rem;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 16rem), 1fr));
    align-items: end;
  }
  label {
    display: grid;
    gap: 0.4rem;
    min-width: 0;
  }
  input,
  select,
  textarea {
    max-width: 100%;
    box-sizing: border-box;
  }
  textarea {
    min-height: 6rem;
  }
  button {
    cursor: pointer;
  }
  article {
    padding: 1rem 0;
    border-bottom: 1px solid #ccd3db;
    overflow-wrap: anywhere;
  }
  a {
    display: inline-block;
    padding: 0.5rem 0;
  }
  details {
    margin-top: 1rem;
  }
  summary {
    cursor: pointer;
    min-height: 44px;
  }
  p {
    margin: 0;
    line-height: 1.65;
  }
  h1 {
    margin: 0;
  }
  ul {
    padding-left: 1.5rem;
  }
  .supplier-jump-links,
  .directory-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
  }
  .supplier-jump-links a {
    padding: 0.7rem 1rem;
    border: 1px solid var(--ja-card-border);
    border-radius: 0.5rem;
    background: var(--ja-surface, #fff);
    font-weight: 700;
  }
  .directory-filters {
    display: grid;
    grid-template-columns: minmax(0, 2fr) minmax(10rem, 1fr);
    gap: 1rem;
    margin-bottom: 1.5rem;
  }
  .directory-record {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
  }
  .directory-identity {
    display: grid;
    justify-items: start;
    gap: 0.5rem;
    min-width: 0;
  }
  .directory-actions {
    flex-shrink: 0;
  }
  .supplier-directory + h3 {
    margin-top: 2rem;
  }
  h3 {
    margin: 1rem 0;
  }
  :global(.supplier-editor) {
    display: grid;
    gap: 1.25rem;
  }
  :global(.supplier-editor p) {
    line-height: 1.65;
  }
  :global(.supplier-page [data-ui='section-card'] > p) {
    margin-bottom: 1rem;
  }
  :global(.supplier-editor .check) {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }
  @media (max-width: 40rem) {
    .directory-filters {
      grid-template-columns: 1fr;
    }
    .directory-record {
      align-items: stretch;
      flex-direction: column;
    }
    .directory-actions > button {
      flex: 1;
    }
  }
</style>
