<script lang="ts">
  import { enhance } from '$app/forms';

  /**
   * Owner decision 2026-11-25: the owner sets the number the project's next issued invoice
   * gets (CP-<client>-<NNN>), e.g. start at 003. Only the next free number or a later unused
   * one is accepted; issued numbers are never reused. Saved numbers are audited.
   */
  type Counter = {
    applies: boolean;
    stem: string;
    nextSequence: number;
    nextNumber: string;
    minimumSequence: number;
    usedNumbers: string[];
  };
  let {
    counter,
    canEdit,
    form = null,
    locale = 'en',
  }: {
    counter: Counter;
    canEdit: boolean;
    form?: Record<string, unknown> | null;
    locale?: string;
  } = $props();

  const copy = {
    title: ['Invoice numbers', 'Números de factura', 'Números de fatura'],
    next: ['Next invoice of this project', 'Próxima factura de este proyecto', 'Próxima fatura deste projeto'],
    willBe: ['The next invoice will be {number}.', 'La próxima factura será la {number}.', 'A próxima fatura será a {number}.'],
    change: ['Start the next invoice at', 'Empezar la próxima factura en', 'Começar a próxima fatura em'],
    hint: [
      'Use a later number, for example 3 when 001 and 002 were issued outside the portal. Numbers already issued are never used again.',
      'Usa un número posterior, por ejemplo 3 si la 001 y la 002 se emitieron fuera del portal. Los números ya emitidos no se vuelven a usar.',
      'Use um número posterior, por exemplo 3 se a 001 e a 002 foram emitidas fora do portal. Números já emitidos nunca são reutilizados.',
    ],
    used: ['Already used', 'Ya usados', 'Já usados'],
    notFree: [
      '{number} is already used or lower than the next free number.',
      'La {number} ya está usada o es menor que el próximo número libre.',
      'A {number} já foi usada ou é menor que o próximo número livre.',
    ],
    save: ['Save number', 'Guardar número', 'Salvar número'],
    saved: ['Saved. The next invoice will be {number}.', 'Guardado. La próxima factura será la {number}.', 'Salvo. A próxima fatura será a {number}.'],
    notCp: [
      'This project is not numbered CP-<client>-<NNN> yet. The invoice-number format is set per issuer under Billing → Setup → Numbering.',
      'Este proyecto aún no usa la numeración CP-<cliente>-<NNN>. El formato se configura por emisor en Facturación → Configuración → Numeración.',
      'Este projeto ainda não usa a numeração CP-<cliente>-<NNN>. O formato é definido por emissor em Faturamento → Configuração → Numeração.',
    ],
    ownerOnly: ['Only the owner can change the number.', 'Solo el propietario puede cambiar el número.', 'Somente o proprietário pode alterar o número.'],
  } as const;
  const index = $derived(locale === 'es' ? 1 : locale === 'pt' ? 2 : 0);
  const c = (key: keyof typeof copy) => copy[key][index];
  const pad = (value: number) => String(value).padStart(3, '0');
  let value = $state('');
  let saving = $state(false);
  const result = $derived(form && form.action === 'setInvoiceCounter' ? form : null);
  const typed = $derived(
    /^\d{1,6}$/u.test(value.trim()) && Number(value) > 0 ? `${counter.stem}-${pad(Number(value))}` : null,
  );
  // A lower or already used number is refused: the hint keeps showing the real next number.
  const typedFree = $derived(
    typed !== null && Number(value) >= counter.minimumSequence && !counter.usedNumbers.includes(typed),
  );
  const preview = $derived(typedFree && typed ? typed : counter.nextNumber);
</script>

<section class="invoice-counter" id="project-invoice-counter" data-project-invoice-counter>
  <h3>{c('title')}</h3>
  {#if !counter.applies}
    <p class="invoice-counter__hint">{c('notCp')}</p>
  {/if}
  <p class="invoice-counter__next">
    <span>{c('next')}:</span>
    <strong data-invoice-counter-next>{counter.nextNumber}</strong>
  </p>
  {#if counter.usedNumbers.length}
    <p class="invoice-counter__hint">{c('used')}: {counter.usedNumbers.join(', ')}</p>
  {/if}
  {#if canEdit && counter.applies}
    <form
      method="POST"
      action="?/setInvoiceCounter&tab=billing"
      use:enhance={() => {
        saving = true;
        return async ({ update }) => {
          await update({ reset: false });
          saving = false;
        };
      }}
    >
      <label for="invoice-counter-next">{c('change')}</label>
      <div class="invoice-counter__row">
        <span aria-hidden="true">{counter.stem}-</span>
        <input
          id="invoice-counter-next"
          name="nextSequence"
          inputmode="numeric"
          pattern={'[0-9]{1,6}'}
          required
          placeholder={pad(counter.minimumSequence)}
          bind:value
          aria-describedby="invoice-counter-hint"
        />
        <button type="submit" class="primary-button" disabled={saving}>{c('save')}</button>
      </div>
      <p id="invoice-counter-hint" class="invoice-counter__hint">{c('hint')}</p>
      <p class="invoice-counter__preview" aria-live="polite">
        {#if typed && !typedFree}{c('notFree').replace('{number}', typed)}{' '}{/if}{c('willBe').replace('{number}', preview)}
      </p>
    </form>
  {:else if !canEdit}
    <p class="invoice-counter__hint">{c('ownerOnly')}</p>
  {/if}
  {#if result}
    {#if result.success}
      <p class="invoice-counter__ok" role="status">
        {c('saved').replace('{number}', String(result.counterNumber ?? counter.nextNumber))}
      </p>
    {:else}
      <p class="invoice-counter__error" role="alert">{String(result.counterMessage ?? result.message ?? '')}</p>
    {/if}
  {/if}
</section>

<style>
  .invoice-counter {
    border: 1px solid var(--border, #d9d4c7);
    border-radius: 8px;
    padding: 0.75rem 1rem;
    margin-block: 0 1rem;
  }
  .invoice-counter h3 {
    margin: 0 0 0.5rem;
    font-size: 1rem;
  }
  .invoice-counter__next {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
    margin: 0 0 0.5rem;
  }
  .invoice-counter__row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem;
  }
  .invoice-counter__row input {
    width: 6rem;
    min-height: 44px;
  }
  .invoice-counter__row button {
    min-height: 44px;
  }
  .invoice-counter label {
    display: block;
    font-weight: 600;
    margin-block: 0.5rem 0.25rem;
  }
  .invoice-counter__hint {
    color: var(--muted, #5f5a4f);
    font-size: 0.875rem;
    margin: 0.25rem 0;
    overflow-wrap: anywhere;
  }
  .invoice-counter__preview {
    margin: 0.25rem 0 0;
    font-weight: 600;
  }
  .invoice-counter__ok {
    color: var(--success, #1f6b3a);
  }
  .invoice-counter__error {
    color: var(--danger, #a12a1f);
  }
</style>
