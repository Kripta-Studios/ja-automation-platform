/** Accent- and case-insensitive matching shared by all entity pickers. */
export function normalizeSelectSearch(value: string): string {
  return value.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase().trim();
}

const entityName =
  /project|client|worker|user|supplier|technician|email|mailbox|recipient|contact|coordinator|assignee|proyecto|cliente|trabajador|correo|proveedor|projeto|trabalhador|fornecedor/i;

/** Progressive enhancement retains the native select, its binding, and form submission. */
export function installSearchableSelects(root: HTMLElement): () => void {
  const active = new Map<HTMLSelectElement, { cleanup: () => void; refresh: () => void }>();
  let nextId = 0;
  const enhance = (select: HTMLSelectElement) => {
    if (active.has(select) || select.dataset.searchable === 'false') return;
    const originalLabel = select.labels?.[0];
    const labelCopy = originalLabel?.cloneNode(true) as HTMLElement | undefined;
    labelCopy?.querySelectorAll('select,input,textarea,button').forEach((node) => node.remove());
    const labelText =
      labelCopy?.textContent?.trim().replace(/\s+/g, ' ') ||
      select.getAttribute('aria-label') ||
      select.name;
    if (!entityName.test(`${select.name} ${select.id} ${labelText}`) && select.options.length < 10)
      return;
    // An explicit label prevents inserting another control from changing the original association.
    if (!select.id) select.id = `searchable-select-${++nextId}`;
    if (originalLabel) originalLabel.htmlFor = select.id;
    const anchor = originalLabel?.contains(select) ? originalLabel : select;
    const wrapper = document.createElement('div');
    wrapper.className = 'searchable-select-field';
    anchor.before(wrapper);
    wrapper.append(anchor);
    const searchLabel = document.createElement('label');
    searchLabel.className = 'searchable-select-search';
    const caption = document.createElement('span');
    const input = document.createElement('input');
    input.type = 'search';
    input.autocomplete = 'off';
    input.setAttribute('aria-controls', select.id);
    input.dataset.selectSearch = select.id;
    const status = document.createElement('small');
    status.setAttribute('role', 'status');
    status.id = `${select.id}-search-results`;
    input.setAttribute('aria-describedby', status.id);
    searchLabel.append(caption, input);
    wrapper.prepend(searchLabel, status);
    const initialHidden = new WeakMap<HTMLOptionElement, boolean>();
    const refresh = () => {
      const language = document.documentElement.lang.slice(0, 2);
      const prefix = language === 'es' ? 'Buscar' : language === 'pt' ? 'Pesquisar' : 'Search';
      const captionText = `${prefix}: ${labelText.split(/\s{2,}/)[0]}`;
      if (caption.textContent !== captionText) caption.textContent = captionText;
      input.disabled = select.disabled;
      const query = normalizeSelectSearch(input.value);
      let matches = 0;
      for (const option of select.options) {
        if (!initialHidden.has(option)) initialHidden.set(option, Boolean(option.hidden));
        const match = normalizeSelectSearch(`${option.label} ${option.value}`).includes(query);
        if (match && option.value && !option.disabled) matches++;
        // Keep the current selection available, so filtering cannot silently change form data.
        option.hidden =
          initialHidden.get(option)! || (Boolean(query) && !match && !option.selected);
      }
      const message = query
        ? `${matches} ${language === 'es' ? 'resultados' : language === 'pt' ? 'resultados' : 'results'}`
        : '';
      if (status.textContent !== message) status.textContent = message;
    };
    const reset = () => {
      input.value = '';
      refresh();
    };
    input.addEventListener('input', refresh);
    select.addEventListener('change', refresh);
    select.form?.addEventListener('reset', reset);
    active.set(select, {
      refresh,
      cleanup: () => {
        input.removeEventListener('input', refresh);
        select.removeEventListener('change', refresh);
        select.form?.removeEventListener('reset', reset);
        for (const option of select.options) option.hidden = initialHidden.get(option) ?? false;
        if (anchor.isConnected) wrapper.before(anchor);
        wrapper.remove();
      },
    });
    refresh();
  };
  const scan = () => {
    for (const [select, entry] of active) {
      if (!select.isConnected) {
        entry.cleanup();
        active.delete(select);
      } else entry.refresh();
    }
    for (const select of root.querySelectorAll('select')) enhance(select);
  };
  const observer = new MutationObserver(scan);
  scan();
  observer.observe(root, { subtree: true, childList: true });
  return () => {
    observer.disconnect();
    for (const entry of active.values()) entry.cleanup();
    active.clear();
  };
}
