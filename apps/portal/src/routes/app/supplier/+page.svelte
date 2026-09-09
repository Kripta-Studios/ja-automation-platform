<script lang="ts">
  import { SectionCard } from '$lib/portal/ui';
  import { supplierCopy } from './copy';
  let { data, form } = $props();
  const c = $derived(supplierCopy[data.locale as keyof typeof supplierCopy]);
  const base = '/j-aautomation/app';
  const today = new Date().toISOString().slice(0, 10);
  const actionUrl = (operation: string) =>
    `?/${operation}&${new URLSearchParams({ projectId: data.projectId, from: data.from, to: data.to, lang: data.locale }).toString()}`;
  const value = (operation: string, key: string, fallback = '') =>
    form?.operation === operation ? (form.values?.[key] ?? fallback) : fallback;
</script>

<svelte:head><title>{c.title} · J&A</title></svelte:head>
<main lang={data.locale}>
  <a href={base}>{c.back}</a>
  <h1>{data.owner ? c.title : c.team}</h1>
  <p>{c.intro}</p>
  <p>{c.restricted}</p>
  {#if form}<p role={form.success ? 'status' : 'alert'}>{form.success ? c.saved : c.failed}</p>
    {#if !form.success && 'message' in form}<p>{form.message}</p>{/if}{/if}
  <form method="GET" class="filters">
    <label
      >{c.project}<select name="projectId" value={data.projectId}
        >{#each data.projects as p}<option value={p.id}>{p.name}</option>{/each}</select
      ></label
    >
    <label>{c.from}<input type="date" name="from" value={data.from} required /></label>
    <label>{c.to}<input type="date" name="to" value={data.to} required /></label>
    <label
      >Language / Idioma<select name="lang" value={data.locale}
        ><option value="en">English</option><option value="es">Español</option><option value="pt"
          >Português</option
        ></select
      ></label
    >
    <button>{c.apply}</button>
  </form>
  <p>
    <a
      href={`${base}/supplier/report?projectId=${encodeURIComponent(data.projectId)}&from=${data.from}&to=${data.to}&lang=${data.locale}`}
      >{c.report}</a
    >
  </p>
  {#snippet projects(operation: string)}
    <label
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
    <label
      >{c.provider}<select
        name="supplierId"
        required
        value={value(operation, 'supplierId', String(data.suppliers[0]?.id || ''))}
        ><option value="">{c.select}</option>{#each data.suppliers as s}<option value={s.id}
            >{s.name}</option
          >{/each}</select
      ></label
    >
  {/snippet}
  {#snippet dates(operation: string)}
    <label
      >{c.starts}<input
        name="startsOn"
        type="date"
        value={value(operation, 'startsOn', today)}
        required
      /></label
    >
    <label>{c.ends}<input name="endsOn" type="date" value={value(operation, 'endsOn')} /></label>
  {/snippet}
  {#if data.owner}
    <SectionCard title={c.createProvider}
      ><form method="POST" action={actionUrl('createSupplier')}>
        <label
          >{c.name}<input
            name="name"
            required
            maxlength="160"
            value={value('createSupplier', 'name')}
          /></label
        ><button>{c.createProvider}</button>
      </form></SectionCard
    >
    <SectionCard title={c.owner}>
      <form method="POST" action={actionUrl('setProfile')}>
        <label
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
        <label
          >{c.profile}<select
            name="profile"
            required
            value={value('setProfile', 'profile', 'supplier_coordinator')}
            ><option value="supplier_coordinator">{c.coordinator}</option><option
              value="external_technician">{c.technician}</option
            ><option value="standard">{c.standard}</option></select
          ></label
        >
        {@render suppliers('setProfile')}<button>{c.saveProfile}</button>
      </form>
    </SectionCard>
    <SectionCard title={c.grant}>
      <form method="POST" action={actionUrl('grant')}>
        {@render suppliers('grant')}{@render projects('grant')}
        <label
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
        {@render dates('grant')}<button>{c.grant}</button>
      </form>
    </SectionCard>
    <SectionCard title={c.grants}>
      {#each data.grants as grant}<article>
          <p>
            <strong>{grant.supplierName}</strong> · {grant.projectName} · {grant.coordinatorName}
          </p>
          <p>{grant.startsOn} — {grant.endsOn || '…'} · {grant.status}</p>
          {#if grant.status === 'active'}<form method="POST" action={actionUrl('revoke')}>
              <input type="hidden" name="id" value={grant.id} /><button>{c.revoke}</button>
            </form>{/if}
        </article>{:else}<p>{c.empty}</p>{/each}
    </SectionCard>
  {/if}
  {#if data.projects.length}
    <SectionCard title={c.add}>
      <p>{c.personnel}</p>
      <form method="POST" action={actionUrl('addTechnician')}>
        {#if data.owner}{@render suppliers('addTechnician')}{/if}
        {@render projects('addTechnician')}
        <label
          >{c.name}<input
            name="name"
            required
            maxlength="160"
            value={value('addTechnician', 'name')}
          /></label
        >
        <label
          >{c.email}<input
            name="email"
            type="email"
            value={value('addTechnician', 'email')}
          /></label
        >
        {@render dates('addTechnician')}<button>{c.add}</button>
      </form>
    </SectionCard>
    <SectionCard title={c.assign}>
      <form method="POST" action={actionUrl('assignTechnician')}>
        <label
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
          <label
            >{c.worker}<select name="workerId" required value={value('createTime', 'workerId')}
              ><option value="">{c.select}</option>{#each data.assigned as t}<option value={t.id}
                  >{t.name}</option
                >{/each}</select
            ></label
          >
          <label
            >{c.date}<input
              type="date"
              name="workDate"
              value={value('createTime', 'workDate', today)}
              required
            /></label
          >
          <label
            >{c.category}<select name="category" value={value('createTime', 'category', 'work')}
              ><option value="work">{c.work}</option><option value="travel">{c.travel}</option
              ></select
            ></label
          >
          <label
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
          <label
            >{c.summary}<textarea name="summary" required maxlength="2000"
              >{value('createTime', 'summary')}</textarea
            ></label
          ><button>{c.save}</button>
        </form>
      </SectionCard>
    {/if}
    <SectionCard title={c.report}>
      {#each data.entries as entry}
        <article>
          <h3>{entry.workerName} · {entry.workDate}</h3>
          <p>{entry.minutes} · {c.minutes} · {entry.state}</p>
          <p>{entry.summary}</p>
          <p>{c.recordedBy}: {entry.recordedByName || entry.workerName}</p>
          {#if !data.owner && entry.state === 'needs_changes'}
            <form method="POST" action={actionUrl('correctTime')}>
              <input type="hidden" name="id" value={entry.id} /><input
                type="hidden"
                name="requestId"
                value={data.correctionRequestId}
              /><label
                >{c.reason}<input
                  name="reason"
                  required
                  maxlength="1000"
                  value={value('correctTime', 'reason')}
                /></label
              ><button>{c.correction}</button>
            </form>
          {/if}
          {#if !data.owner && entry.state === 'draft'}
            <form method="POST" action={actionUrl('submitTime')}>
              <input type="hidden" name="id" value={String(entry.id)} /><input
                type="hidden"
                name="version"
                value={Number(entry.version)}
              /><button>{c.submit}</button>
            </form>
            <details>
              <summary>{c.edit}</summary>
              <form method="POST" action={actionUrl('updateTime')}>
                <input type="hidden" name="id" value={String(entry.id)} /><input
                  type="hidden"
                  name="version"
                  value={Number(entry.version)}
                />
                <label
                  >{c.date}<input
                    type="date"
                    name="workDate"
                    required
                    value={form?.operation === 'updateTime' && form.values?.id === entry.id
                      ? form.values.workDate
                      : String(entry.workDate)}
                  /></label
                >
                <label
                  >{c.category}<select
                    name="category"
                    value={form?.operation === 'updateTime' && form.values?.id === entry.id
                      ? form.values.category
                      : String(entry.category)}
                    ><option value="work">{c.work}</option><option value="travel">{c.travel}</option
                    ></select
                  ></label
                >
                <label
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
                <label
                  >{c.summary}<textarea name="summary" required
                    >{form?.operation === 'updateTime' && form.values?.id === entry.id
                      ? form.values.summary
                      : String(entry.summary)}</textarea
                  ></label
                ><button>{c.save}</button>
              </form>
            </details>
          {/if}
        </article>
      {:else}<p>{c.empty}</p>{/each}
    </SectionCard>
  {:else}<p>{c.empty}</p>{/if}
</main>

<style>
  h1 {
    font-size: 1.65rem;
    font-weight: 700;
    line-height: 1.25;
  }
  main {
    max-width: 70rem;
    margin: auto;
    padding: 1.25rem;
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
  textarea,
  button {
    font: inherit;
    min-height: 44px;
    padding: 0.65rem;
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
  h1,
  p {
    margin: 0.3rem 0;
  }
  ul {
    padding-left: 1.5rem;
  }
</style>
