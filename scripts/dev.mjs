import { existsSync, copyFileSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';

if (!existsSync('.dev.vars')) copyFileSync('.dev.vars.example', '.dev.vars');
for (const args of [
  ['run', 'db:init'],
  ['run', 'build'],
]) {
  const result = spawnSync('npm', args, { stdio: 'inherit', env: process.env });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
const children = ['dev:worker', 'dev:client'].map((name) =>
  spawn('npm', ['run', name], { stdio: 'inherit', env: process.env }),
);
let shuttingDown = false;
function stop(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) child.kill('SIGTERM');
  setTimeout(() => process.exit(code), 250);
}
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
for (const child of children) child.on('exit', (code) => stop(code ?? 1));
