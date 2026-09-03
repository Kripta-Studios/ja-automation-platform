<script lang="ts">
  import type { ToastVariant } from './Toast.svelte';
  import Toast from './Toast.svelte';

  export type ToastItem = {
    id: string;
    message: string;
    title?: string;
    variant?: ToastVariant;
    closeLabel?: string;
    autoDismiss?: boolean;
    durationMs?: number;
  };

  type Props = {
    toasts?: ToastItem[];
    label?: string;
    class?: string;
    ondismiss?: (id: string) => void;
  };

  let { toasts = [], label = 'Notifications', class: className = '', ondismiss }: Props = $props();
</script>

{#if toasts.length > 0}
  <div
    class={`ui-toast-region ${className}`.trim()}
    data-ui="toast-region"
    role="region"
    aria-label={label}
  >
    {#each toasts as toast (toast.id)}
      <Toast
        variant={toast.variant}
        title={toast.title}
        message={toast.message}
        closeLabel={toast.closeLabel}
        autoDismiss={toast.autoDismiss}
        durationMs={toast.durationMs}
        ondismiss={ondismiss ? () => ondismiss?.(toast.id) : undefined}
      />
    {/each}
  </div>
{/if}
