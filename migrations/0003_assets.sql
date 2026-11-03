-- The user's own assets (자산). ledger_ids is the JSON list of ledgers whose records move it.
CREATE TABLE assets (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users (id),
  name TEXT NOT NULL,
  kind TEXT NOT NULL,
  balance INTEGER NOT NULL,
  since TEXT NOT NULL,
  ledger_ids TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX assets_owner ON assets (owner_id);

-- 자산에 반영 off: the record stays out of its linked asset's balance.
ALTER TABLE records ADD COLUMN not_in_asset INTEGER NOT NULL DEFAULT 0;
