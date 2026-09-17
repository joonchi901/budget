import { readFile, access, readdir } from 'node:fs/promises';
import { join } from 'node:path';

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
async function stories(dir) {
  const files = await readdir(dir, { withFileTypes: true });
  return (
    await Promise.all(
      files.map((item) =>
        item.isDirectory()
          ? stories(join(dir, item.name))
          : item.name.endsWith('.stories.tsx')
            ? [join(dir, item.name)]
            : [],
      ),
    )
  ).flat();
}
const files = await stories('src/stories');
for (const path of files) {
  const text = await readFile(path, 'utf8');
  if (!/title:\s*['"]0[0-5] /.test(text)) errors.push(`${path}: hierarchy title missing`);
  if (/from ['"].*\/(App|useBudget)['"]/.test(text))
    errors.push(`${path}: production app/session must not mount in Storybook`);
}
if (errors.length) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
} else
  console.log(
    `UI catalog: ${catalog.length} entries · ${files.length} story files · source references valid`,
  );
