import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRawSnippet } from 'svelte';
import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';

type RenderedNode = {
  tagName: string;
  attrs: Map<string, string>;
  children: RenderedNode[];
  text: string;
};

type PrimitiveModule = {
  default?: unknown;
};

const voidTags = new Set([
  'AREA',
  'BASE',
  'BR',
  'COL',
  'EMBED',
  'HR',
  'IMG',
  'INPUT',
  'LINK',
  'META',
  'PARAM',
  'SOURCE',
  'TRACK',
  'WBR',
]);

const child = (markup: string) => createRawSnippet(() => ({ render: () => markup }));

function parseAttributes(source: string): Map<string, string> {
  const attributes = new Map<string, string>();
  const pattern = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  for (const match of source.matchAll(pattern)) {
    const name = match[1] ?? '';
    if (name.startsWith('<!--')) continue;
    attributes.set(name, match[2] ?? match[3] ?? match[4] ?? '');
  }
  return attributes;
}

function parseRendered(body: string): RenderedNode {
  const root: RenderedNode = { tagName: '#ROOT', attrs: new Map(), children: [], text: '' };
  const stack: RenderedNode[] = [root];
  const tokenPattern = /<!--[\s\S]*?-->|<\/?([A-Za-z][\w:-]*)([^>]*)>|([^<]+)/g;

  for (const match of body.matchAll(tokenPattern)) {
    const token = match[0];
    const parent = stack.at(-1)!;
    if (token.startsWith('<!--')) continue;
    if (match[1]) {
      const tagName = match[1].toUpperCase();
      if (token.startsWith('</')) {
        while (stack.length > 1 && stack.at(-1)?.tagName !== tagName) stack.pop();
        if (stack.length > 1) stack.pop();
        continue;
      }
      const node: RenderedNode = {
        tagName,
        attrs: parseAttributes(match[2] ?? ''),
        children: [],
        text: '',
      };
      parent.children.push(node);
      if (!voidTags.has(tagName) && !token.endsWith('/>')) stack.push(node);
      continue;
    }
    parent.text += match[3] ?? '';
  }

  return root;
}

function descendants(node: RenderedNode): RenderedNode[] {
  return [node, ...node.children.flatMap(descendants)];
}

function textContent(node: RenderedNode): string {
  return `${node.text}${node.children.map(textContent).join('')}`.replace(/\s+/g, ' ').trim();
}

function findByAttribute(root: RenderedNode, attribute: string, value?: string): RenderedNode[] {
  return descendants(root).filter((node) => {
    const actual = node.attrs.get(attribute);
    return actual !== undefined && (value === undefined || actual === value);
  });
}

function requireUi(root: RenderedNode, ui: string): RenderedNode {
  const node = findByAttribute(root, 'data-ui', ui)[0];
  expect(node, `expected data-ui="${ui}"`).toBeDefined();
  return node!;
}

function expectForwardedData(root: RenderedNode, attribute: string, value: string): void {
  expect(root.attrs.get(attribute), `${attribute} must be forwarded`).toBe(value);
}

function expectForwardedClass(root: RenderedNode, className: string): void {
  expect(root.attrs.get('class')?.split(/\s+/), 'class must be forwarded').toContain(className);
}

function expectLabelledSurface(root: RenderedNode, title: string): void {
  const headingId = root.attrs.get('aria-labelledby');
  expect(headingId, 'titled surfaces need aria-labelledby').toBeTruthy();
  const heading = findByAttribute(root, 'id', headingId)[0];
  expect(heading, 'aria-labelledby must reference a rendered heading').toBeDefined();
  expect(heading?.tagName).toMatch(/^H[1-6]$/);
  expect(textContent(heading!)).toContain(title);
}

function expectNamedSurface(root: RenderedNode): void {
  const ariaLabel = root.attrs.get('aria-label')?.trim();
  const labelledBy = root.attrs.get('aria-labelledby')?.trim();
  const labelledHeading = labelledBy
    ? findByAttribute(root, 'id', labelledBy).find((node) => /^H[1-6]$/.test(node.tagName))
    : undefined;
  expect(
    Boolean(ariaLabel || (labelledHeading && textContent(labelledHeading).length > 0)),
    'surface must expose an accessible name',
  ).toBe(true);
}

function realCardLabelNodes(cell: RenderedNode, label: string): RenderedNode[] {
  return descendants(cell).filter((node) => {
    if (node === cell || node.attrs.has('data-label')) return false;
    const role = node.attrs.get('role');
    const semanticTag = ['DT', 'TH'].includes(node.tagName);
    const semanticRole = ['columnheader', 'rowheader', 'term'].includes(role ?? '');
    const explicitAria = node.attrs.get('aria-label')?.trim() === label;
    const explicitCardLabel =
      node.attrs.has('data-card-semantic-label') && textContent(node).trim() === label;
    return (
      ((semanticTag || semanticRole) && textContent(node) === label) ||
      explicitAria ||
      explicitCardLabel
    );
  });
}

function realCardValueNodes(cell: RenderedNode, value: string): RenderedNode[] {
  return descendants(cell).filter(
    (node) =>
      node !== cell &&
      !node.attrs.has('data-label') &&
      textContent(node).trim() === value &&
      !node.attrs.has('data-card-semantic-label'),
  );
}

function expectCardCellContent(cell: RenderedNode, label: string, value: string): void {
  const labels = realCardLabelNodes(cell, label);
  const values = realCardValueNodes(cell, value);
  expect(labels, `card cell needs a real DOM/ARIA label: ${label}`).not.toHaveLength(0);
  expect(values, `card cell needs a real DOM value: ${value}`).not.toHaveLength(0);
  const ordered = descendants(cell);
  expect(ordered.indexOf(labels[0]!), 'card label must be in the cell DOM').toBeGreaterThan(0);
  expect(ordered.indexOf(values[0]!), 'card value must be in the cell DOM').toBeGreaterThan(0);
  expect(ordered.indexOf(labels[0]!)).toBeLessThan(ordered.indexOf(values[0]!));
}

function referencedNodes(root: RenderedNode, attribute: string): RenderedNode[] {
  return (root.attrs.get(attribute) ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .flatMap((id) => findByAttribute(root, 'id', id));
}

function expectNonEmptyAccessibleName(root: RenderedNode): void {
  const ariaLabel = root.attrs.get('aria-label')?.trim() ?? '';
  const labelledBy = root.attrs.get('aria-labelledby')?.trim() ?? '';
  const labelledNodes = referencedNodes(root, 'aria-labelledby');
  if (labelledBy) {
    expect(labelledNodes.length, 'aria-labelledby must reference rendered content').toBeGreaterThan(
      0,
    );
    expect(
      labelledNodes.every((node) => textContent(node).length > 0),
      'aria-labelledby references must not resolve to empty content',
    ).toBe(true);
  }
  expect(
    Boolean(ariaLabel || labelledNodes.some((node) => textContent(node).length > 0)),
    'surface must expose a non-empty accessible name',
  ).toBe(true);
}

function primitiveCss(): string {
  const candidates = [
    resolve(process.cwd(), 'src/styles/portal/primitives.css'),
    resolve(process.cwd(), 'apps/portal/src/styles/portal/primitives.css'),
  ];
  const cssPath = candidates.find((candidate) => existsSync(candidate));
  expect(cssPath, 'portal primitive CSS must be available for static target checks').toBeDefined();
  return readFileSync(cssPath!, 'utf8');
}

function cssRuleBody(css: string, selectorPattern: RegExp): string {
  return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/gs)]
    .filter((match) => selectorPattern.test(match[1] ?? ''))
    .map((match) => match[2] ?? '')
    .join('\n');
}

async function loadPrimitive(name: string): Promise<{ module?: PrimitiveModule; error?: unknown }> {
  const runtimePath = `./${name}.svelte`;
  try {
    return { module: (await import(/* @vite-ignore */ runtimePath)) as PrimitiveModule };
  } catch (error) {
    return { error };
  }
}

async function rendered(
  name: string,
  props: Record<string, unknown>,
): Promise<{ body: string; tree: RenderedNode }> {
  const loaded = await loadPrimitive(name);
  expect(loaded.error, `${name}.svelte must be loadable by the test harness`).toBeUndefined();
  expect(['function', 'object'], `${name}.svelte must export a component`).toContain(
    typeof loaded.module?.default,
  );
  const body = render(loaded.module!.default as never, { props } as never).body;
  return { body, tree: parseRendered(body) };
}

async function renderedOrRejected(
  name: string,
  props: Record<string, unknown>,
): Promise<{ tree?: RenderedNode; error?: unknown }> {
  const loaded = await loadPrimitive(name);
  expect(loaded.error, `${name}.svelte must be loadable by the test harness`).toBeUndefined();
  expect(['function', 'object'], `${name}.svelte must export a component`).toContain(
    typeof loaded.module?.default,
  );
  try {
    const body = render(loaded.module!.default as never, { props } as never).body;
    return { tree: parseRendered(body) };
  } catch (error) {
    return { error };
  }
}

describe('portal primitive contracts', () => {
  it('renders a titled SectionCard with a linked heading and forwarded attributes', async () => {
    const { tree } = await rendered('SectionCard', {
      title: 'Field operations',
      class: 'test-card',
      'data-testid': 'section-card-fixture',
      children: child('<p data-child="section">Current operations</p>'),
    });
    const root = requireUi(tree, 'section-card');
    expect(root.attrs.get('class')?.split(/\s+/)).toContain('test-card');
    expectForwardedData(root, 'data-testid', 'section-card-fixture');
    expectLabelledSurface(root, 'Field operations');
    expect(findByAttribute(root, 'data-child', 'section')).toHaveLength(1);
  });

  it('does not let forwarded attrs replace primitive identity, mobile mode or ARIA wiring', async () => {
    const section = await rendered('SectionCard', {
      title: 'Operations',
      'data-ui': 'spoofed-surface',
      'aria-labelledby': 'spoofed-heading',
      'aria-label': 'Spoofed accessible name',
      children: child('<p>Operations content</p>'),
    });
    const sectionRoot = requireUi(section.tree, 'section-card');
    expect(sectionRoot.attrs.get('data-ui')).toBe('section-card');
    expect(sectionRoot.attrs.get('aria-labelledby')).not.toBe('spoofed-heading');
    expect(sectionRoot.attrs.get('aria-label')).not.toBe('Spoofed accessible name');
    expectLabelledSurface(sectionRoot, 'Operations');

    const form = await rendered('FormCard', {
      title: 'Finance',
      'data-ui': 'spoofed-form',
      'aria-labelledby': 'spoofed-form-heading',
      children: child('<form>Finance controls</form>'),
    });
    const formRoot = requireUi(form.tree, 'form-card');
    expect(formRoot.attrs.get('data-ui')).toBe('form-card');
    expect(formRoot.attrs.get('aria-labelledby')).not.toBe('spoofed-form-heading');
    expectLabelledSurface(formRoot, 'Finance');

    const table = await rendered('TableRegion', {
      label: 'Invoice lines',
      mobileMode: 'cards',
      'data-ui': 'spoofed-table',
      'data-mobile-representation': 'scroll',
      'aria-label': 'Spoofed table name',
      'aria-describedby': 'spoofed-instructions',
      cardRows: [
        { id: 'invoice-line-1', cells: [{ label: 'Description', value: 'Invoice line' }] },
      ],
    });
    const tableRoot = requireUi(table.tree, 'table-region');
    expect(tableRoot.attrs.get('data-ui')).toBe('table-region');
    expect(tableRoot.attrs.get('data-mobile-representation')).toBe('cards');
    expect(tableRoot.attrs.get('aria-label')).toBe('Invoice lines');
    expect(tableRoot.attrs.get('aria-describedby')).not.toBe('spoofed-instructions');
  });

  it('renders FormCard and FormSection as titled, non-nested form surfaces', async () => {
    const card = await rendered('FormCard', {
      title: 'Finance configuration',
      class: 'finance-card-fixture',
      'data-testid': 'form-card-fixture',
      children: child('<form data-child="form"><button>Save</button></form>'),
    });
    const cardRoot = requireUi(card.tree, 'form-card');
    expectForwardedClass(cardRoot, 'finance-card-fixture');
    expectForwardedData(cardRoot, 'data-testid', 'form-card-fixture');
    expectLabelledSurface(cardRoot, 'Finance configuration');
    expect(findByAttribute(card.tree, 'data-child', 'form')).toHaveLength(1);

    const section = await rendered('FormSection', {
      title: 'Billing rules',
      description: 'Rules apply from their effective date.',
      class: 'billing-section-fixture',
      'data-testid': 'form-section-fixture',
      children: child('<div data-child="fields">Fields</div>'),
    });
    const sectionRoot = requireUi(section.tree, 'form-section');
    expectForwardedClass(sectionRoot, 'billing-section-fixture');
    expectForwardedData(sectionRoot, 'data-testid', 'form-section-fixture');
    expect(textContent(sectionRoot)).toContain('Billing rules');
    expect(textContent(sectionRoot)).toContain('Rules apply from their effective date.');
    expect(findByAttribute(section.tree, 'data-child', 'fields')).toHaveLength(1);
    expect(descendants(section.tree).filter((node) => node.tagName === 'FORM')).toHaveLength(0);
  });

  it('does not render nameless SectionCard, FormCard or TableRegion surfaces', async () => {
    const section = await renderedOrRejected('SectionCard', {
      children: child('<p>Untitled content</p>'),
    });
    if (section.error) {
      expect(String(section.error)).toMatch(/SectionCard.*title|ariaLabel/i);
    } else {
      expectNamedSurface(requireUi(section.tree!, 'section-card'));
    }

    const form = await renderedOrRejected('FormCard', {
      children: child('<form>Unnamed controls</form>'),
    });
    if (form.error) {
      expect(String(form.error)).toMatch(/FormCard.*title|ariaLabel/i);
    } else {
      expectNamedSurface(requireUi(form.tree!, 'form-card'));
    }

    const table = await renderedOrRejected('TableRegion', {
      mobileMode: 'scroll',
      children: child('<table><tbody><tr><td>Unnamed data</td></tr></tbody></table>'),
    });
    if (table.error) {
      expect(String(table.error)).toMatch(/TableRegion.*label|ariaLabel/i);
    } else {
      expectNamedSurface(requireUi(table.tree!, 'table-region'));
    }
  });

  it('does not let a whitespace title point aria-labelledby at an empty heading', async () => {
    for (const name of ['SectionCard', 'FormCard']) {
      const result = await renderedOrRejected(name, {
        title: '   ',
        children: child('<p>Whitespace title content</p>'),
      });
      if (result.error) {
        expect(String(result.error)).toMatch(/requires a non-empty title or ariaLabel/i);
      } else {
        expectNonEmptyAccessibleName(
          requireUi(result.tree!, name === 'SectionCard' ? 'section-card' : 'form-card'),
        );
      }
    }
  });

  it('keeps ariaLabel when headingId has no visible heading target', async () => {
    for (const name of ['SectionCard', 'FormCard']) {
      const { tree } = await rendered(name, {
        ariaLabel: 'Explicit surface name',
        headingId: 'external-heading-without-rendered-heading',
        children: child('<p>Explicitly named content</p>'),
      });
      const root = requireUi(tree, name === 'SectionCard' ? 'section-card' : 'form-card');
      expect(root.attrs.get('aria-label')).toBe('Explicit surface name');
      expectNonEmptyAccessibleName(root);
    }
  });

  it('keeps Field labels persistent and verifies helper, error and control ARIA wiring', async () => {
    const { tree } = await rendered('Field', {
      id: 'client-email',
      label: 'Billing email',
      help: 'Used for invoice delivery.',
      error: 'Enter a valid billing email.',
      required: true,
      class: 'billing-field-fixture',
      'data-testid': 'field-fixture',
      children: child(
        '<input id="client-email" name="billingEmail" value="" aria-describedby="client-email-help client-email-error" aria-invalid="true" />',
      ),
    });
    const root = requireUi(tree, 'field');
    expectForwardedClass(root, 'billing-field-fixture');
    expectForwardedData(root, 'data-testid', 'field-fixture');
    const label = findByAttribute(root, 'for', 'client-email')[0];
    expect(label).toBeDefined();
    expect(textContent(label!)).toContain('Billing email');
    const help = findByAttribute(root, 'id', 'client-email-help')[0];
    const error = findByAttribute(root, 'data-field-error-for', 'client-email')[0];
    expect(help).toBeDefined();
    expect(textContent(help!)).toContain('Used for invoice delivery.');
    expect(error).toBeDefined();
    expect(error?.attrs.get('id')).toBe('client-email-error');
    expect(textContent(error!)).toContain('Enter a valid billing email.');
    const control = findByAttribute(root, 'id', 'client-email')[0];
    expect(control?.tagName).toBe('INPUT');
    expect(control?.attrs.get('aria-describedby')?.split(/\s+/)).toEqual([
      'client-email-help',
      'client-email-error',
    ]);
    expect(control?.attrs.get('aria-invalid')).toBe('true');
    expect(findByAttribute(root, 'required')).not.toHaveLength(0);
    expect(control?.attrs.has('placeholder')).toBe(false);
  });

  it('associates checkbox and radio controls with persistent clickable labels', async () => {
    for (const type of ['checkbox', 'radio']) {
      const id = `approval-${type}`;
      const { tree } = await rendered('Field', {
        id,
        label: `${type} approval`,
        children: child(`<input id="${id}" name="approval" type="${type}" />`),
      });
      const root = requireUi(tree, 'field');
      const label = findByAttribute(root, 'for', id)[0];
      const control = findByAttribute(root, 'id', id)[0];
      expect(label, `${type} control needs a clickable label`).toBeDefined();
      expect(textContent(label!)).toContain(`${type} approval`);
      expect(control?.tagName).toBe('INPUT');
      expect(control?.attrs.get('type')).toBe(type);
      expect(label?.attrs.get('for')).toBe(control?.attrs.get('id'));
    }
  });

  it('declares both 44px dimensions for checkbox and radio label targets', () => {
    const css = primitiveCss();
    const targetToken = css.match(/--ja-target-min\s*:\s*([^;]+);/)?.[1]?.trim();
    expect(targetToken, 'the shared target token must resolve to 44px').toMatch(
      /^(44px|2\.75rem)$/,
    );
    const labelRule = cssRuleBody(
      css,
      /data-ui\s*=\s*['"]field['"][\s\S]*(checkbox|radio)[\s\S]*label/i,
    );
    expect(labelRule.trim(), 'checkbox/radio labels need a dedicated target rule').not.toBe('');
    const minWidth = labelRule.match(/(?:min-width|min-inline-size)\s*:\s*([^;]+);/i)?.[1]?.trim();
    const minHeight = labelRule.match(/(?:min-height|min-block-size)\s*:\s*([^;]+);/i)?.[1]?.trim();
    expect(minWidth, 'checkbox/radio label target needs a minimum width').toMatch(
      /^(44px|var\(--ja-target-min\))$/,
    );
    expect(minHeight, 'checkbox/radio label target needs a minimum height').toMatch(
      /^(44px|var\(--ja-target-min\))$/,
    );
  });

  it('supports FieldGroup columns while preserving child controls and safe data attributes', async () => {
    const { tree } = await rendered('FieldGroup', {
      columns: '2',
      class: 'billing-fields',
      'data-testid': 'field-group-fixture',
      children: child(
        '<label>Currency<select name="currency"><option>USD</option></select></label>',
      ),
    });
    const root = requireUi(tree, 'field-group');
    expect(root.attrs.get('class')?.split(/\s+/)).toContain('billing-fields');
    expectForwardedData(root, 'data-testid', 'field-group-fixture');
    expect(findByAttribute(tree, 'name', 'currency')).toHaveLength(1);
  });

  it('keeps ActionBar actions separated, wrapped by the primitive and target-safe', async () => {
    const { tree } = await rendered('ActionBar', {
      class: 'action-bar-fixture',
      'data-testid': 'action-bar-fixture',
      children: child(
        '<button data-action="secondary" type="button">Cancel</button><a data-action="primary" href="/save" target="_self">Save changes</a>',
      ),
    });
    const root = requireUi(tree, 'action-bar');
    expectForwardedClass(root, 'action-bar-fixture');
    expectForwardedData(root, 'data-testid', 'action-bar-fixture');
    const actions = findByAttribute(root, 'data-action');
    expect(actions.map((action) => action.attrs.get('data-action'))).toEqual([
      'secondary',
      'primary',
    ]);
    expect(actions[0]!.tagName).toBe('BUTTON');
    expect(actions[0]!.attrs.get('type')).toBe('button');
    expect(actions[1]!.tagName).toBe('A');
    expect(actions[1]!.attrs.get('href')).toBe('/save');
    expect(actions[1]!.attrs.get('target')).toBe('_self');
  });

  it('renders StatusBadge meaning as text and exposes its semantic variant', async () => {
    const { tree } = await rendered('StatusBadge', {
      variant: 'success',
      class: 'status-badge-fixture',
      'data-testid': 'status-badge-fixture',
      children: child('Ready'),
    });
    const root = requireUi(tree, 'status-badge');
    expectForwardedClass(root, 'status-badge-fixture');
    expectForwardedData(root, 'data-testid', 'status-badge-fixture');
    expect(root.attrs.get('data-variant')).toBe('success');
    expect(textContent(root)).toContain('Ready');
  });

  it('renders a named scroll TableRegion with focus, instruction and table semantics', async () => {
    const { tree } = await rendered('TableRegion', {
      label: 'Weekly time entries',
      mobileMode: 'scroll',
      class: 'scroll-region-fixture',
      'data-testid': 'scroll-region-fixture',
      children: child(
        '<table><thead><tr><th>Work date</th></tr></thead><tbody><tr><td data-label="Work date">2026-08-18</td></tr></tbody></table>',
      ),
    });
    const root = requireUi(tree, 'table-region');
    expectForwardedClass(root, 'scroll-region-fixture');
    expectForwardedData(root, 'data-testid', 'scroll-region-fixture');
    expect(root.attrs.get('data-mobile-representation')).toBe('scroll');
    expect(root.attrs.get('data-table-region')).toBeDefined();
    expect(root.attrs.get('aria-label') ?? root.attrs.get('aria-labelledby')).toBeTruthy();
    expect(root.attrs.get('tabindex')).toBe('0');
    const describedBy = root.attrs.get('aria-describedby');
    expect(describedBy).toBeTruthy();
    const instructions = describedBy!.split(/\s+/).flatMap((id) => findByAttribute(root, 'id', id));
    expect(instructions).not.toHaveLength(0);
    expect(instructions.map(textContent).join(' ')).toMatch(/scroll|swipe|horizontal/i);
    expect(
      descendants(tree)
        .filter((node) => node.tagName === 'TH')
        .map(textContent),
    ).toEqual(['Work date']);
    expect(findByAttribute(tree, 'data-label', 'Work date').map(textContent)).toEqual([
      '2026-08-18',
    ]);
  });

  it('keeps the scroll instruction id dedicated when a heading id is supplied', async () => {
    const { tree } = await rendered('TableRegion', {
      label: 'Weekly time entries',
      headingId: 'weekly-time-heading',
      mobileMode: 'scroll',
      children: child(
        '<h2 id="weekly-time-heading">Weekly time entries</h2><table><tbody><tr><td>2026-08-18</td></tr></tbody></table>',
      ),
    });
    const root = requireUi(tree, 'table-region');
    const instructionId = root.attrs.get('aria-describedby')?.trim();
    expect(instructionId, 'scroll mode must reference a dedicated instruction').toBeTruthy();
    expect(instructionId).not.toBe('weekly-time-heading');
    const instruction = findByAttribute(root, 'id', instructionId!)[0];
    expect(instruction).toBeDefined();
    expect(textContent(instruction!)).toMatch(/scroll|swipe|horizontal/i);
  });

  it('keeps TableRegion SSR ids stable and references distinct same-label instructions', async () => {
    const repeatedProps = {
      label: 'Repeated time entries',
      mobileMode: 'scroll' as const,
      children: child('<table><tbody><tr><td>2026-08-18</td></tr></tbody></table>'),
    };
    const first = await rendered('TableRegion', repeatedProps);
    const second = await rendered('TableRegion', repeatedProps);
    const firstRoot = requireUi(first.tree, 'table-region');
    const secondRoot = requireUi(second.tree, 'table-region');
    const firstInstructionId = firstRoot.attrs.get('aria-describedby');
    const secondInstructionId = secondRoot.attrs.get('aria-describedby');
    expect(firstInstructionId).toBeTruthy();
    expect(secondInstructionId).toBe(firstInstructionId);
    expect(findByAttribute(first.tree, 'id', firstInstructionId!)).not.toHaveLength(0);
    expect(findByAttribute(second.tree, 'id', secondInstructionId!)).not.toHaveLength(0);

    const left = await rendered('TableRegion', {
      label: 'Repeated time entries',
      mobileMode: 'scroll' as const,
      scrollInstructionId: 'left-time-entry-scroll-instruction',
      children: child('<table><tbody><tr><td>Left</td></tr></tbody></table>'),
    });
    const right = await rendered('TableRegion', {
      label: 'Repeated time entries',
      mobileMode: 'scroll' as const,
      scrollInstructionId: 'right-time-entry-scroll-instruction',
      children: child('<table><tbody><tr><td>Right</td></tr></tbody></table>'),
    });
    const leftRoot = requireUi(left.tree, 'table-region');
    const rightRoot = requireUi(right.tree, 'table-region');
    const leftInstructionId = leftRoot.attrs.get('aria-describedby');
    const rightInstructionId = rightRoot.attrs.get('aria-describedby');
    expect(leftInstructionId).toBe('left-time-entry-scroll-instruction');
    expect(rightInstructionId).toBe('right-time-entry-scroll-instruction');
    expect(leftInstructionId).not.toBe(rightInstructionId);
    expect(findByAttribute(left.tree, 'id', leftInstructionId!)).not.toHaveLength(0);
    expect(findByAttribute(right.tree, 'id', rightInstructionId!)).not.toHaveLength(0);
  });

  it('renders structured cards with separate desktop children and every row label/value', async () => {
    const { tree } = await rendered('TableRegion', {
      label: 'Invoice lines',
      mobileMode: 'cards',
      class: 'cards-region-fixture',
      'data-testid': 'cards-region-fixture',
      cardRows: [
        {
          id: 'invoice-line-1',
          cells: [
            { label: 'Description', value: 'Commissioning' },
            { label: 'Amount', value: '$100.00' },
          ],
        },
        {
          id: 'invoice-line-2',
          cells: [
            { label: 'Description', value: 'Testing' },
            { label: 'Amount', value: '$50.00' },
          ],
        },
      ],
      children: child(
        '<table data-desktop-fixture><tbody><tr><th>Description</th><th>Amount</th></tr></tbody></table>',
      ),
    });
    const root = requireUi(tree, 'table-region');
    expectForwardedClass(root, 'cards-region-fixture');
    expectForwardedData(root, 'data-testid', 'cards-region-fixture');
    expect(root.attrs.get('data-mobile-representation')).toBe('cards');
    expect(root.attrs.get('aria-label') ?? root.attrs.get('aria-labelledby')).toBeTruthy();
    const rows = findByAttribute(root, 'data-row');
    expect(rows).toHaveLength(2);
    for (const [row, expected] of [
      [
        rows[0],
        [
          ['Description', 'Commissioning'],
          ['Amount', '$100.00'],
        ],
      ],
      [
        rows[1],
        [
          ['Description', 'Testing'],
          ['Amount', '$50.00'],
        ],
      ],
    ] as const) {
      const cells = findByAttribute(row!, 'data-label');
      expect(cells).toHaveLength(2);
      for (const [cell, [label, value]] of cells.map(
        (cell, index) => [cell, expected[index]!] as const,
      )) {
        expectCardCellContent(cell, label, value);
      }
    }
    expect(findByAttribute(root, 'data-table-region-desktop')).toHaveLength(1);
    expect(findByAttribute(root, 'data-desktop-fixture')).toHaveLength(1);
  });

  it('requires cards labels to be present in semantic DOM or ARIA, not only data-label metadata', async () => {
    const { tree } = await rendered('TableRegion', {
      label: 'Invoice lines',
      mobileMode: 'cards',
      cardRows: [
        {
          id: 'line-1',
          cells: [
            { label: 'Description', value: 'Commissioning' },
            { label: 'Amount', value: '$100.00' },
          ],
        },
      ],
    });
    const root = requireUi(tree, 'table-region');
    const rows = findByAttribute(root, 'data-row');
    expect(rows).toHaveLength(1);
    const cells = findByAttribute(rows[0]!, 'data-label');
    expect(cells).toHaveLength(2);
    for (const [cell, label, value] of [
      [cells[0], 'Description', 'Commissioning'],
      [cells[1], 'Amount', '$100.00'],
    ] as const) {
      expectCardCellContent(cell!, label, value);
    }
  });

  it('does not accept a cards SSR fallback whose labels exist only in data attributes or actions', async () => {
    const result = await renderedOrRejected('TableRegion', {
      label: 'Invoice lines',
      mobileMode: 'cards',
      children: child(
        '<article data-row="1"><span data-label="Description">Commissioning</span><span data-label="Amount">$100.00</span></article>',
      ),
    });
    if (result.error) {
      expect(String(result.error)).toMatch(/card|semantic|label/i);
      return;
    }

    const root = requireUi(result.tree!, 'table-region');
    const rows = findByAttribute(root, 'data-row');
    expect(rows.length, 'cards SSR fallback must expose at least one row').toBeGreaterThan(0);
    const cells = findByAttribute(rows[0]!, 'data-label');
    expect(cells).toHaveLength(2);
    for (const [cell, label, value] of [
      [cells[0], 'Description', 'Commissioning'],
      [cells[1], 'Amount', '$100.00'],
    ] as const) {
      expectCardCellContent(cell!, label, value);
    }
  });
});
