<script lang="ts">
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import { projects } from './content';
  let industry = $state('all');
  let capability = $state('all');
  let filtered = $derived(
    projects.filter(
      (item) =>
        (industry === 'all' || item.industry === industry) &&
        (capability === 'all' || item.capability === capability),
    ),
  );
  onMount(() => {
    const params = new URL(location.href).searchParams;
    industry = params.get('industry') ?? 'all';
    capability = params.get('capability') ?? 'all';
  });
  function update(key: string, value: string) {
    const url = new URL(location.href);
    value === 'all' ? url.searchParams.delete(key) : url.searchParams.set(key, value);
    if (key === 'industry') industry = value;
    else capability = value;
    void goto(url, { keepFocus: true, noScroll: true });
  }
</script>

<div class="filters" aria-label="Project filters">
  <label
    >Industry<select value={industry} onchange={(e) => update('industry', e.currentTarget.value)}
      ><option value="all">All industries</option><option value="automotive">Automotive</option
      ><option value="food-beverage">Food & beverage</option><option value="energy-process"
        >Energy & process</option
      ></select
    ></label
  >
  <label
    >Capability<select
      value={capability}
      onchange={(e) => update('capability', e.currentTarget.value)}
      ><option value="all">All capabilities</option><option value="plc-hmi-scada"
        >PLC / HMI / SCADA</option
      ><option value="robotics-line-integration">Robotics</option><option
        value="electrical-controls">Electrical controls</option
      ><option value="commissioning-support">Commissioning</option></select
    ></label
  >
</div>
<div class="project-list">
  {#each filtered as project}<article>
      <div>
        <span class="mono">{project.year} / {project.region}</span>
        <h2>{project.title}</h2>
        <p>{project.scope}</p>
      </div>
      <div><span>{project.client}</span><span>{project.technology}</span></div>
    </article>{/each}
</div>
