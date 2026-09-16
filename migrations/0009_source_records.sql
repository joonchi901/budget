-- Original evidence stays immutable. Users review pending items without inventing transactions.
CREATE TABLE source_records (
 id TEXT PRIMARY KEY,
 household_id TEXT NOT NULL REFERENCES households(id),
 source_id TEXT NOT NULL,
 source_location TEXT NOT NULL,
 kind TEXT NOT NULL CHECK(kind IN ('transaction','plan','management','reference')),
 payload_json TEXT NOT NULL CHECK(json_valid(payload_json)),
 note TEXT NOT NULL DEFAULT '',
 status TEXT NOT NULL CHECK(status IN ('pending','resolved','reference')),
 version INTEGER NOT NULL DEFAULT 1 CHECK(version > 0)
);
CREATE INDEX source_records_review ON source_records(household_id,status,source_id);
