<script lang="ts">
  import PortalShell from '$lib/PortalShell.svelte';
  let { data, form } = $props();
</script>

<PortalShell {data} {form} />
