import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('release archive private-path validation', () => {
  const source = readFileSync('scripts/build-release-and-upload.ps1', 'utf8');

  it('allows source routes named documents while rejecting private and dependency paths', () => {
    expect(source).toContain('$releaseRootPattern = [regex]::Escape($releaseFolder)');
    const patternSource = source.match(/\$forbiddenArchivePattern = "([^"]+)"/u)?.[1];
    expect(patternSource).toBeDefined();

    const releaseFolder = 'jaautomation-release-20260904-example';
    const escapedReleaseFolder = releaseFolder.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
    const matcher = new RegExp(
      patternSource!.replace('${releaseRootPattern}', escapedReleaseFolder),
      'u',
    );

    expect(
      matcher.test(`${releaseFolder}/apps/portal/src/routes/app/documents/[id]/+server.ts`),
    ).toBe(false);
    expect(matcher.test(`${releaseFolder}/packages/example/data/model.ts`)).toBe(false);

    for (const privateRoot of ['data', 'uploads', 'documents']) {
      expect(matcher.test(`${releaseFolder}/${privateRoot}/private.bin`)).toBe(true);
    }
    for (const dependencyPath of [
      `${releaseFolder}/.git/config`,
      `${releaseFolder}/apps/portal/node_modules/package/index.js`,
    ]) {
      expect(matcher.test(dependencyPath)).toBe(true);
    }
  });
});
