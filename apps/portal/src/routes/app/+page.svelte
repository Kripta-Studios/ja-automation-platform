<script lang="ts">
  import PortalShell from '$lib/PortalShell.svelte';
  import type { PortalData } from '$lib/portal/portal-data';
  let { data }: { data: PortalData } = $props();
</script>

<PortalShell {data} />
