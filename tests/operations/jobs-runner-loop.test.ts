import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = (path: string): string => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('always-on jobs worker', () => {
  it('ships a looping runner and a local release preview that starts it with the portal', () => {
    const runner = source('deployment/scripts/jobs-run.mjs');
    const preview = source('scripts/preview-release.mjs');
    const pack = source('package.json');

    expect(runner).toContain("process.argv.includes('--loop')");
    expect(runner).toContain("process.env.JA_JOBS_LOOP === '1'");
    expect(runner).toContain('jobs.loop.start');
    expect(runner).toContain('await main()');
    expect(runner).toMatch(/^async function runCycle\(\) \{/mu);
    expect(runner).toMatch(/^async function main\(\) \{/mu);
    expect(preview).toContain("'--loop'");
    expect(preview).toContain("'@ja/portal'");
    expect(preview).toContain("'preview'");
    expect(pack).toContain('"ops:jobs:loop"');
    expect(pack).toContain('"preview:release"');
  });

  it('keeps the VPS jobs worker in the default compose stack', () => {
    const compose = source('deployment/compose.production.yml');
    const unit = source('deployment/jaautomation-jobs.service');
    const verifier = source('deployment/scripts/verify-vps.sh');
    const jobsBlock = compose.slice(
      compose.indexOf('\n  jobs:'),
      compose.indexOf('\n  demo-seed:'),
    );

    expect(compose).toContain('command: [node, /app/deployment/jobs-run.mjs, --loop]');
    expect(compose).toContain('restart: unless-stopped');
    expect(compose).toContain('depends_on:');
    expect(compose).not.toMatch(/jobs:\s*\n\s*profiles: \[jobs\]/u);
    expect(unit).toContain('up -d --no-deps jobs');
    expect(unit).toContain('Type=oneshot');
    expect(unit).not.toContain('RemainAfterExit=yes');
    expect(jobsBlock).not.toContain('env_file:');
    for (const forbidden of [
      'JA_AUTH_SECRET:',
      'JA_BACKUP_ENCRYPTION_KEY:',
      'JA_BACKUP_SSH_KEY:',
      'JA_SMTP_URL:',
      'JA_JOB_ACTOR_ID:',
    ])
      expect(jobsBlock).not.toContain(forbidden);
    expect(verifier).toContain('Always-on jobs worker');
    expect(verifier).toContain('jobs_container_state');
    expect(verifier).not.toContain('--profile jobs');
  });

  it('resolves the worker through the deployment-scoped service-actor singleton', () => {
    const runner = source('deployment/scripts/jobs-run.mjs');
    const compose = source('deployment/compose.production.yml');
    const serviceActor = source('packages/database/src/domains/jobs/service-actor-repository.ts');

    expect(runner).toContain('resolveConfiguredServiceActor(sqlite)');
    expect(runner).toContain('LEGACY_JOB_ACTOR_ID_UNSUPPORTED');
    expect(compose).toContain('service-actor:');
    expect(compose).toContain("entrypoint: [pnpm, --filter, '@ja/database', service-actor]");
    expect(compose).not.toContain('JA_JOB_ACTOR_ID:');
    expect(serviceActor).toContain('deployment_service_actor_binding');
  });
});
