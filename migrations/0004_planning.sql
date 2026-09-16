-- Plans are independent of transactions and asset effects. Actuals are read from original records.
CREATE TABLE planning_records (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES households(id),
  ledger_id TEXT NOT NULL REFERENCES ledgers(id),
  kind TEXT NOT NULL CHECK (kind IN ('budget','goal','payroll','event','schedule')),
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
  archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0,1)),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX planning_household_ledger ON planning_records(household_id,ledger_id,kind,archived);
