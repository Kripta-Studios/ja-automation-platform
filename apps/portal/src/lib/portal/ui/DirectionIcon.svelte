<script lang="ts">
  let {
    direction = 'right',
    kind = 'arrow',
    size = 18,
    class: className = '',
  }: {
    direction?: 'up' | 'right' | 'down' | 'left' | 'up-right';
    kind?: 'arrow' | 'chevron';
    size?: number;
    class?: string;
  } = $props();

  const paths = {
    arrow: {
      up: 'M12 19V5m-6 6 6-6 6 6',
      right: 'M5 12h14m-6-6 6 6-6 6',
      down: 'M12 5v14m-6-6 6 6 6-6',
      left: 'M19 12H5m6-6-6 6 6 6',
      'up-right': 'M7 17 17 7M7 7h10v10',
    },
    chevron: {
      up: 'm6 15 6-6 6 6',
      right: 'm9 6 6 6-6 6',
      down: 'm6 9 6 6 6-6',
      left: 'm15 6-6 6 6 6',
      'up-right': 'M7 7h10v10',
    },
  };
</script>

<svg
  class={`ui-direction-icon ${className}`.trim()}
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="1.8"
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"
  focusable="false"
>
  <path d={paths[kind][direction]} />
</svg>

<style>
  .ui-direction-icon {
    display: inline-block;
    flex: 0 0 auto;
    vertical-align: -0.2em;
  }
</style>
