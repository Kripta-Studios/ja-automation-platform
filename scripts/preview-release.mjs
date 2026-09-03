import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const children = [];

function spawnInherited(command, args, options = {}) {
  const child = spawn(command, args, {
    cwd: root,
    env: process.env,
    stdio: 'inherit',
    ...options,
  });
  children.push(child);
  child.on('exit', (code, signal) => {
    if (stopping) return;
    stopping = true;
    for (const other of children) {
      if (other !== child && !other.killed) other.kill('SIGTERM');
    }
    process.exitCode = signal ? 1 : (code ?? 1);
  });
  return child;
}

let stopping = false;
function shutdown() {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (!child.killed) child.kill('SIGTERM');
  }
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

spawnInherited(process.execPath, ['deployment/jobs-build/jobs-run.mjs', '--loop']);
spawnInherited('pnpm', ['--filter', '@ja/portal', 'preview'], {
  shell: process.platform === 'win32',
});
