import { copyFileSync, existsSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';

// The Worker reads DEV_AUTH from .dev.vars and still refuses it off loopback.
if (!existsSync('.dev.vars')) copyFileSync('.dev.vars.example', '.dev.vars');
const init = spawnSync('npm', ['run', 'db:init'], {
  stdio: 'inherit',
  env: { ...process.env, CI: '1' },
});
if (init.status !== 0) process.exit(init.status ?? 1);

const children = ['dev:worker', 'dev:client'].map((name) =>
  spawn('npm', ['run', name], { stdio: 'inherit' }),
);
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill('SIGTERM');
  setTimeout(() => process.exit(code), 250);
}
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
for (const child of children) child.on('exit', (code) => stop(code ?? 1));
