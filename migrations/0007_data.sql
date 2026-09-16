CREATE TABLE import_records (
 id TEXT PRIMARY KEY,
 household_id TEXT NOT NULL REFERENCES households(id),
 source_id TEXT NOT NULL,
 row_id TEXT NOT NULL,
 content_hash TEXT NOT NULL,
 payload_json TEXT NOT NULL CHECK(json_valid(payload_json)),
 transaction_id TEXT NOT NULL,
 imported_at TEXT NOT NULL,
 actor_id TEXT NOT NULL,
 batch_id TEXT NOT NULL,
 UNIQUE(household_id,source_id,row_id),
 FOREIGN KEY(household_id,transaction_id) REFERENCES transactions(household_id,id),
 FOREIGN KEY(household_id,actor_id) REFERENCES users(household_id,id)
);
CREATE INDEX imports_source ON import_records(household_id, source_id);
