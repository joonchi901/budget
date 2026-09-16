import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';

// A fresh, isolated DB for every browser run; never touches the development DB.
const state = mkdtempSync(join(tmpdir(), 'budget-e2e-'));
const env = { ...process.env, WRANGLER_SEND_METRICS: 'false' };
const wrangler = join(process.cwd(), 'node_modules/wrangler/bin/wrangler.js');
let child;
function clean() {
  rmSync(state, { recursive: true, force: true });
}
process.on('exit', clean);
for (const [command, args] of [
  ['npm', ['run', 'build']],
  [
    process.execPath,
    [wrangler, 'd1', 'migrations', 'apply', 'budget-local', '--local', '--persist-to', state],
  ],
  [
    process.execPath,
    [
      wrangler,
      'd1',
      'execute',
      'budget-local',
      '--local',
      '--persist-to',
      state,
      '--file=seeds/demo.sql',
    ],
  ],
]) {
  const result = spawnSync(command, args, { stdio: 'inherit', env });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
child = spawn(
  process.execPath,
  [
    wrangler,
    'dev',
    '--ip',
    '127.0.0.1',
    '--port',
    '8790',
    '--persist-to',
    state,
    '--var',
    'DEMO_MODE:true',
  ],
  { stdio: 'inherit', env },
);
process.on('SIGINT', () => child.kill('SIGINT'));
process.on('SIGTERM', () => child.kill('SIGTERM'));
child.on('exit', (code) => process.exit(code ?? 0));
