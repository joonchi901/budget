import { afterEach, describe, expect, it } from 'vitest';
import { readFile, readdir } from 'node:fs/promises';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';

let runtime: Miniflare | undefined;
afterEach(async () => {
  await runtime?.dispose();
});
const migrationName = '0013_nullable_transaction_payment.sql';
async function statements(path: string) {
  return (await readFile(path, 'utf8'))
    .split(';')
    .map((v) => v.trim())
    .filter(Boolean);
}

describe('nullable payment migration with existing foreign key children', () => {
  it('preserves records and financial effects, rolls back failed batches, and keeps known payment FKs', async () => {
    runtime = new Miniflare(
      convertV4MiniflareOptions({
        modules: true,
        script: 'export default { fetch() { return new Response("migration fixture"); } };',
        compatibilityDate: '2026-09-16',
        d1Databases: ['DB'],
      }),
    );
    const db = await runtime.getD1Database('DB');
    for (const name of (await readdir('migrations'))
      .filter((v) => v.endsWith('.sql') && v < migrationName)
      .sort())
      for (const sql of await statements(`migrations/${name}`)) await db.prepare(sql).run();
    for (const sql of await statements('seeds/demo.sql')) await db.prepare(sql).run();
    await db
      .prepare(
        "INSERT INTO rules(id,household_id,tag_id,name,type) VALUES('migration-rule','home','daily','legacy fixture','asset-expense')",
      )
      .run();
    await db
      .prepare(
        "INSERT INTO asset_movements(id,household_id,transaction_id,asset_id,amount,rule_id,rule_version) VALUES('migration-movement','home','demo-market','reserve',-17,'migration-rule',1)",
      )
      .run();
    await db
      .prepare(
        "INSERT INTO asset_effects(id,household_id,transaction_id,asset_id,amount,savings_amount,savings_tracking,date,description,actor_id) VALUES('migration-effect','home','demo-market','reserve',-17,-17,1,'2026-09-14','retained effect','u1')",
      )
      .run();
    await db
      .prepare(
        "INSERT INTO asset_operations(id,household_id,type,date,description,asset_id,amount,target_balance,created_by,created_at) VALUES('migration-adjust','home','adjustment','2026-09-15','retained operation','reserve',50,100,'u1','2026-09-15T00:00:00Z')",
      )
      .run();
    await db
      .prepare(
        "INSERT INTO asset_effects(id,household_id,operation_id,asset_id,amount,savings_amount,savings_tracking,date,description,actor_id) VALUES('migration-operation-effect','home','migration-adjust','reserve',50,0,0,'2026-09-15','retained operation effect','u1')",
      )
      .run();
    await db
      .prepare(
        "INSERT INTO import_records(id,household_id,source_id,row_id,content_hash,payload_json,transaction_id,imported_at,actor_id,batch_id) VALUES('migration-import','home','fixture','row-1','hash','{}','demo-market','2026-09-15T00:00:00Z','u1','batch-1')",
      )
      .run();
    await db
      .prepare(
        "UPDATE transactions SET created_by='u1',created_at=updated_at,version=7 WHERE id='demo-market'",
      )
      .run();
    await db
      .prepare("UPDATE transactions SET deleted_at='2026-09-17T00:00:00Z' WHERE id='demo-dinner'")
      .run();
    const tracked = [
      'transactions',
      'asset_movements',
      'asset_effects',
      'asset_operations',
      'import_records',
      'record_history',
    ];
    const snapshot = async () =>
      Object.fromEntries(
        await Promise.all(
          tracked.map(async (table) => [
            table,
            (await db.prepare(`SELECT * FROM ${table} ORDER BY id`).all()).results,
          ]),
        ),
      );
    const before = await snapshot();
    const migration = await statements(`migrations/${migrationName}`);
    await expect(
      db.batch([
        ...migration.map((sql) => db.prepare(sql)),
        db.prepare(
          "UPDATE transactions SET payment_method_id='invalid-parent' WHERE id='demo-market'",
        ),
      ]),
    ).rejects.toThrow();
    expect(await snapshot()).toEqual(before);
    let columns = (
      await db.prepare('PRAGMA table_info(transactions)').all<{ name: string; notnull: number }>()
    ).results;
    expect(columns.find((c) => c.name === 'payment_method_id')!.notnull).toBe(1);
    await db.batch(migration.map((sql) => db.prepare(sql)));
    expect(await snapshot()).toEqual(before);
    expect((await db.prepare('PRAGMA foreign_key_check').all()).results).toEqual([]);
    columns = (
      await db.prepare('PRAGMA table_info(transactions)').all<{ name: string; notnull: number }>()
    ).results;
    expect(columns.find((c) => c.name === 'payment_method_id')!.notnull).toBe(0);
    expect(
      (await db.prepare("SELECT name FROM sqlite_master WHERE name LIKE '_m0013_%'").all()).results,
    ).toEqual([]);
    expect(
      (await db.prepare('PRAGMA index_list(transactions)').all<{ name: string }>()).results.map(
        (r) => r.name,
      ),
    ).toEqual(expect.arrayContaining(['transactions_ledger_date', 'transactions_payment_date']));
    await db.prepare("UPDATE transactions SET payment_method_id=NULL WHERE id='demo-market'").run();
    expect(
      await db
        .prepare("SELECT payment_method_id FROM transactions WHERE id='demo-market'")
        .first('payment_method_id'),
    ).toBeNull();
    await expect(
      db
        .prepare(
          "UPDATE transactions SET payment_method_id='invalid-parent' WHERE id='demo-market'",
        )
        .run(),
    ).rejects.toThrow();
    expect((await db.prepare('PRAGMA foreign_key_check').all()).results).toEqual([]);
    expect((await db.prepare('SELECT * FROM asset_effects ORDER BY id').all()).results).toEqual(
      before.asset_effects,
    );
  });
});
