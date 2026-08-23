<script lang="ts">
  import PortalShell from '$lib/PortalShell.svelte';
  import type { PortalActionResult, PortalData } from '$lib/portal/portal-data';
  let { data, form }: { data: PortalData; form?: PortalActionResult } = $props();
</script>

<PortalShell {data} {form} />
