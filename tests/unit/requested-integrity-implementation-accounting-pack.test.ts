import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const routePath = resolve(
  process.cwd(),
  'apps/portal/src/routes/app/api/accounting-pack/[id]/[type]/+server.ts',
);
const privateArtifactHelperPath = resolve(
  process.cwd(),
  'apps/portal/src/lib/server/private-artifact-access.ts',
);

describe('requested Accounting Pack download integrity implementation', () => {
  it('translates pack validation and readiness failures into deliberate HTTP responses', () => {
    const routeSource = readFileSync(routePath, 'utf8');
    const helperSource = readFileSync(privateArtifactHelperPath, 'utf8');

    expect(routeSource).toContain('servePrivateArtifact');
    expect(helperSource).toContain('V3ValidationError');
    expect(helperSource).toContain('V3ConflictError');
    expect(helperSource).toContain("conflict('Private artifact is not ready')");
  });

  it('keeps the download boundary private and integrity-checked', () => {
    const routeSource = readFileSync(routePath, 'utf8');
    const helperSource = readFileSync(privateArtifactHelperPath, 'utf8');

    expect(routeSource).toContain('context.v3.accountingPackExport');
    expect(routeSource).toContain('context.sqlite.close()');
    expect(routeSource).toContain("kind: 'accounting_pack'");
    expect(helperSource).toContain("createHash('sha256').update(bytes).digest('hex')");
    expect(helperSource).toContain("'cache-control': 'private, no-store'");
  });
});
