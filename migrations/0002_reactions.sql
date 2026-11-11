-- Uga sticker reactions on records: one row per member and sticker.
CREATE TABLE record_reactions (
  record_id TEXT NOT NULL REFERENCES records (id) ON DELETE CASCADE,
  reaction TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users (id),
  created_at TEXT NOT NULL,
  PRIMARY KEY (record_id, reaction, user_id)
);
