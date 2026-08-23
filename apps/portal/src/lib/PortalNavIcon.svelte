<script lang="ts">
  let { path, centered = false }: { path: string; centered?: boolean } = $props();
</script>

<svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
  <path d={path} />
  {#if centered && !path.startsWith('M12 8a4')}
    <circle cx="12" cy="12" r="3.1" class="icon-hub" />
  {/if}
</svg>
