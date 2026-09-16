PRAGMA foreign_keys = ON;

CREATE TABLE households (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0)
);
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES households(id),
  name TEXT NOT NULL,
  color TEXT NOT NULL,
  UNIQUE (household_id, id)
);
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  expires_at INTEGER NOT NULL
);
CREATE INDEX sessions_expiry ON sessions(expires_at);

CREATE TABLE ledgers (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES households(id),
  name TEXT NOT NULL,
  icon TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('main', 'purpose')),
  parent_id TEXT REFERENCES ledgers(id),
  budget INTEGER NOT NULL DEFAULT 0 CHECK (budget >= 0),
  start_date TEXT,
  end_date TEXT,
  archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1)),
  version INTEGER NOT NULL DEFAULT 1,
  UNIQUE (household_id, id),
  CHECK (parent_id IS NULL OR (kind = 'purpose' AND parent_id != id))
);
CREATE UNIQUE INDEX one_main_per_household ON ledgers(household_id) WHERE kind = 'main';
CREATE INDEX ledgers_household ON ledgers(household_id, parent_id);

CREATE TABLE assets (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES households(id),
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('asset', 'liability')),
  opening_balance INTEGER NOT NULL,
  color TEXT NOT NULL,
  UNIQUE (household_id, id)
);
CREATE TABLE payment_methods (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES households(id),
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('card', 'account', 'cash')),
  owner_id TEXT NOT NULL CHECK (owner_id IN ('u1', 'u2', 'shared')),
  closing_day INTEGER CHECK (closing_day BETWEEN 1 AND 31),
  payment_day INTEGER CHECK (payment_day BETWEEN 1 AND 31),
  UNIQUE (household_id, id)
);
CREATE TABLE tags (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES households(id),
  name TEXT NOT NULL,
  color TEXT NOT NULL,
  UNIQUE (household_id, id)
);
CREATE TABLE rules (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES households(id),
  tag_id TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('asset-expense', 'asset-income', 'saving', 'transfer')),
  version INTEGER NOT NULL DEFAULT 1,
  UNIQUE (household_id, id),
  UNIQUE (household_id, tag_id),
  FOREIGN KEY (household_id, tag_id) REFERENCES tags(household_id, id)
);

CREATE TABLE transactions (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES households(id),
  ledger_id TEXT NOT NULL,
  date TEXT NOT NULL,
  description TEXT NOT NULL,
  amount INTEGER NOT NULL CHECK (typeof(amount) = 'integer' AND amount > 0 AND amount <= 9007199254740991),
  type TEXT NOT NULL CHECK (type IN ('expense', 'income', 'saving', 'transfer')),
  category TEXT NOT NULL,
  owner_id TEXT NOT NULL CHECK (owner_id IN ('u1', 'u2', 'shared')),
  payment_method_id TEXT NOT NULL,
  tag_ids TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(tag_ids)),
  asset_id TEXT,
  to_asset_id TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  deleted_at TEXT,
  UNIQUE (household_id, id),
  FOREIGN KEY (household_id, ledger_id) REFERENCES ledgers(household_id, id),
  FOREIGN KEY (household_id, payment_method_id) REFERENCES payment_methods(household_id, id),
  FOREIGN KEY (household_id, asset_id) REFERENCES assets(household_id, id),
  FOREIGN KEY (household_id, to_asset_id) REFERENCES assets(household_id, id),
  FOREIGN KEY (household_id, updated_by) REFERENCES users(household_id, id)
);
CREATE INDEX transactions_ledger_date ON transactions(household_id, ledger_id, date);
CREATE INDEX transactions_payment_date ON transactions(household_id, payment_method_id, date);

-- Balances are derived from immutable opening values and the current effects of
-- each transaction. Concurrent transactions never overwrite a cached balance.
CREATE TABLE asset_movements (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES households(id),
  transaction_id TEXT NOT NULL,
  asset_id TEXT NOT NULL,
  amount INTEGER NOT NULL CHECK (typeof(amount) = 'integer'),
  rule_id TEXT NOT NULL,
  rule_version INTEGER NOT NULL,
  FOREIGN KEY (household_id, transaction_id) REFERENCES transactions(household_id, id),
  FOREIGN KEY (household_id, asset_id) REFERENCES assets(household_id, id),
  FOREIGN KEY (household_id, rule_id) REFERENCES rules(household_id, id),
  UNIQUE (transaction_id, asset_id)
);
CREATE INDEX movements_asset ON asset_movements(household_id, asset_id);

CREATE TABLE mutation_receipts (
  household_id TEXT NOT NULL REFERENCES households(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  mutation_id TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  result_json TEXT,
  created_at TEXT NOT NULL,
  guard_valid INTEGER NOT NULL CONSTRAINT mutation_version_guard CHECK (guard_valid = 1),
  PRIMARY KEY (household_id, user_id, mutation_id)
);
CREATE TABLE changes (
  household_id TEXT NOT NULL REFERENCES households(id),
  revision INTEGER NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  ledger_id TEXT,
  actor_id TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  PRIMARY KEY (household_id, revision)
);
