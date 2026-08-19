<script lang="ts">
  import { base } from '$app/paths';

  type Value = string | number | boolean | string[] | null | undefined;
  type Notification = Record<string, Value>;
  let { data, form } = $props();
  const notification = $derived(data.notification as Notification);
  const kind = $derived(String(notification.kind ?? '').replaceAll('_', ' '));
  const changedFields = $derived(
    Array.isArray(notification.changed_fields) ? notification.changed_fields : [],
  );
  const target = $derived(
    notification.kind === 'report_deleted'
      ? ''
      : String(notification.kind ?? '').startsWith('report_')
        ? base + '/app/reports/' + String(notification.subject_id)
        : String(notification.kind ?? '').includes('expense')
          ? base + '/app/expenses/' + String(notification.subject_id)
          : notification.kind === 'assignment_published'
            ? base + '/app/projects/' + String(notification.subject_id)
            : base + '/app/notifications',
  );
</script>

<svelte:head><title>Notification | J&A Automation</title></svelte:head>

<main class="record-detail-page notification-detail-page">
  <nav class="detail-nav">
    <a href={base + '/app/notifications'}>← Activity inbox</a>
    {#if target}<a href={target}>Open source record</a>{/if}
  </nav>
  <header class="record-detail-header">
    <div>
      <span class="portal-kicker">ACTIVITY INBOX · NOTIFICATION</span>
      <h1>{kind}</h1>
      <p>
        {String(notification.created_at ?? '')
          .replace('T', ' ')
          .slice(0, 19)}
      </p>
    </div>
    <span class="state-tag">{notification.read_at ? 'read' : 'new'}</span>
  </header>
  {#if form?.message}<p class:success={form.success} class="action-message" role="status">
      {form.message}
    </p>{/if}
  <section class="detail-panel record-detail-copy">
    <div class="panel-title">
      <h2>{notification.record_title ?? 'Workspace activity'}</h2>
      <span>{notification.project_number ?? '—'}</span>
    </div>
    <p>
      {notification.actor_name ?? 'A workspace user'} generated this activity for
      {notification.project_name ?? 'the workspace'}.
    </p>
    <dl class="record-facts">
      <div>
        <dt>Project</dt>
        <dd>{notification.project_name ?? '—'}</dd>
      </div>
      <div>
        <dt>Record date</dt>
        <dd>{notification.record_date ?? '—'}</dd>
      </div>
      <div>
        <dt>Source ID</dt>
        <dd>{notification.subject_id ?? '—'}</dd>
      </div>
    </dl>
    {#if changedFields.length > 0}<p class="change-summary">
        Changed fields: {changedFields.join(', ')}
      </p>{/if}
  </section>
  <form method="POST" action="?/markRead" class="notification-read-form">
    <input type="hidden" name="notificationId" value={notification.id} />
    {#if !notification.read_at}<button>Mark as read</button>{/if}
  </form>
</main>
