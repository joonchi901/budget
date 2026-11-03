// Replaces the local D1 data with the Storybook sample (src/stories/fixtures.ts), owned by the dev account.
import { writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { runnerImport } from 'vite';

const { module } = await runnerImport(resolve('src/stories/fixtures.ts'));
const { ledgers, records, members } = module;
const text = (value) => `'${String(value).replaceAll("'", "''")}'`;
const row = (table, values) => `INSERT INTO ${table} VALUES (${values.map(text).join(', ')});`;
const now = new Date().toISOString();

const sql = [
  'DELETE FROM records;',
  'DELETE FROM ledger_children;',
  'DELETE FROM ledger_members;',
  'DELETE FROM ledgers;',
  'DELETE FROM users;',
  row('users', ['dev', 'dev', '개발자', now]),
  ...members.map((member) => row('users', [member.id, member.id, member.name, now])),
  ...ledgers.flatMap((ledger) => [
    `INSERT INTO ledgers VALUES (${[
      ledger.id,
      ledger.name,
      ledger.icon,
      ledger.period.start,
      ledger.period.end,
      JSON.stringify(ledger.kinds),
      JSON.stringify(ledger.fields),
    ]
      .map(text)
      .join(', ')}, ${ledger.archived ? 1 : 0}, ${text(now)}, ${text(now)});`,
    row('ledger_members', [ledger.id, 'dev', 'owner']),
  ]),
  ...ledgers.flatMap((ledger) =>
    ledger.childIds.map(
      (childId, position) =>
        `INSERT INTO ledger_children VALUES (${text(ledger.id)}, ${text(childId)}, ${position});`,
    ),
  ),
  ...records.map(
    (record) =>
      `INSERT INTO records VALUES (${[
        record.id,
        record.ledgerId,
        record.date,
        record.kindId,
        record.title,
      ]
        .map(text)
        .join(', ')}, ${record.amount}, ${[
        JSON.stringify(record.values),
        record.createdBy,
        record.createdAt,
        record.createdAt,
      ]
        .map(text)
        .join(', ')});`,
  ),
].join('\n');

const file = resolve('.wrangler/seed.sql');
writeFileSync(file, sql);
const result = spawnSync(
  'npx',
  ['wrangler', 'd1', 'execute', 'budget-dev', '--local', `--file=${file}`],
  { stdio: 'inherit', env: { ...process.env, CI: '1' } },
);
if (result.status === 0)
  console.log(`가계부 ${ledgers.length}개 · 내역 ${records.length}개를 넣었어요.`);
process.exit(result.status ?? 1);
