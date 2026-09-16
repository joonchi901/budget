-- Existing records retain unknown authorship rather than an inferred author.
ALTER TABLE transactions ADD COLUMN created_by TEXT;
ALTER TABLE transactions ADD COLUMN created_at TEXT;
CREATE TABLE record_history (
 id TEXT PRIMARY KEY,
 household_id TEXT NOT NULL REFERENCES households(id),
 revision INTEGER NOT NULL CHECK(revision >= 0),
 entity_type TEXT NOT NULL,
 entity_id TEXT NOT NULL,
 ledger_id TEXT,
 actor_id TEXT NOT NULL,
 created_at TEXT NOT NULL,
 action TEXT NOT NULL CHECK(action IN ('create','update','delete','import','restore','review')),
 before_json TEXT CHECK(before_json IS NULL OR json_valid(before_json)),
 after_json TEXT CHECK(after_json IS NULL OR json_valid(after_json)),
 FOREIGN KEY(household_id,actor_id) REFERENCES users(household_id,id)
);
CREATE INDEX record_history_household_revision ON record_history(household_id,revision DESC,created_at DESC);
CREATE INDEX record_history_entity ON record_history(household_id,entity_type,entity_id,revision DESC);
