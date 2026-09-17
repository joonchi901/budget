-- An unknown payment method is NULL on a transaction, never a pretend cash account.
-- D1 migrations run atomically. Preserve child rows explicitly while replacing the
-- parent so foreign keys remain enabled, including in statement-by-statement tooling.
CREATE TABLE _m0013_asset_movements AS SELECT * FROM asset_movements;
CREATE TABLE _m0013_asset_effects AS SELECT * FROM asset_effects WHERE transaction_id IS NOT NULL;
CREATE TABLE _m0013_import_records AS SELECT * FROM import_records;
DELETE FROM asset_movements;
DELETE FROM asset_effects WHERE transaction_id IS NOT NULL;
DELETE FROM import_records;

CREATE TABLE transactions_nullable (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES households(id),
  ledger_id TEXT NOT NULL,
  date TEXT NOT NULL,
  description TEXT NOT NULL,
  amount INTEGER NOT NULL CHECK (typeof(amount) = 'integer' AND amount > 0 AND amount <= 9007199254740991),
  type TEXT NOT NULL CHECK (type IN ('expense', 'income', 'saving', 'transfer')),
  category TEXT NOT NULL,
  owner_id TEXT NOT NULL CHECK (owner_id IN ('u1', 'u2', 'shared')),
  payment_method_id TEXT,
  tag_ids TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(tag_ids)),
  asset_id TEXT,
  to_asset_id TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  deleted_at TEXT,
  allocations_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(allocations_json)),
  created_by TEXT,
  created_at TEXT,
  UNIQUE (household_id, id),
  FOREIGN KEY (household_id, ledger_id) REFERENCES ledgers(household_id, id),
  FOREIGN KEY (household_id, payment_method_id) REFERENCES payment_methods(household_id, id),
  FOREIGN KEY (household_id, asset_id) REFERENCES assets(household_id, id),
  FOREIGN KEY (household_id, to_asset_id) REFERENCES assets(household_id, id),
  FOREIGN KEY (household_id, updated_by) REFERENCES users(household_id, id)
);
INSERT INTO transactions_nullable (
  id,household_id,ledger_id,date,description,amount,type,category,owner_id,payment_method_id,
  tag_ids,asset_id,to_asset_id,version,updated_at,updated_by,deleted_at,allocations_json,created_by,created_at
) SELECT
  id,household_id,ledger_id,date,description,amount,type,category,owner_id,payment_method_id,
  tag_ids,asset_id,to_asset_id,version,updated_at,updated_by,deleted_at,allocations_json,created_by,created_at
FROM transactions;
DROP TABLE transactions;
ALTER TABLE transactions_nullable RENAME TO transactions;
CREATE INDEX transactions_ledger_date ON transactions(household_id,ledger_id,date);
CREATE INDEX transactions_payment_date ON transactions(household_id,payment_method_id,date);

INSERT INTO asset_movements SELECT * FROM _m0013_asset_movements;
INSERT INTO asset_effects SELECT * FROM _m0013_asset_effects;
INSERT INTO import_records SELECT * FROM _m0013_import_records;
DROP TABLE _m0013_asset_movements;
DROP TABLE _m0013_asset_effects;
DROP TABLE _m0013_import_records;
