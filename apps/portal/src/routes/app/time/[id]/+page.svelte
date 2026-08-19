<script lang="ts">
  import { base } from '$app/paths';
  type Row = Record<string, string | number | boolean | null>;
  let { data } = $props();
  const record = $derived(data.record as Row);
  const hours = (minutes: string | number | null | undefined) =>
    String((Number(minutes ?? 0) / 60).toFixed(1)) + ' h';
</script>

<svelte:head><title>Time entry | {record.project_number}</title></svelte:head>
<main class="record-detail-page">
  <nav class="detail-nav">
    <a href={base + '/app/time'}>← Time</a>
    <a href={base + '/app/projects/' + String(record.project_id)}>Open project</a>
  </nav>
  <header class="record-detail-header">
    <div>
      <span class="portal-kicker">TIME ENTRY · SOURCE RECORD</span>
      <h1>{record.project_number} · {record.work_date}</h1>
      <p>{record.project_name} · {record.worker_name}</p>
    </div>
    <span class="state-tag">{record.approval_state}</span>
  </header>
  <section class="record-detail-grid">
    <article><span>ACTUAL TIME</span><strong>{hours(record.minutes)}</strong></article>
    <article>
      <span>CATEGORY</span><strong>{String(record.category).replaceAll('_', ' ')}</strong>
    </article>
    <article>
      <span>BILLABILITY</span><strong>{record.billability_state ?? 'pending'}</strong>
    </article>
    <article><span>SITE</span><strong>{record.site ?? record.site_name ?? '—'}</strong></article>
  </section>
  <section class="detail-panel record-detail-copy">
    <div class="panel-title">
      <h2>Activity summary</h2>
      <span>{record.activity_code ?? 'No code'}</span>
    </div>
    <p>{record.activity_summary ?? 'No activity summary was recorded.'}</p>
    <dl class="record-facts">
      <div>
        <dt>Project timezone</dt>
        <dd>{record.project_timezone ?? '—'}</dd>
      </div>
      <div>
        <dt>Shift window</dt>
        <dd>{record.start_time ?? '—'} → {record.end_time ?? '—'}</dd>
      </div>
      <div>
        <dt>Break</dt>
        <dd>{record.break_minutes ? String(record.break_minutes) + ' min' : '—'}</dd>
      </div>
      <div>
        <dt>Submitted</dt>
        <dd>{record.submitted_at ?? 'Not submitted'}</dd>
      </div>
      <div>
        <dt>Approved</dt>
        <dd>{record.approved_at ?? 'Not approved'}</dd>
      </div>
    </dl>
  </section>
</main>
