import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { spawn } from 'node:child_process';

const root = resolve('storybook-static');
await stat(resolve(root, 'index.json')).catch(() => {
  throw new Error('먼저 npm run build:storybook을 실행하세요.');
});
const mime = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
};
const server = createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const file = resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
    if (!file.startsWith(root + sep)) {
      res.writeHead(403).end();
      return;
    }
    const content = await readFile(file);
    res
      .writeHead(200, { 'Content-Type': mime[extname(file)] || 'application/octet-stream' })
      .end(content);
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const url = `http://127.0.0.1:${server.address().port}`;
const widths = (process.env.UI_TEST_WIDTHS || '320,390,1440').split(',').map(Number);
let child;
const stop = () => {
  child?.kill('SIGTERM');
  server.close();
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
try {
  for (const width of widths) {
    if (!Number.isInteger(width) || width < 320)
      throw new Error('UI_TEST_WIDTHS must contain widths >= 320');
    console.log(`\nStorybook · Chromium ${width}px · interactions / WCAG / overflow`);
    const exitCode = await new Promise((resolve, reject) => {
      child = spawn(
        'test-storybook',
        ['--url', url, '--maxWorkers', '2', '--failOnConsole', ...process.argv.slice(2)],
        {
          stdio: 'inherit',
          env: { ...process.env, UI_TEST_WIDTH: String(width), STORYBOOK_DISABLE_TELEMETRY: '1' },
        },
      );
      child.once('error', reject);
      child.once('exit', (code) => resolve(code ?? 1));
    });
    if (exitCode !== 0) {
      process.exitCode = exitCode;
      break;
    }
  }
} finally {
  server.close();
}
