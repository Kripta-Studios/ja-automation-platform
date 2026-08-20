import { beforeEach, describe, expect, it } from 'vitest';

type Listener = (event: FakeEvent) => void;

type ValidationModule = Record<string, unknown>;

async function loadValidationModule(): Promise<{ module?: ValidationModule; error?: unknown }> {
  const runtimePath = ['./', 'form-validation.ts'].join('');
  try {
    return {
      module: (await import(/* @vite-ignore */ runtimePath)) as ValidationModule,
    };
  } catch (error) {
    return { error };
  }
}

class FakeEvent {
  defaultPrevented = false;
  currentTarget: FakeNode;
  constructor(
    readonly type: string,
    readonly target: FakeNode,
  ) {
    this.currentTarget = target;
  }

  preventDefault(): void {
    this.defaultPrevented = true;
  }
}

class FakeNode {
  readonly attributes = new Map<string, string>();
  readonly children: FakeNode[] = [];
  readonly listeners = new Map<string, Listener[]>();
  readonly classList = new Set<string>();
  parentElement: FakeNode | null = null;
  textContent = '';
  private rawInnerHTML = '';
  value = '';
  private requiredState = false;
  invalid = false;
  validationMessage = '';
  tabIndex = 0;
  readonly ownerDocument: FakeDocument;

  get parentNode(): FakeNode | null {
    return this.parentElement;
  }

  get firstElementChild(): FakeNode | null {
    return this.children[0] ?? null;
  }

  get nextSibling(): FakeNode | null {
    if (!this.parentElement) return null;
    const index = this.parentElement.children.indexOf(this);
    return index >= 0 ? (this.parentElement.children[index + 1] ?? null) : null;
  }

  get form(): FakeForm | null {
    const owner = this.closest('form');
    return owner instanceof FakeForm ? owner : null;
  }

  get className(): string {
    return [...this.classList].join(' ');
  }

  set className(value: string) {
    this.classList.clear();
    for (const token of value.split(/\s+/).filter(Boolean)) this.classList.add(token);
  }

  get innerHTML(): string {
    return this.rawInnerHTML;
  }

  set innerHTML(value: string) {
    this.rawInnerHTML = value;
    this.children.splice(0);
    this.textContent = value
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  constructor(
    readonly tagName: string,
    ownerDocument: FakeDocument,
  ) {
    this.ownerDocument = ownerDocument;
  }

  get id(): string {
    return this.getAttribute('id') ?? '';
  }

  set id(value: string) {
    this.setAttribute('id', value);
  }

  get name(): string {
    return this.getAttribute('name') ?? '';
  }

  set name(value: string) {
    this.setAttribute('name', value);
  }

  get required(): boolean {
    return this.requiredState;
  }

  set required(value: boolean) {
    this.requiredState = value;
    if (value) this.setAttribute('required', '');
    else this.removeAttribute('required');
  }

  get validity(): { valid: boolean } {
    return { valid: !this.invalid };
  }

  get willValidate(): boolean {
    return this.tagName !== 'DIV';
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }

  hasAttribute(name: string): boolean {
    return this.attributes.has(name);
  }

  removeAttribute(name: string): void {
    this.attributes.delete(name);
  }

  appendChild(child: FakeNode): FakeNode {
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  append(...children: FakeNode[]): void {
    for (const child of children) this.appendChild(child);
  }

  insertBefore(child: FakeNode, reference: FakeNode | null): FakeNode {
    if (!reference) return this.appendChild(child);
    const index = this.children.indexOf(reference);
    if (index < 0) return this.appendChild(child);
    child.parentElement = this;
    this.children.splice(index, 0, child);
    return child;
  }

  replaceChildren(...children: FakeNode[]): void {
    this.children.splice(0);
    for (const child of children) this.appendChild(child);
  }

  prepend(child: FakeNode): void {
    child.parentElement = this;
    this.children.unshift(child);
  }

  remove(): void {
    if (!this.parentElement) return;
    const index = this.parentElement.children.indexOf(this);
    if (index >= 0) this.parentElement.children.splice(index, 1);
    this.parentElement = null;
  }

  focus(): void {
    this.ownerDocument.activeElement = this;
  }

  blur(): void {
    if (this.ownerDocument.activeElement === this) this.ownerDocument.activeElement = null;
  }

  addEventListener(type: string, listener: Listener): void {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: Listener): void {
    const listeners = this.listeners.get(type) ?? [];
    this.listeners.set(
      type,
      listeners.filter((candidate) => candidate !== listener),
    );
  }

  dispatchEvent(event: FakeEvent): boolean {
    event.currentTarget = this;
    for (const listener of this.listeners.get(event.type) ?? []) listener(event);
    if (this.parentElement) this.parentElement.dispatchEvent(event);
    return !event.defaultPrevented;
  }

  checkValidity(): boolean {
    return !this.invalid;
  }

  reportValidity(): boolean {
    return this.checkValidity();
  }

  contains(node: FakeNode | null): boolean {
    if (!node) return false;
    return node === this || this.children.some((child) => child.contains(node));
  }

  closest(selector: string): FakeNode | null {
    if (this.matches(selector)) return this;
    return this.parentElement?.closest(selector) ?? null;
  }

  querySelector(selector: string): FakeNode | null {
    return this.querySelectorAll(selector)[0] ?? null;
  }

  querySelectorAll(selector: string): FakeNode[] {
    const selectors = selector
      .split(',')
      .map((value) => value.trim().split(/\s+/).at(-1) ?? value.trim());
    const matches: FakeNode[] = [];
    const visit = (node: FakeNode): void => {
      if (selectors.some((candidate) => node.matches(candidate))) matches.push(node);
      for (const child of node.children) visit(child);
    };
    for (const child of this.children) visit(child);
    return matches;
  }

  matches(selector: string): boolean {
    if (selector === ':invalid') return this.invalid;
    if (selector === '[required]') return this.required;
    if (selector === 'input, select, textarea')
      return ['INPUT', 'SELECT', 'TEXTAREA'].includes(this.tagName);
    if (selector === 'form') return this.tagName === 'FORM';
    if (/^(input|select|textarea|button)$/i.test(selector))
      return this.tagName === selector.toUpperCase();
    if (selector === '[data-validation-summary]')
      return this.hasAttribute('data-validation-summary');
    if (selector === '[data-field-error-for]') return this.hasAttribute('data-field-error-for');
    const attribute = selector.match(/^\[([^=\]]+)(?:=["']?([^\]"']+)["']?)?\]$/);
    if (attribute) {
      const attributeName = attribute[1];
      const expectedValue = attribute[2];
      if (!attributeName) return false;
      return (
        this.getAttribute(attributeName) !== null &&
        (expectedValue === undefined || this.getAttribute(attributeName) === expectedValue)
      );
    }
    const fieldError = selector.match(/^\[data-field-error-for=["']([^"']+)["']\]$/);
    if (fieldError) return this.getAttribute('data-field-error-for') === fieldError[1];
    const id = selector.match(/^#(.+)$/);
    if (id) return this.id === id[1];
    return false;
  }
}

class FakeForm extends FakeNode {
  nativeSubmitCalls = 0;

  constructor(ownerDocument: FakeDocument) {
    super('FORM', ownerDocument);
  }

  get elements(): FakeNode[] {
    return this.querySelectorAll('input, select, textarea');
  }

  override checkValidity(): boolean {
    return this.elements.every((element) => !element.required || !element.invalid);
  }

  submit(): void {
    this.nativeSubmitCalls += 1;
  }
}

class FakeDocument {
  activeElement: FakeNode | null = null;
  readonly body: FakeNode;
  readonly documentElement: FakeNode;

  constructor() {
    this.body = new FakeNode('BODY', this);
    this.documentElement = new FakeNode('HTML', this);
    this.documentElement.appendChild(this.body);
  }

  createElement(tagName: string): FakeNode {
    return new FakeNode(tagName.toUpperCase(), this);
  }

  createTextNode(text: string): FakeNode {
    const node = new FakeNode('#TEXT', this);
    node.textContent = text;
    return node;
  }

  getElementById(id: string): FakeNode | null {
    return this.documentElement.querySelector(`#${id}`);
  }
}

async function formValidationAction(): Promise<(form: HTMLFormElement) => unknown> {
  const loaded = await loadValidationModule();
  expect(loaded.error, 'form-validation.ts must be loadable by the test harness').toBeUndefined();
  const exports = loaded.module ?? {};
  const action =
    exports.formValidation ??
    exports.enhanceFormValidation ??
    exports.attachFormValidation ??
    exports.default;
  expect(typeof action, 'form-validation.ts must export a Svelte action/helper').toBe('function');
  return action as (form: HTMLFormElement) => unknown;
}

describe('progressive form validation contract', () => {
  let documentFixture: FakeDocument;

  beforeEach(() => {
    documentFixture = new FakeDocument();
    (globalThis as Record<string, unknown>).document = documentFixture;
    (globalThis as Record<string, unknown>).HTMLFormElement = FakeForm;
    (globalThis as Record<string, unknown>).HTMLInputElement = FakeNode;
    (globalThis as Record<string, unknown>).HTMLSelectElement = FakeNode;
    (globalThis as Record<string, unknown>).HTMLTextAreaElement = FakeNode;
    (globalThis as Record<string, unknown>).window = {
      document: documentFixture,
      setTimeout,
      clearTimeout,
    };
    (globalThis as Record<string, unknown>).requestAnimationFrame = (callback: () => void) => {
      callback();
      return 1;
    };
  });

  it('prevents invalid submission and creates one summary plus one error per invalid control', async () => {
    const form = new FakeForm(documentFixture);
    form.setAttribute('method', 'POST');
    form.setAttribute('action', '?/save');
    const firstInvalid = new FakeNode('INPUT', documentFixture);
    firstInvalid.id = 'summary';
    firstInvalid.name = 'summary';
    firstInvalid.required = true;
    firstInvalid.invalid = true;
    firstInvalid.validationMessage = 'Summary is required';
    const secondInvalid = new FakeNode('TEXTAREA', documentFixture);
    secondInvalid.id = 'tasks';
    secondInvalid.name = 'tasksCompleted';
    secondInvalid.required = true;
    secondInvalid.invalid = true;
    secondInvalid.validationMessage = 'Tasks are required';
    const valid = new FakeNode('TEXTAREA', documentFixture);
    valid.id = 'site';
    valid.name = 'siteShift';
    valid.value = 'Previously entered valid work';
    const serverMessage = new FakeNode('DIV', documentFixture);
    serverMessage.setAttribute('data-server-message', 'true');
    serverMessage.textContent = 'Server form.message must remain truthful';
    form.append(serverMessage, firstInvalid, secondInvalid, valid);

    const action = await formValidationAction();
    let postCount = 0;
    const submitEvent = new FakeEvent('submit', form);
    const cleanup = action(form as unknown as HTMLFormElement);
    form.dispatchEvent(submitEvent);
    if (!submitEvent.defaultPrevented) {
      postCount += 1;
      form.submit();
    }

    expect(submitEvent.defaultPrevented).toBe(true);
    expect(postCount).toBe(0);
    expect(form.querySelectorAll('[data-validation-summary]')).toHaveLength(1);
    const summary = form.querySelector('[data-validation-summary]');
    expect(summary?.getAttribute('role')).toBe('alert');
    expect(summary?.textContent).toContain('Summary is required');
    expect(summary?.textContent).toContain('Tasks are required');
    expect(form.querySelectorAll('[data-field-error-for="summary"]')).toHaveLength(1);
    expect(form.querySelectorAll('[data-field-error-for="tasks"]')).toHaveLength(1);
    expect(firstInvalid.getAttribute('aria-invalid')).toBe('true');
    expect(secondInvalid.getAttribute('aria-invalid')).toBe('true');
    const firstError = form.querySelector('[data-field-error-for="summary"]');
    const secondError = form.querySelector('[data-field-error-for="tasks"]');
    expect(firstInvalid.getAttribute('aria-describedby')).toContain(firstError?.id ?? '');
    expect(secondInvalid.getAttribute('aria-describedby')).toContain(secondError?.id ?? '');
    expect(documentFixture.activeElement).toBe(firstInvalid);
    expect(valid.value).toBe('Previously entered valid work');
    expect(serverMessage.textContent).toBe('Server form.message must remain truthful');
    expect(form.getAttribute('method')).toBe('POST');
    expect(form.getAttribute('action')).toBe('?/save');
    expect(form.nativeSubmitCalls).toBe(0);
    expect(typeof cleanup === 'function' || Boolean(cleanup && typeof cleanup === 'object')).toBe(
      true,
    );

    const secondSubmit = new FakeEvent('submit', form);
    form.dispatchEvent(secondSubmit);
    expect(secondSubmit.defaultPrevented).toBe(true);
    expect(form.querySelectorAll('[data-validation-summary]')).toHaveLength(1);
    expect(form.querySelectorAll('[data-field-error-for="summary"]')).toHaveLength(1);
    expect(form.querySelectorAll('[data-field-error-for="tasks"]')).toHaveLength(1);
  });

  it('allows valid submission without preventing SvelteKit method/action/value pass-through', async () => {
    const form = new FakeForm(documentFixture);
    form.setAttribute('method', 'POST');
    form.setAttribute('action', '?/save');
    const valid = new FakeNode('INPUT', documentFixture);
    valid.id = 'site';
    valid.name = 'siteShift';
    valid.value = 'Existing valid value';
    const validSelect = new FakeNode('SELECT', documentFixture);
    validSelect.id = 'currency';
    validSelect.name = 'currency';
    validSelect.value = 'EUR';
    const serverMessage = new FakeNode('DIV', documentFixture);
    serverMessage.setAttribute('data-server-message', 'true');
    serverMessage.textContent = 'Server form.message remains unchanged';
    form.append(serverMessage, valid, validSelect);
    const action = await formValidationAction();
    const cleanup = action(form as unknown as HTMLFormElement);
    let postCount = 0;
    const submitEvent = new FakeEvent('submit', form);
    form.dispatchEvent(submitEvent);
    if (!submitEvent.defaultPrevented) {
      postCount += 1;
      form.submit();
    }

    expect(submitEvent.defaultPrevented).toBe(false);
    expect(postCount).toBe(1);
    expect(form.nativeSubmitCalls).toBe(1);
    expect(form.getAttribute('method')).toBe('POST');
    expect(form.getAttribute('action')).toBe('?/save');
    expect(valid.value).toBe('Existing valid value');
    expect(validSelect.value).toBe('EUR');
    expect(serverMessage.textContent).toBe('Server form.message remains unchanged');
    expect(form.querySelector('[data-validation-summary]')).toBeNull();
    if (typeof cleanup === 'function') cleanup();
    else if (
      cleanup &&
      typeof cleanup === 'object' &&
      'destroy' in cleanup &&
      typeof cleanup.destroy === 'function'
    )
      cleanup.destroy();
  });

  it('clears only the corrected field error on input and leaves other invalid fields visible', async () => {
    const form = new FakeForm(documentFixture);
    const first = new FakeNode('INPUT', documentFixture);
    first.id = 'first';
    first.required = true;
    first.invalid = true;
    first.validationMessage = 'First is required';
    const second = new FakeNode('INPUT', documentFixture);
    second.id = 'second';
    second.required = true;
    second.invalid = true;
    second.validationMessage = 'Second is required';
    form.appendChild(first);
    form.appendChild(second);
    const action = await formValidationAction();
    const cleanup = action(form as unknown as HTMLFormElement);
    form.dispatchEvent(new FakeEvent('submit', form));
    expect(form.querySelectorAll('[data-field-error-for="first"]')).toHaveLength(1);
    expect(form.querySelectorAll('[data-field-error-for="second"]')).toHaveLength(1);

    first.invalid = false;
    first.value = 'corrected';
    first.dispatchEvent(new FakeEvent('input', first));
    expect(form.querySelector('[data-field-error-for="first"]')).toBeNull();
    expect(form.querySelector('[data-field-error-for="second"]')).not.toBeNull();
    expect(first.getAttribute('aria-invalid')).not.toBe('true');
    if (typeof cleanup === 'function') cleanup();
    else if (
      cleanup &&
      typeof cleanup === 'object' &&
      'destroy' in cleanup &&
      typeof cleanup.destroy === 'function'
    )
      cleanup.destroy();
  });

  it('handles a native invalid event once with one summary, one error and focus', async () => {
    const form = new FakeForm(documentFixture);
    const invalid = new FakeNode('INPUT', documentFixture);
    invalid.name = 'summary';
    invalid.required = true;
    invalid.invalid = true;
    invalid.validationMessage = 'Summary is required';
    form.appendChild(invalid);
    documentFixture.body.appendChild(form);

    const action = await formValidationAction();
    action(form as unknown as HTMLFormElement);

    invalid.dispatchEvent(new FakeEvent('invalid', invalid));
    invalid.dispatchEvent(new FakeEvent('invalid', invalid));
    await new Promise<void>((resolve) => queueMicrotask(resolve));

    const summary = form.querySelector('[data-validation-summary]');
    const error = form.querySelector('[data-field-error-for]');
    expect(summary).not.toBeNull();
    expect(form.querySelectorAll('[data-validation-summary]')).toHaveLength(1);
    expect(error).not.toBeNull();
    expect(form.querySelectorAll('[data-field-error-for]')).toHaveLength(1);
    expect(invalid.getAttribute('aria-invalid')).toBe('true');
    expect(invalid.getAttribute('aria-describedby')).toContain(error?.id ?? '');
    expect(documentFixture.activeElement).toBe(invalid);
  });

  it('keeps validation summary and error ids unique across forms with repeated names', async () => {
    const firstForm = new FakeForm(documentFixture);
    const secondForm = new FakeForm(documentFixture);
    const makeInvalid = (): FakeNode => {
      const control = new FakeNode('INPUT', documentFixture);
      control.name = 'status';
      control.required = true;
      control.invalid = true;
      control.validationMessage = 'Status is required';
      return control;
    };
    const firstControl = makeInvalid();
    const secondControl = makeInvalid();
    firstForm.appendChild(firstControl);
    secondForm.appendChild(secondControl);
    documentFixture.body.append(firstForm, secondForm);

    const firstAction = await formValidationAction();
    const secondAction = await formValidationAction();
    firstAction(firstForm as unknown as HTMLFormElement);
    secondAction(secondForm as unknown as HTMLFormElement);
    firstForm.dispatchEvent(new FakeEvent('submit', firstForm));
    secondForm.dispatchEvent(new FakeEvent('submit', secondForm));

    const summaries = documentFixture.body.querySelectorAll('[data-validation-summary]');
    const summaryIds = summaries.map((summary) => summary.id);
    expect(summaries).toHaveLength(2);
    expect(summaryIds.every(Boolean)).toBe(true);
    expect(new Set(summaryIds).size).toBe(summaryIds.length);

    const errors = documentFixture.body.querySelectorAll('[data-field-error-for]');
    const errorIds = errors.map((error) => error.id);
    const controlIds = [firstControl.id, secondControl.id];
    expect(errors).toHaveLength(2);
    expect(errorIds.every(Boolean)).toBe(true);
    expect(new Set(errorIds).size).toBe(errorIds.length);
    expect(controlIds.every(Boolean)).toBe(true);
    expect(new Set(controlIds).size).toBe(controlIds.length);
    expect(firstForm.contains(errors[0] ?? null)).toBe(true);
    expect(secondForm.contains(errors[1] ?? null)).toBe(true);
    expect(firstControl.getAttribute('aria-describedby')?.split(/\s+/)).toContain(
      firstForm.querySelector('[data-field-error-for]')?.id,
    );
    expect(secondControl.getAttribute('aria-describedby')?.split(/\s+/)).toContain(
      secondForm.querySelector('[data-field-error-for]')?.id,
    );
    expect(firstControl.getAttribute('aria-describedby')).not.toContain(secondControl.id);
    expect(secondControl.getAttribute('aria-describedby')).not.toContain(firstControl.id);
  });
});
