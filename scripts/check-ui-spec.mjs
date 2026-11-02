import { readFile, access, readdir } from 'node:fs/promises';
import { join, posix } from 'node:path';

const catalog = JSON.parse(await readFile('src/stories/catalog.json', 'utf8'));
const statuses = new Set(['shared', 'partial', 'ready', 'legacy']);
const errors = [];
for (const entry of catalog) {
  if (!statuses.has(entry.status)) errors.push(`${entry.name}: unknown adoption status`);
  for (const file of [entry.source, entry.story].filter(Boolean)) {
    try {
      await access(file);
    } catch {
      errors.push(`${entry.name}: missing ${file}`);
    }
  }
  if (entry.status !== 'legacy' && !entry.story) errors.push(`${entry.name}: story required`);
}
async function filesMatching(dir, suffix) {
  const files = await readdir(dir, { withFileTypes: true });
  return (
    await Promise.all(
      files.map((item) =>
        item.isDirectory()
          ? filesMatching(join(dir, item.name), suffix)
          : item.name.endsWith(suffix)
            ? [join(dir, item.name)]
            : [],
      ),
    )
  ).flat();
}
const files = await filesMatching('src/stories', '.stories.tsx');
for (const path of files) {
  const text = await readFile(path, 'utf8');
  if (!/title:\s*['"]0[0-6] /.test(text)) errors.push(`${path}: hierarchy title missing`);
  if (/from ['"].*\/(App|useBudget)['"]/.test(text))
    errors.push(`${path}: production app/session must not mount in Storybook`);
}
// Domain blocks, templates and views use shared controls. Native elements belong only to
// ui/ leaf implementations; a new view cannot silently reintroduce a second UI system.
const ts = (await import('typescript')).default;
const screens = JSON.parse(await readFile('src/stories/screens.json', 'utf8'));
// Each level may import itself and the levels listed; views assemble everything.
// `shared` is the domain contract in src/shared, which only domain-aware levels may use.
const allowedImports = {
  brand: ['brand'],
  ui: ['brand', 'ui'],
  ledger: ['brand', 'ui', 'ledger', 'shared'],
  templates: ['brand', 'ui', 'templates'],
  views: ['brand', 'ui', 'ledger', 'templates', 'views', 'shared'],
};
const sources = new Map(screens.map((screen) => [screen.source, screen]));
for (const screen of screens) {
  for (const path of [screen.source, screen.story]) {
    try {
      await access(path);
    } catch {
      errors.push(`${screen.name}: missing ${path}`);
    }
  }
}
const clientFiles = [
  ...(await filesMatching('src/client', '.ts')),
  ...(await filesMatching('src/client', '.tsx')),
];
for (const path of clientFiles) {
  const level = path.split('/')[2];
  if (path.split('/').length === 3 || !allowedImports[level]) {
    errors.push(
      `${path}: place components in a level folder (${Object.keys(allowedImports).join(', ')})`,
    );
    continue;
  }
  for (const [, specifier] of (await readFile(path, 'utf8')).matchAll(
    /(?:from|import)\s+['"](\.[^'"]+)['"]/g,
  )) {
    const resolved = posix.join(posix.dirname(path), specifier);
    const target = resolved.startsWith('src/client/')
      ? resolved.split('/')[2]
      : resolved.startsWith('src/shared/')
        ? 'shared'
        : resolved;
    if (!allowedImports[level].includes(target))
      errors.push(`${path}: ${level}/ must not import ${target}/ (${specifier})`);
  }
  if (level === 'ui' || level === 'brand' || !path.endsWith('.tsx')) continue;
  if (level === 'views' && !sources.has(path))
    errors.push(`${path}: view registry and live story required`);
  const source = ts.createSourceFile(
    path,
    await readFile(path, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  function visit(node) {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = node.tagName.getText(source);
      const repeatedClasses = [
        'panel',
        'form-body',
        'form-footer',
        'form-grid',
        'stats-grid',
        'table-scroll',
        'segmented',
      ];
      const className = node.attributes.properties.find(
        (attribute) =>
          ts.isJsxAttribute(attribute) && attribute.name.getText(source) === 'className',
      );
      if (
        /^[a-z]/.test(tag) &&
        className?.initializer &&
        ts.isStringLiteral(className.initializer) &&
        className.initializer.text.split(/\s+/).some((value) => repeatedClasses.includes(value))
      )
        errors.push(
          `${path}: use a shared composition component for ${className.initializer.text}`,
        );
      if (['button', 'input', 'textarea', 'select', 'label'].includes(tag)) {
        const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
        errors.push(`${path}:${line}: use the shared UI component instead of <${tag}>`);
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
}
if (errors.length) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
} else
  console.log(
    `UI catalog: ${catalog.length} components · ${files.length} story files · ${screens.length} screen sources · shared control boundary valid`,
  );
