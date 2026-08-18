<script lang="ts">
  import { base } from '$app/paths';
  import { onMount } from 'svelte';
  import { purgeUserCache, queuedCount } from './offline';
  let {
    data,
  }: { data: { user: { name: string; email: string; role?: string }; section: string } } = $props();
  let online = $state(true);
  let queue = $state(0);
  const navigation = [
    ['today', 'Today'],
    ['time', 'Time'],
    ['reports', 'Reports'],
    ['expenses', 'Expenses'],
    ['projects', 'Projects'],
    ['pay', 'My Pay'],
    ['documents', 'Documents'],
    ['notifications', 'Notifications'],
    ['profile', 'Profile'],
  ];
  const admin = [
    ['planning', 'Planning'],
    ['approvals', 'Approvals'],
    ['billing', 'Billing'],
    ['finance', 'Finance'],
  ];
  const titles: Record<string, string> = {
    today: 'Today',
    time: 'Time entries',
    reports: 'Daily and technical reports',
    expenses: 'Expenses and receipts',
    projects: 'Projects',
    pay: 'My Pay',
    documents: 'Documents',
    notifications: 'Notifications',
    profile: 'Profile and security',
    planning: 'Resource planning',
    approvals: 'Approval queue',
    billing: 'Billing streams',
    finance: 'Project finance',
  };
  onMount(() => {
    online = navigator.onLine;
    void queuedCount().then((v) => (queue = v));
    const update = () => (online = navigator.onLine);
    addEventListener('online', update);
    addEventListener('offline', update);
    if ('serviceWorker' in navigator)
      void navigator.serviceWorker.register(`${base}/app/service-worker.js`, {
        scope: `${base}/app/`,
      });
    return () => {
      removeEventListener('online', update);
      removeEventListener('offline', update);
    };
  });
  async function logout() {
    await fetch(`${base}/app/api/auth/sign-out`, { method: 'POST' });
    await purgeUserCache();
    location.assign(`${base}/app/login`);
  }
  const href = (section: string) =>
    section === 'today' ? `${base}/app/` : `${base}/app/${section}`;
</script>

<svelte:head
  ><title>{titles[data.section]} | J&A Portal</title><link
    rel="manifest"
    href={`${base}/app/manifest.webmanifest`}
  /><meta name="theme-color" content="#17191b" /></svelte:head
>
<div class="portal-layout">
  <aside>
    <a class="portal-brand" href={`${base}/app/`}
      ><img src={`${base}/app/logo.png`} alt="J&A Automation" /></a
    >
    <nav aria-label="Worker navigation">
      {#each navigation as item}<a class:active={data.section === item[0]} href={href(item[0])}
          ><span>{item[1]}</span></a
        >{/each}
    </nav>
    {#if data.user.role && data.user.role !== 'worker'}<div class="admin-nav">
        <small>MANAGEMENT</small>{#each admin as item}<a
            class:active={data.section === item[0]}
            href={href(item[0])}>{item[1]}</a
          >{/each}
      </div>{/if}<button class="signout" onclick={logout}>Sign out</button>
  </aside>
  <header>
    <button class="menu-button" aria-label="Open navigation">☰</button>
    <div>
      <span class:offline={!online} class="connection"><i></i>{online ? 'Online' : 'Offline'}</span
      >{#if queue > 0}<span class="queue">{queue} queued</span>{/if}
    </div>
    <div class="user"><span>{data.user.name}</span><small>{data.user.role ?? 'worker'}</small></div>
  </header>
  <main>
    <div class="portal-title">
      <div>
        <p class="portal-kicker">J&A / {data.section.toUpperCase()}</p>
        <h1>{titles[data.section]}</h1>
      </div>
      <button class="portal-primary">+ New record</button>
    </div>
    <PortalSection section={data.section} />
  </main>
  <nav class="bottom-nav" aria-label="Mobile navigation">
    {#each navigation.slice(0, 5) as item}<a
        class:active={data.section === item[0]}
        href={href(item[0])}>{item[1]}</a
      >{/each}
  </nav>
</div>

{#snippet PortalSection(section: string)}
  {#if section === 'today'}<div class="portal-grid">
      <section class="assignment">
        <span class="status-chip"><b></b>ACTIVE ASSIGNMENT</span>
        <h2>No assignment scheduled</h2>
        <p>
          Your project manager’s published assignment will appear here, including site, shift and
          cached contact details.
        </p>
        <button>Refresh schedule</button>
      </section>
      <section class="record-list">
        <div class="panel-title">
          <h2>Required today</h2>
          <span>0 open</span>
        </div>
        {#each ['Time entry', 'Daily project report', 'Expense receipts'] as record}<article>
            <div><strong>{record}</strong><small>No item due</small></div>
            <span>Ready</span>
          </article>{/each}
      </section>
      <section class="sync-panel">
        <span class="portal-kicker">SYNC STATUS</span><strong
          >{online
            ? 'All local changes can sync'
            : 'Records stay on this device until reconnection.'}</strong
        >
        <p>Queued drafts show a visible conflict step when the server version changed.</p>
      </section>
    </div>
  {:else if section === 'time'}<div class="worker-form">
      <section>
        <h2>Log actual time</h2>
        <p>Planned, expected and guaranteed hours do not create time entries.</p>
        <label>Project<select><option>Select assignment</option></select></label><label
          >Work date<input type="date" /></label
        ><label
          >Category<select
            ><option>Regular</option><option>Overtime</option><option>Standby / waiting</option
            ><option>Travel</option><option>Training</option></select
          ></label
        ><label>Minutes<input type="number" min="0" max="1440" inputmode="numeric" /></label><button
          >Save draft</button
        >
      </section>
      <section class="record-list">
        <div class="panel-title">
          <h2>This period</h2>
          <span>0 min</span>
        </div>
        <div class="empty">No time recorded in this period.</div>
      </section>
    </div>
  {:else if section === 'pay'}<div class="portal-grid">
      <section class="metric">
        <span>ESTIMATED COMPENSATION</span><strong>Unavailable</strong>
        <p>
          Only your approved compensation rule and eligible time appear here. Client rates, loaded
          cost, margin and other workers stay private.
        </p>
      </section>
      <section class="record-list">
        <div class="panel-title"><h2>Calculation sources</h2></div>
        <div class="empty">No approved sources in this period.</div>
      </section>
    </div>
  {:else}<section class="record-list full">
      <div class="panel-title">
        <h2>{titles[section]}</h2>
        <div><button>Filter</button><button>Export</button></div>
      </div>
      <div class="empty">
        Your authorized records will appear here. Server queries apply role, project membership and
        ownership checks.
      </div>
    </section>{/if}
{/snippet}
