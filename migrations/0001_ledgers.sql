-- Accounts, ledgers, membership, parent links and records (docs/ledger-baseline.md).

-- Google login adds a separate identities table; local dev uses one fixed account.
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  handle TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL
);

-- kinds and fields are the ledger's own JSON (KindOption[] and FieldDef[]).
CREATE TABLE ledgers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  icon TEXT NOT NULL,
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  kinds TEXT NOT NULL,
  fields TEXT NOT NULL,
  archived INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Every request checks this table. A parent ledger only ever has its owner.
CREATE TABLE ledger_members (
  ledger_id TEXT NOT NULL REFERENCES ledgers (id),
  user_id TEXT NOT NULL REFERENCES users (id),
  role TEXT NOT NULL CHECK (role IN ('owner', 'editor', 'viewer')),
  PRIMARY KEY (ledger_id, user_id)
);
CREATE INDEX ledger_members_user ON ledger_members (user_id);

-- Parent → child links. They point, they grant nothing.
CREATE TABLE ledger_children (
  parent_id TEXT NOT NULL REFERENCES ledgers (id),
  child_id TEXT NOT NULL REFERENCES ledgers (id),
  position INTEGER NOT NULL,
  PRIMARY KEY (parent_id, child_id)
);
CREATE INDEX ledger_children_child ON ledger_children (child_id);

CREATE TABLE records (
  id TEXT PRIMARY KEY,
  ledger_id TEXT NOT NULL REFERENCES ledgers (id),
  date TEXT NOT NULL,
  kind_id TEXT NOT NULL,
  title TEXT NOT NULL,
  amount INTEGER NOT NULL CHECK (amount > 0),
  field_values TEXT NOT NULL,
  created_by TEXT NOT NULL REFERENCES users (id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX records_ledger_date ON records (ledger_id, date);
