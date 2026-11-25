import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

// The portal CSP (svelte.config.js) has a strict style-src: no 'unsafe-inline'. A style
// attribute rendered by the server, or parsed from a Svelte template, is blocked and logs
// "Applying inline style violates … style-src" (seen on /time/<id>, expense and billing drawers).
// Styles belong in classes; dynamic values go through the CSSOM (element.style.setProperty).
const root = join(__dirname, '../../apps/portal/src');

function svelteFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return svelteFiles(path);
    return name.endsWith('.svelte') ? [path] : [];
  });
}

describe('CSP: no inline style attributes in portal markup', () => {
  it('uses classes instead of style="…" / style={…} attributes', () => {
    const offenders = svelteFiles(root).flatMap((file) => {
      const markup = readFileSync(file, 'utf8')
        .replace(/<script[\s\S]*?<\/script>/g, '')
        .replace(/<style[\s\S]*?<\/style>/g, '');
      return [...markup.matchAll(/\sstyle=["'{]/g)].map(
        (match) => `${relative(root, file)} @${match.index}`,
      );
    });
    expect(offenders).toEqual([]);
  });
});
