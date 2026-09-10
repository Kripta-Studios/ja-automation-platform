<script lang="ts">
  import '../portal.css';
  import { onMount } from 'svelte';
  import { installSearchableSelects } from '$lib/portal/searchable-selects';
  let { children } = $props();
  onMount(() => installSearchableSelects(document.body));
</script>

{@render children()}
