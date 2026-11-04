-- Uga sticker reactions on 대화 messages, as on records: one row per member and sticker.
CREATE TABLE message_reactions (
  message_id TEXT NOT NULL REFERENCES messages (id) ON DELETE CASCADE,
  reaction TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users (id),
  created_at TEXT NOT NULL,
  PRIMARY KEY (message_id, reaction, user_id)
);
