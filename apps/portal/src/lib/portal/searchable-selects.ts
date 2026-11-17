/** Accent- and case-insensitive matching shared by all entity pickers. */
export function normalizeSelectSearch(value: string): string {
  return value.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase().trim();
}

/**
 * Suggested-first order for long pickers: the empty "All / none" choice, then
 * the person's recent picks (most recent first), then options the page marks
 * with `data-priority` (e.g. assigned people), then everything else in the
 * original order. Pure so it can be tested; returns indexes into `options`.
 */
export function suggestedOrder(
  options: ReadonlyArray<{ value: string; priority?: boolean }>,
  recent: readonly string[],
): { order: number[]; suggested: number } {
  const rank = (option: { value: string; priority?: boolean }) => {
    if (option.value === '') return [0, 0];
    const position = recent.indexOf(option.value);
    if (position >= 0) return [1, position];
    return option.priority ? [2, 0] : [3, 0];
  };
  const order = options
    .map((option, index) => ({ index, rank: rank(option) }))
    .sort((a, b) => a.rank[0]! - b.rank[0]! || a.rank[1]! - b.rank[1]! || a.index - b.index);
  return {
    order: order.map((item) => item.index),
    suggested: order.filter((item) => item.rank[0] === 1 || item.rank[0] === 2).length,
  };
}

const RECENT_LIMIT = 5;
const recentKey = (select: HTMLSelectElement) =>
  `ja-picker-recent:${location.pathname.split('/').slice(0, 4).join('/')}:${select.name || select.id}`;
function readRecent(select: HTMLSelectElement): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(recentKey(select)) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((value) => typeof value === 'string') : [];
  } catch {
    return [];
  }
}
function rememberRecent(select: HTMLSelectElement, value: string): void {
  if (!value) return;
  try {
    const next = [value, ...readRecent(select).filter((item) => item !== value)].slice(0, RECENT_LIMIT);
    localStorage.setItem(recentKey(select), JSON.stringify(next));
  } catch {
    /* private mode: no memory, normal order */
  }
}
/** Only long, flat pickers are reordered (short lists and grouped lists keep their order). */
const SUGGEST_MIN_OPTIONS = 15;

const entityName =
  /project|client|worker|user|supplier|technician|email|mailbox|recipient|contact|coordinator|assignee|proyecto|cliente|trabajador|correo|proveedor|projeto|trabalhador|fornecedor/i;
let nextId = 0;

/**
 * Keep the real select (labels, required validation, bindings and FormData).
 * Only its open interaction changes: search belongs inside the dropdown.
 * Unsupported browsers retain the native picker without extra form fields.
 */
export function installSearchableSelects(root: HTMLElement): () => void {
  if (typeof HTMLElement.prototype.showPopover !== 'function') return () => {};
  const active = new Map<HTMLSelectElement, { cleanup: () => void; refresh: () => void }>();
  let closeCurrent: (() => void) | undefined;
  const enhance = (select: HTMLSelectElement) => {
    if (
      active.has(select) ||
      select.dataset.searchable === 'false' ||
      select.multiple ||
      select.size > 1
    )
      return;
    const labelCopy = select.labels?.[0]?.cloneNode(true) as HTMLElement | undefined;
    labelCopy?.querySelectorAll('select,input,textarea,button').forEach((node) => node.remove());
    const labelText =
      labelCopy?.textContent?.trim().replace(/\s+/g, ' ') ||
      select.getAttribute('aria-label') ||
      select.name;
    if (!entityName.test(`${select.name} ${select.id} ${labelText}`) && select.options.length < 10)
      return;
    const id = `entity-picker-${++nextId}`;
    const form = select.form;
    const original = {
      expanded: select.getAttribute('aria-expanded'),
      controls: select.getAttribute('aria-controls'),
      popup: select.getAttribute('aria-haspopup'),
    };
    select.dataset.searchablePicker = id;
    select.setAttribute('aria-haspopup', 'dialog');
    select.setAttribute('aria-expanded', 'false');
    select.setAttribute('aria-controls', id);

    const popup = document.createElement('div');
    popup.id = id;
    popup.className = 'searchable-select-popover';
    popup.setAttribute('popover', 'manual');
    popup.setAttribute('role', 'dialog');
    popup.setAttribute('aria-label', labelText);
    const searchRow = document.createElement('div');
    searchRow.className = 'searchable-select-search';
    const input = document.createElement('input');
    input.type = 'search';
    input.disabled = true;
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.setAttribute('role', 'combobox');
    input.setAttribute('aria-autocomplete', 'list');
    input.setAttribute('aria-expanded', 'true');
    input.setAttribute('aria-controls', `${id}-options`);
    input.dataset.selectSearch = id;
    const closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.disabled = true;
    closeButton.className = 'searchable-select-close';
    closeButton.textContent = '×';
    searchRow.append(input, closeButton);
    const list = document.createElement('div');
    list.id = `${id}-options`;
    list.className = 'searchable-select-options';
    list.setAttribute('role', 'listbox');
    list.setAttribute('aria-label', labelText);
    const status = document.createElement('div');
    status.className = 'searchable-select-status';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    popup.append(searchRow, list, status);
    // Stay inside modal accessibility/focus boundaries, while using the top layer
    // to avoid clipping by sheets, tables and collapsed-panel containers.
    (select.closest('[role="dialog"],dialog') ?? root).append(popup);
    let opened = false;
    let highlighted = -1;
    let options: HTMLOptionElement[] = [];
    let optionNodes: HTMLElement[] = [];

    const disabled = (option: HTMLOptionElement) =>
      option.disabled ||
      (option.parentElement instanceof HTMLOptGroupElement && option.parentElement.disabled);
    const copy = () => {
      const language = (
        select.closest('[lang]')?.getAttribute('lang') ?? document.documentElement.lang
      ).slice(0, 2);
      return language === 'es'
        ? {
            search: 'Buscar',
            close: 'Cerrar selector',
            results: 'resultados',
            result: 'resultado',
            empty: 'No hay coincidencias. Prueba con otro nombre.',
            unavailable: 'No hay coincidencias disponibles.',
            suggested: 'Recientes y asignados',
            everyone: 'Todos',
          }
        : language === 'pt'
          ? {
              search: 'Pesquisar',
              close: 'Fechar seletor',
              results: 'resultados',
              result: 'resultado',
              empty: 'Nenhum resultado. Tente outro nome.',
              unavailable: 'Nenhum resultado disponível.',
              suggested: 'Recentes e atribuídos',
              everyone: 'Todos',
            }
          : {
              search: 'Search',
              close: 'Close selector',
              results: 'results',
              result: 'result',
              empty: 'No matches. Try another name.',
              unavailable: 'No available matches.',
              suggested: 'Recent and assigned',
              everyone: 'Everyone',
            };
    };
    const position = () => {
      if (!opened) return;
      const rect = select.getBoundingClientRect();
      const viewport = window.visualViewport;
      const leftEdge = viewport?.offsetLeft ?? 0;
      const topEdge = viewport?.offsetTop ?? 0;
      const width = viewport?.width ?? window.innerWidth;
      const height = viewport?.height ?? window.innerHeight;
      const popupWidth = Math.min(Math.max(rect.width, 300), width - 16);
      const below = topEdge + height - rect.bottom - 12;
      const above = rect.top - topEdge - 12;
      const useAbove = below < 220 && above > below;
      const maxHeight = Math.max(100, Math.min(360, useAbove ? above : below, height - 16));
      popup.style.width = `${popupWidth}px`;
      popup.style.maxHeight = `${maxHeight}px`;
      popup.style.left = `${Math.max(leftEdge + 8, Math.min(rect.left, leftEdge + width - popupWidth - 8))}px`;
      const actualHeight = Math.min(popup.scrollHeight, maxHeight);
      popup.style.top = `${Math.max(topEdge + 8, Math.min(useAbove ? rect.top - actualHeight - 6 : rect.bottom + 6, topEdge + height - actualHeight - 8))}px`;
    };
    const highlight = (index: number) => {
      highlighted = index;
      optionNodes.forEach((node, i) => node.classList.toggle('is-highlighted', i === index));
      const node = optionNodes[index];
      if (node) {
        input.setAttribute('aria-activedescendant', node.id);
        node.scrollIntoView({ block: 'nearest' });
      } else input.removeAttribute('aria-activedescendant');
    };
    const render = () => {
      const text = copy();
      input.placeholder = `${text.search}…`;
      input.setAttribute('aria-label', `${text.search}: ${labelText}`);
      closeButton.setAttribute('aria-label', text.close);
      const query = normalizeSelectSearch(input.value);
      options = Array.from(select.options).filter(
        (option) =>
          !option.hidden &&
          !option.parentElement?.hidden &&
          normalizeSelectSearch(`${option.label} ${option.value}`).includes(query),
      );
      // Long flat pickers (e.g. 100+ workers): recent and assigned choices first.
      let suggested = 0;
      if (
        select.options.length >= SUGGEST_MIN_OPTIONS &&
        !select.querySelector('optgroup')
      ) {
        const ranked = suggestedOrder(
          options.map((option) => ({ value: option.value, priority: 'priority' in option.dataset })),
          readRecent(select),
        );
        options = ranked.order.map((index) => options[index]!);
        suggested = ranked.suggested;
      }
      const firstSuggested = options.findIndex((option) => option.value !== '');
      list.replaceChildren();
      optionNodes = [];
      let lastGroup: HTMLElement | null = null;
      for (const [index, option] of options.entries()) {
        if (suggested && (index === firstSuggested || index === firstSuggested + suggested)) {
          const heading = document.createElement('div');
          heading.className = 'searchable-select-group';
          heading.setAttribute('role', 'presentation');
          heading.textContent = index === firstSuggested ? text.suggested : text.everyone;
          list.append(heading);
        }
        if (
          option.parentElement instanceof HTMLOptGroupElement &&
          lastGroup !== option.parentElement
        ) {
          const heading = document.createElement('div');
          heading.className = 'searchable-select-group';
          heading.setAttribute('role', 'presentation');
          heading.textContent = option.parentElement.label;
          list.append(heading);
        }
        lastGroup = option.parentElement;
        const node = document.createElement('div');
        node.id = `${id}-option-${index}`;
        node.className = 'searchable-select-option';
        node.setAttribute('role', 'option');
        node.setAttribute('aria-selected', String(option.selected));
        node.setAttribute('aria-disabled', String(disabled(option)));
        const caption = document.createElement('span');
        caption.textContent = option.label;
        const check = document.createElement('span');
        check.className = 'searchable-select-check';
        check.setAttribute('aria-hidden', 'true');
        check.textContent = option.selected ? '✓' : '';
        node.append(caption, check);
        node.addEventListener('pointerdown', (event) => event.preventDefault());
        node.addEventListener('click', () => choose(index));
        node.addEventListener('pointermove', () => {
          if (!disabled(option)) highlight(index);
        });
        list.append(node);
        optionNodes.push(node);
      }
      const matches = options.filter((option) => !disabled(option)).length;
      status.textContent = matches
        ? `${matches} ${matches === 1 ? text.result : text.results}`
        : options.length
          ? text.unavailable
          : text.empty;
      highlight(options.findIndex((option) => !disabled(option) && option.selected));
      if (highlighted < 0) highlight(options.findIndex((option) => !disabled(option)));
      position();
    };
    const close = (restoreFocus = false) => {
      if (!opened) return;
      opened = false;
      stopListening();
      input.disabled = true;
      closeButton.disabled = true;
      if (popup.matches(':popover-open')) popup.hidePopover();
      select.setAttribute('aria-expanded', 'false');
      if (closeCurrent === dismiss) closeCurrent = undefined;
      if (restoreFocus && select.isConnected) select.focus({ preventScroll: true });
    };
    const dismiss = () => close();
    const choose = (index: number) => {
      const option = options[index];
      if (!option || disabled(option) || select.disabled) return;
      const changed = select.value !== option.value;
      select.value = option.value;
      if (select.options.length >= SUGGEST_MIN_OPTIONS) rememberRecent(select, option.value);
      close(true);
      if (changed) {
        select.dispatchEvent(new Event('input', { bubbles: true }));
        select.dispatchEvent(new Event('change', { bubbles: true }));
      }
    };
    const open = (query = '') => {
      if (select.disabled || !select.isConnected) return;
      closeCurrent?.();
      closeCurrent = dismiss;
      input.value = query;
      opened = true;
      listenWhileOpen();
      input.disabled = false;
      closeButton.disabled = false;
      select.setAttribute('aria-expanded', 'true');
      popup.showPopover();
      render();
      input.focus({ preventScroll: true });
    };
    const onPointer = (event: PointerEvent) => {
      if (event.button !== 0 || select.disabled) return;
      event.preventDefault();
      if (opened) close(true);
      else open();
    };
    // Prevent the native menu on mouse browsers after pointerdown, retaining
    // the select itself for screen readers, validation and non-JS fallback.
    const preventNativeMenu = (event: MouseEvent) => {
      if (!select.disabled) event.preventDefault();
    };
    const onClick = (event: MouseEvent) => {
      if (select.disabled) return;
      event.preventDefault();
      // Assistive technologies can activate a control without pointer events.
      if (event.detail === 0 && !opened) open();
    };
    const onSelectKey = (event: KeyboardEvent) => {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) {
        event.preventDefault();
        open();
      } else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
        event.preventDefault();
        open(event.key);
      }
    };
    const onPopupKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        close(true);
      } else if (event.key === 'Tab') close(true);
      else if (
        event.target === input &&
        ['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)
      ) {
        if (['Home', 'End'].includes(event.key) && !event.ctrlKey) return;
        event.preventDefault();
        const indexes = options.flatMap((option, index) => (disabled(option) ? [] : [index]));
        const current = indexes.indexOf(highlighted);
        const next =
          event.key === 'Home'
            ? indexes[0]
            : event.key === 'End'
              ? indexes.at(-1)
              : indexes[
                  (current + (event.key === 'ArrowDown' ? 1 : -1) + indexes.length) % indexes.length
                ];
        highlight(next ?? -1);
      } else if (event.target === input && event.key === 'Enter') {
        event.preventDefault();
        choose(highlighted);
      }
    };
    const onOutside = (event: PointerEvent) => {
      if (opened && event.target !== select && !popup.contains(event.target as Node)) close();
    };
    const onFocus = (event: FocusEvent) => {
      if (opened && event.target !== select && !popup.contains(event.target as Node)) close();
    };
    const refresh = () => {
      if (opened) {
        if (select.disabled) close();
        else render();
      }
    };
    const onReset = () => close();
    const onScroll = (event: Event) => {
      if (!popup.contains(event.target as Node)) position();
    };
    const onClose = () => close(true);
    const listenWhileOpen = () => {
      document.addEventListener('pointerdown', onOutside);
      document.addEventListener('focusin', onFocus);
      document.addEventListener('scroll', onScroll, true);
      window.addEventListener('resize', position);
      window.visualViewport?.addEventListener('resize', position);
      window.visualViewport?.addEventListener('scroll', position);
    };
    const stopListening = () => {
      document.removeEventListener('pointerdown', onOutside);
      document.removeEventListener('focusin', onFocus);
      document.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', position);
      window.visualViewport?.removeEventListener('resize', position);
      window.visualViewport?.removeEventListener('scroll', position);
    };
    input.addEventListener('input', render);
    closeButton.addEventListener('click', onClose);
    select.addEventListener('pointerdown', onPointer);
    select.addEventListener('mousedown', preventNativeMenu);
    select.addEventListener('click', onClick);
    select.addEventListener('keydown', onSelectKey);
    select.addEventListener('change', refresh);
    form?.addEventListener('reset', onReset);
    popup.addEventListener('keydown', onPopupKey);
    active.set(select, {
      refresh,
      cleanup: () => {
        close();
        input.removeEventListener('input', render);
        closeButton.removeEventListener('click', onClose);
        select.removeEventListener('pointerdown', onPointer);
        select.removeEventListener('mousedown', preventNativeMenu);
        select.removeEventListener('click', onClick);
        select.removeEventListener('keydown', onSelectKey);
        select.removeEventListener('change', refresh);
        form?.removeEventListener('reset', onReset);
        popup.removeEventListener('keydown', onPopupKey);
        stopListening();
        delete select.dataset.searchablePicker;
        for (const [attribute, value] of Object.entries({
          'aria-expanded': original.expanded,
          'aria-controls': original.controls,
          'aria-haspopup': original.popup,
        })) {
          if (value === null) select.removeAttribute(attribute);
          else select.setAttribute(attribute, value);
        }
        popup.remove();
      },
    });
  };
  const scan = () => {
    for (const [select, entry] of active) {
      if (
        !select.isConnected ||
        select.multiple ||
        select.size > 1 ||
        select.dataset.searchable === 'false'
      ) {
        entry.cleanup();
        active.delete(select);
      } else entry.refresh();
    }
    for (const select of root.querySelectorAll('select')) enhance(select);
  };
  const observer = new MutationObserver((records) => {
    if (
      records.some(
        (record) =>
          !(record.target instanceof Element) ||
          !record.target.closest('.searchable-select-popover'),
      )
    )
      scan();
  });
  scan();
  observer.observe(root, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: [
      'disabled',
      'hidden',
      'label',
      'selected',
      'multiple',
      'size',
      'data-searchable',
    ],
  });
  return () => {
    observer.disconnect();
    for (const entry of active.values()) entry.cleanup();
    active.clear();
  };
}
