// Turns every Storybook story into a Claude Design artboard: renders the built Storybook in
// Chromium, waits for each story's play to finish, and keeps its DOM as plain markup, so every
// element is its own layer on the canvas. Pages follow the Storybook levels.
// Usage: npm run build:storybook && node design/uga/claude-design/canvas.mjs <canvas-root>
import { createServer } from 'node:http';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { extname, join, resolve, sep } from 'node:path';
import { createRequire } from 'node:module';

const root = resolve(import.meta.dirname, '../../..');
const out = resolve(process.argv[2] ?? '');
if (!process.argv[2]) throw new Error('usage: canvas.mjs <canvas-root>');
const { chromium } = createRequire(join(root, 'package.json'))('playwright');
const staticDir = join(root, 'storybook-static');
const mime = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.png': 'image/png',
};
const server = createServer((req, res) => {
  const file = resolve(
    staticDir,
    `.${decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/\/$/, '/index.html')}`,
  );
  if (!file.startsWith(staticDir + sep)) return res.writeHead(403).end();
  try {
    res
      .writeHead(200, { 'Content-Type': mime[extname(file)] ?? 'application/octet-stream' })
      .end(readFileSync(file));
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((done) => server.listen(0, '127.0.0.1', done));
const base = `http://127.0.0.1:${server.address().port}`;

const pages = [
  { id: 'foundations', name: '01 Foundations · 기초', prefix: '01' },
  { id: 'atoms', name: '02 Atoms · 원자', prefix: '02' },
  { id: 'molecules', name: '03 Molecules · 분자', prefix: '03' },
  { id: 'organisms', name: '04 Organisms · 유기체', prefix: '04' },
  { id: 'templates', name: '05 Templates · 템플릿', prefix: '05' },
  { id: 'views', name: '06 Views · 화면', prefix: '06' },
];
const index = JSON.parse(readFileSync(join(staticDir, 'index.json'), 'utf8'));
const stories = Object.values(index.entries).filter(
  (entry) =>
    entry.type === 'story' &&
    pages.some((page) => entry.title.startsWith(page.prefix)) &&
    !entry.title.endsWith('/전체 흐름'),
);
const fileName = (entry) => {
  // The room list is the canvas's entry artboard.
  if (entry.importPath.endsWith('views/RoomList.stories.tsx') && entry.id.endsWith('--rooms'))
    return 'Main.dc.html';
  const component = entry.importPath.split('/').at(-1).replace('.stories.tsx', '');
  const level = entry.importPath.split('/').at(-2);
  return `${level}-${component}-${entry.id.split('--')[1]}.dc.html`.replace(
    /[^A-Za-z0-9_.-]/g,
    '-',
  );
};

const helmet = `<style>
body{margin:0}
a{color:var(--brand-accent)}a:hover{color:var(--brand-primary)}
.ui-spec-canvas{padding:var(--brand-space-6);min-width:0}
.ui-spec-canvas>*{min-width:0}
@media (max-width:760px){.ui-spec-canvas{padding:var(--brand-space-3)}}
dialog[open]{position:absolute;inset:0;z-index:50;margin:auto}
dialog[open].ui-sheet-bottom{inset:auto 0 0 0;margin:0}
</style>`;
const artboard = (title, width, height, view, body) => `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<title>${title}</title>
<script src="./support.js"></script>
<link rel="stylesheet" href="ds/uga/tokens.css">
<link rel="stylesheet" href="ds/uga/components/bundle.css">
</head>
<body>
<x-dc>
<helmet>
${helmet}
</helmet>
<div style="position: relative; width: ${width}px; ${view ? `height: ${height}px; overflow: hidden` : `min-height: ${height}px`}; background: var(--brand-canvas); color: var(--brand-text); font-family: var(--font-body)">
${body}
</div>
</x-dc>
<script type="text/x-dc" data-dc-script data-props='{"$preview":{"width":${width},"height":${height}}}'>
class Component extends DCLogic {
  renderVals() {
    return {};
  }
}
</script>
</body>
</html>
`;

const browser = await chromium.launch();
const captured = [];
for (const entry of stories) {
  const view = entry.title.startsWith('06');
  const width = view ? 390 : 600;
  const page = await browser.newPage({ viewport: { width, height: 844 } });
  await page.route('**/*', (route) =>
    route.request().url().startsWith(base) ? route.continue() : route.abort(),
  );
  await page.goto(`${base}/iframe.html?id=${encodeURIComponent(entry.id)}&viewMode=story`, {
    waitUntil: 'load',
  });
  await page.waitForSelector('#storybook-root > *', { timeout: 15000 });
  // The play function runs after the first render: wait until the markup stops changing.
  let last = '';
  for (let tries = 0; tries < 40; tries++) {
    await page.waitForTimeout(250);
    const now = await page.evaluate(() => document.querySelector('#storybook-root').innerHTML);
    if (now === last) break;
    last = now;
  }
  const result = await page.evaluate(() => {
    const rootEl = document.querySelector('#storybook-root');
    // Live values only exist as properties; write them back as attributes so the markup keeps them.
    for (const input of rootEl.querySelectorAll('input')) {
      if (input.type === 'checkbox' || input.type === 'radio')
        input.toggleAttribute('checked', input.checked);
      else input.setAttribute('value', input.value);
    }
    for (const area of rootEl.querySelectorAll('textarea')) area.textContent = area.value;
    const height = Math.ceil(rootEl.scrollHeight);
    return {
      html: rootEl.innerHTML,
      height,
      dialog: Boolean(rootEl.querySelector('dialog[open]')),
    };
  });
  await page.close();
  const html = result.html
    .replace(/src="\/brand\//g, 'src="ds/uga/brand/')
    .replace(/\{\{/g, '&#123;&#123;')
    .replace(
      /<dialog open=""/g,
      '<div style="position: absolute; inset: 0; z-index: 40; background: var(--brand-backdrop)"></div><dialog open=""',
    );
  const height = view
    ? result.dialog
      ? 844
      : Math.max(844, result.height)
    : Math.max(120, result.height);
  captured.push({ entry, file: fileName(entry), view, width, height, html });
  process.stdout.write('.');
}
await browser.close();
server.close();

// Layout: one canvas page per level, one row per story file, its stories left to right.
const project = join(out, 'project');
mkdirSync(project, { recursive: true });
const boards = {};
const order = [];
const notes = {};
for (const page of pages) {
  let y = 0;
  const rows = new Map();
  for (const item of captured.filter((c) => c.entry.title.startsWith(page.prefix))) {
    const key = item.entry.title;
    rows.set(key, [...(rows.get(key) ?? []), item]);
  }
  for (const [title, items] of rows) {
    let x = 0;
    const noteId = `${page.id}-${items[0].file.split('-').slice(1, 2)}`
      .replace(/[^A-Za-z0-9_-]/g, '-')
      .slice(0, 40);
    notes[noteId] = {
      x: 0,
      y,
      text: title.split('/').at(-1),
      kind: 'title1',
      page: page.id,
      maxW: Math.max(
        600,
        items.reduce((sum, item) => sum + item.width + 80, -80),
      ),
    };
    const top = y + 260;
    for (const item of items) {
      boards[item.file] = {
        x,
        y: top,
        w: item.width,
        h: item.height,
        title: item.entry.name,
        page: page.id,
      };
      order.push(item.file);
      writeFileSync(
        join(project, item.file),
        artboard(
          `${title.split('/').at(-1)} · ${item.entry.name}`,
          item.width,
          item.height,
          item.view,
          item.html,
        ),
      );
      x += item.width + 80;
    }
    y = top + Math.max(...items.map((item) => item.height)) + 120;
  }
}
writeFileSync(
  join(out, 'layout.json'),
  JSON.stringify(
    { pages: pages.map(({ id, name }) => ({ id, name })), boards, order, notes },
    null,
    2,
  ),
);
console.log(`\n${captured.length} artboards on ${pages.length} pages → ${project}`);
