// Replaces the local D1 data with the Storybook sample (src/stories/fixtures.ts), owned by the dev account.
import { writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { runnerImport } from 'vite';

const { module } = await runnerImport(resolve('src/stories/fixtures.ts'));
const { ledgers, records, members, assets, messages } = module;
const text = (value) => `'${String(value).replaceAll("'", "''")}'`;
const row = (table, values) => `INSERT INTO ${table} VALUES (${values.map(text).join(', ')});`;
const now = new Date().toISOString();

const sql = [
  'DELETE FROM friendships;',
  'DELETE FROM ledger_invites;',
  'DELETE FROM messages;',
  'DELETE FROM assets;',
  'DELETE FROM record_reactions;',
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
        .join(', ')}, ${record.notInAsset ? 1 : 0});`,
  ),
  ...records.flatMap((record) =>
    Object.entries(record.reactions ?? {}).flatMap(([reaction, userIds]) =>
      userIds.map((userId) =>
        row('record_reactions', [record.id, reaction, userId, record.createdAt]),
      ),
    ),
  ),
  ...assets.map(
    (asset) =>
      `INSERT INTO assets VALUES (${[asset.id, 'dev', asset.name, asset.kind].map(text).join(', ')}, ${asset.balance}, ${[
        asset.since,
        JSON.stringify(asset.ledgerIds),
        now,
        now,
      ]
        .map(text)
        .join(', ')});`,
  ),
  ...messages.map((message) =>
    row('messages', [
      message.id,
      message.ledgerId,
      message.authorId,
      message.text ?? '',
      message.sticker ?? '',
      message.createdAt,
    ]).replaceAll(", ''", ', NULL'),
  ),
  // People for the 친구 tab: 예디 (u2) is a friend; 준상 (u1) has sent a request to answer.
  row('friendships', ['dev', 'u2', 'friend', now]),
  row('friendships', ['u2', 'dev', 'friend', now]),
  row('friendships', ['u1', 'dev', 'outgoing', now]),
  row('friendships', ['dev', 'u1', 'incoming', now]),
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
