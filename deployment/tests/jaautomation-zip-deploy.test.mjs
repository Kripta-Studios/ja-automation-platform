import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';

const deployerPath = resolve('deployment/scripts/jaautomation-zip-deploy');
const deployer = readFileSync(deployerPath, 'utf8');

function indexOfOrFail(fragment) {
  const index = deployer.indexOf(fragment);
  assert.notEqual(index, -1, `missing deploy contract: ${fragment}`);
  return index;
}

test('the ZIP deployer is valid Bash', () => {
  const bash = process.platform === 'win32' ? 'C:/Program Files/Git/bin/bash.exe' : 'bash';
  const result = spawnSync(bash, ['-n', deployerPath], { encoding: 'utf8' });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
});

test('a candidate must carry the jobs runner and both systemd units', () => {
  assert.match(deployer, /release_shape_is_valid\(\)[\s\S]*deployment\/scripts\/jobs-run\.mjs/u);
  assert.match(
    deployer,
    /release_shape_is_valid\(\)[\s\S]*deployment\/jaautomation-jobs\.service/u,
  );
  assert.match(deployer, /release_shape_is_valid\(\)[\s\S]*deployment\/jaautomation-jobs\.timer/u);
  assert.match(
    deployer,
    /release_shape_is_valid\(\)[\s\S]*deployment\/scripts\/continuity-backup\.mjs/u,
  );
  assert.match(
    deployer,
    /release_shape_is_valid\(\)[\s\S]*deployment\/jaautomation-backup\.service/u,
  );
  assert.match(
    deployer,
    /release_shape_is_valid\(\)[\s\S]*deployment\/jaautomation-backup\.timer/u,
  );
});

test('the candidate jobs and backup units replace installed units before managed preflight', () => {
  const backup = indexOfOrFail('backup_jobs_units "$jobs_units_backup"');
  const install = indexOfOrFail('install_candidate_jobs_units "$release_dir"');
  const reload = deployer.indexOf('systemctl daemon-reload', install);
  const preflight = indexOfOrFail('\n  preflight_candidate_jobs\n');
  assert.ok(backup < install);
  assert.ok(install < reload);
  assert.ok(reload < preflight);
  assert.match(deployer, /systemctl start jaautomation-jobs\.service/u);
  assert.match(deployer, /systemctl enable --now jaautomation-jobs\.timer/u);
  assert.match(deployer, /systemctl is-enabled --quiet jaautomation-jobs\.timer/u);
  assert.match(deployer, /systemctl is-active --quiet jaautomation-jobs\.timer/u);
  assert.match(deployer, /BACKUP_SERVICE_UNIT=.*jaautomation-backup\.service/u);
  assert.match(deployer, /BACKUP_TIMER_UNIT=.*jaautomation-backup\.timer/u);
  assert.match(deployer, /systemctl enable --now jaautomation-backup\.timer/u);
  assert.match(deployer, /systemctl is-enabled --quiet jaautomation-backup\.timer/u);
  assert.match(deployer, /systemctl is-active --quiet jaautomation-backup\.timer/u);
  assert.match(deployer, /El worker de jobs del candidato no quedó en ejecución/u);
  assert.match(deployer, /El worker de jobs del candidato no emitió jobs.cycle/u);
  assert.match(deployer, /ps --all --format '\{\{\.State\}\}' jobs/u);
});

test('jobs preflight fails closed on a failed runner or stale service actor binding', () => {
  assert.match(deployer, /systemctl show jaautomation-jobs\.service -p Result --value/u);
  assert.match(deployer, /systemctl show jaautomation-jobs\.service -p ExecMainStatus --value/u);
  assert.match(deployer, /SERVICE_ACTOR_BINDING_UNAVAILABLE/u);
  assert.match(deployer, /SERVICE_ACTOR_CAPABILITIES_CORRUPT/u);
  assert.match(deployer, /LEGACY_JOB_ACTOR_ID_UNSUPPORTED/u);
});

test('host operational scripts use the pinned Node 24 runtime path', () => {
  assert.match(deployer, /NODE=\/opt\/jaautomation\/runtime\/node\/bin\/node/u);
  assert.doesNotMatch(deployer, /node-v24\.19\.0\/bin\/node/u);
  const backupService = readFileSync(resolve('deployment/jaautomation-backup.service'), 'utf8');
  assert.match(
    backupService,
    /ExecStart=\/opt\/jaautomation\/runtime\/node\/bin\/node deployment\/scripts\/continuity-backup\.mjs/u,
  );
});

test('the VPS installer carries the current jobs and backup units', () => {
  const installer = readFileSync(resolve('deployment/scripts/install-vps.sh'), 'utf8');
  for (const unit of [
    'jaautomation-jobs.service',
    'jaautomation-jobs.timer',
    'jaautomation-backup.service',
    'jaautomation-backup.timer',
  ])
    assert.match(installer, new RegExp(`deployment\\/${unit}`, 'u'));
  assert.match(
    installer,
    /systemctl enable jaautomation\.service jaautomation-jobs\.timer jaautomation-backup\.timer/u,
  );
});

test('rollback restores the previous unit bytes and reloads systemd before restoring the timer state', () => {
  assert.match(deployer, /restore_previous_jobs_units/u);
  const rollbackStart = indexOfOrFail('rollback_deployment()');
  const restore = deployer.indexOf('restore_previous_jobs_units', rollbackStart);
  const reload = deployer.indexOf('systemctl daemon-reload', restore);
  const timerRestore = deployer.indexOf('restore_previous_jobs_timer_state', reload);
  assert.ok(restore > rollbackStart);
  assert.ok(reload > restore);
  assert.ok(timerRestore > reload);
});
