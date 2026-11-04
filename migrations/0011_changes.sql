-- What changed, for the sync feed. Rows carry no payload: the feed re-reads the target.
-- ledger_id scopes a row to a ledger's members; user_id to one user. One or both are set.
CREATE TABLE changes (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,            -- ledger | record | message | asset | members | friends | invites | seen | me
  id TEXT NOT NULL,              -- the target's id; for members/friends/invites/me, the scope id
  ledger_id TEXT,
  user_id TEXT,
  at TEXT NOT NULL
);
CREATE INDEX changes_ledger ON changes (ledger_id, seq);
CREATE INDEX changes_user ON changes (user_id, seq);

-- The feed answers resync when a client's cursor is older than what was pruned.
CREATE TABLE sync_meta (key TEXT PRIMARY KEY, value INTEGER NOT NULL);
INSERT INTO sync_meta VALUES ('pruned_to', 0);

-- 대화 soft delete: the row stays as a tombstone so answers to it read 삭제된 메시지.
ALTER TABLE messages ADD COLUMN deleted_at TEXT;
