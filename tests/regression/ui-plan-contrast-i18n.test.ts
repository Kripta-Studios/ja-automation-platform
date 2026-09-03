import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (relativePath: string): string =>
  readFileSync(resolve(process.cwd(), relativePath), 'utf8');

function hexToken(source: string, token: string): string {
  const match = source.match(new RegExp(`${token}\\s*:\\s*(#[0-9a-f]{6})\\b`, 'i'));
  if (!match) throw new Error(`Missing ${token}`);
  return match[1].toLowerCase();
}

function relativeLuminance(hex: string): number {
  const channels = hex
    .slice(1)
    .match(/../g)
    ?.map((channel) => Number.parseInt(channel, 16) / 255);
  if (!channels || channels.length !== 3) throw new Error(`Invalid color ${hex}`);
  const linear = channels.map((channel) =>
    channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function contrastRatio(foreground: string, background: string): number {
  const foregroundLuminance = relativeLuminance(foreground);
  const backgroundLuminance = relativeLuminance(background);
  const lighter = Math.max(foregroundLuminance, backgroundLuminance);
  const darker = Math.min(foregroundLuminance, backgroundLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

describe('UI_PLAN contrast and controlled-value contracts', () => {
  it('keeps warning foreground readable while retaining a separate amber accent', () => {
    const foundation = read('apps/portal/src/styles/portal/foundation.css');
    const primitives = read('apps/portal/src/styles/portal/primitives.css');
    const polish = read('apps/portal/src/styles/portal/polish.css');
    const warningForeground = hexToken(foundation, '--ja-status-warning-foreground');
    const warningAccent = hexToken(foundation, '--ja-status-warning');

    expect(contrastRatio(warningForeground, '#ffffff')).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(warningForeground, '#fff4d6')).toBeGreaterThanOrEqual(4.5);
    expect(warningForeground).not.toBe(warningAccent);
    expect(primitives).toMatch(
      /data-variant='warning'[\s\S]*?color:\s*var\(--ja-status-warning-foreground/,
    );
    expect(primitives).toMatch(
      /data-variant='warning'[\s\S]*?background:\s*color-mix\([^;]*var\(--ja-status-warning[,)]/,
    );
    expect(polish).toMatch(
      /dashboard-metrics \.attention span[\s\S]*?color:\s*var\(--ja-status-warning-foreground/,
    );
  });

  it('gives enabled controls a 3:1 minimum boundary contrast without replacing focus or invalid states', () => {
    const foundation = read('apps/portal/src/styles/portal/foundation.css');
    const primitives = read('apps/portal/src/styles/portal/primitives.css');
    const controlBorder = hexToken(foundation, '--ja-control-border-strong');

    expect(contrastRatio(controlBorder, '#ffffff')).toBeGreaterThanOrEqual(3);
    expect(foundation).toContain('--ja-control-border: var(--ja-control-border-strong)');
    expect(foundation).toMatch(
      /:where\([\s\S]*?input[\s\S]*?select[\s\S]*?\)\s*\{[\s\S]*?border:\s*1px solid var\(--ja-control-border/,
    );
    expect(foundation).toContain('):focus-visible');
    expect(primitives).toContain("[data-ui='field'] [aria-invalid='true']");
    expect(primitives).toContain('border-color: var(--ja-danger');
  });

  it('keeps project, client, team status and availability values controlled across rerenders', () => {
    const project = read('apps/portal/src/lib/portal/sections/ProjectSection.svelte');
    const client = read('apps/portal/src/lib/portal/sections/ClientDirectorySection.svelte');
    const team = read('apps/portal/src/lib/portal/sections/TeamDirectorySection.svelte');

    expect(project).toContain("controlledValue?.('status', status)");
    expect(client).toContain("controlledValue?: (domain: 'status', value: unknown) => string");
    expect(client).toMatch(
      /function projectStatusLabel[\s\S]*?controlledValue\?\.\('status', status\)/,
    );
    expect(client).not.toMatch(/<span>\{value\(project, 'status'\)\}/);
    expect(client).toContain('border: 1px solid var(--ja-control-border, #64748b)');
    expect(team).toContain("controlledValue?: (domain: 'status' | 'availability' | 'role'");
    expect(team).toContain("controlledValue?.('availability', explicit)");
    expect(team).toContain("controlledValue?.('status', status)");
    expect(team).toMatch(/function statusLabel[\s\S]*?controlledValue\?\.\('status', status\)/);
    expect(team).toContain('border: 1px solid var(--ja-control-border, #64748b)');
  });
});
