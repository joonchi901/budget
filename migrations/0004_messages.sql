-- 대화: short messages or Uga stickers between a ledger's members.
CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  ledger_id TEXT NOT NULL REFERENCES ledgers (id),
  author_id TEXT NOT NULL REFERENCES users (id),
  text TEXT,
  sticker TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX messages_ledger ON messages (ledger_id, created_at);
