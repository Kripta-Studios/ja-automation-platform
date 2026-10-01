<script lang="ts">
  let {
    id,
    name = 'category',
    value = $bindable(''),
    required = false,
    translate = (text: string) => text,
  }: {
    id: string;
    name?: string;
    value?: string;
    required?: boolean;
    translate?: (text: string) => string;
  } = $props();
  const categories = [
    ['regular', 'Regular time'],
    ['overtime', 'Overtime'],
    ['travel', 'Travel'],
    ['standby', 'Standby / waiting'],
    ['commissioning', 'Commissioning'],
    ['weekend_holiday', 'Weekend / holiday'],
    ['remote_support', 'Remote support'],
    ['training', 'Training'],
    ['internal', 'Internal'],
  ] as const;
  let customSelected = $state(false);
  const custom = $derived(
    customSelected || Boolean(value && !categories.some(([code]) => code === value)),
  );
</script>

<select
  {id}
  name={custom ? undefined : name}
  value={custom ? '__custom' : value}
  required={required && !custom}
  onchange={(event) => {
    if (event.currentTarget.value === '__custom') {
      customSelected = true;
      value = '';
    } else {
      customSelected = false;
      value = event.currentTarget.value;
    }
  }}
>
  <option value="">{translate(required ? 'Choose an option' : 'Any category')}</option>
  {#each categories as [code, label]}<option value={code}>{translate(label)}</option>{/each}
  <option value="__custom">{translate('Custom category')}</option>
</select>
{#if custom}
  <label for={`${id}-custom`}>{translate('Custom category')}</label>
  <input id={`${id}-custom`} {name} bind:value {required} maxlength="100" autocomplete="off" />
{/if}
