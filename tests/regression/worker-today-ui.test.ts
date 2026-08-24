import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const readSource = (path: string): string => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('Worker Today UI', () => {
  it('does not hardcode the former ten-hour expectation or threshold arithmetic', () => {
    const source = readSource('apps/portal/src/lib/portal/sections/TodaySection.svelte');
    const weekSource = readSource('apps/portal/src/lib/server/portal-week.ts');

    expect(source).not.toMatch(/10\s*h\s*expected/i);
    expect(source).not.toMatch(/today\s*\/\s*10/i);
    expect(source).not.toMatch(/10\s*\*\s*60|60\s*\*\s*10|600\s*(?:minutes?|m)\b/i);
    expect(weekSource).not.toMatch(/actualMinutes !== 600|index < 6 \? 600/);
  });

  it('uses neutral Today language and only renders an existing planning reference', () => {
    const source = readSource('apps/portal/src/lib/portal/sections/TodaySection.svelte');

    expect(source).toContain("translate('Today')");
    expect(source).toContain('planned_minutes');
    expect(source).toContain("translate('Planned')");
    expect(source).not.toMatch(
      /client\s*billab|client\s*rate|internal\s*cost|tax|margin|multiplier/i,
    );
  });
});
