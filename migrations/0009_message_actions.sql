-- 대화 like a messenger: a message may answer another, and its author may change or delete it.
ALTER TABLE messages ADD COLUMN reply_to TEXT;
ALTER TABLE messages ADD COLUMN edited_at TEXT;
