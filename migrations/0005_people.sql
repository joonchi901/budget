-- Profiles, friends, ledger invitations, signup links and what each member has seen (§7).
ALTER TABLE users ADD COLUMN avatar TEXT NOT NULL DEFAULT 'happy';
ALTER TABLE users ADD COLUMN photo_version INTEGER;
ALTER TABLE users ADD COLUMN handle_changed_at TEXT;
ALTER TABLE users ADD COLUMN email TEXT;

-- One re-encoded WebP per user; served from this app only.
CREATE TABLE photos (
  user_id TEXT PRIMARY KEY REFERENCES users (id),
  data BLOB NOT NULL,
  updated_at TEXT NOT NULL
);

-- One row per direction, from user_id's side: friend, outgoing, incoming or blocked.
CREATE TABLE friendships (
  user_id TEXT NOT NULL REFERENCES users (id),
  other_id TEXT NOT NULL REFERENCES users (id),
  status TEXT NOT NULL CHECK (status IN ('friend', 'outgoing', 'incoming', 'blocked')),
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, other_id)
);

-- A ledger invitation waiting for the invitee; it grants nothing until accepted.
CREATE TABLE ledger_invites (
  id TEXT PRIMARY KEY,
  ledger_id TEXT NOT NULL REFERENCES ledgers (id),
  invitee_id TEXT NOT NULL REFERENCES users (id),
  inviter_id TEXT NOT NULL REFERENCES users (id),
  role TEXT NOT NULL CHECK (role IN ('editor', 'viewer')),
  created_at TEXT NOT NULL,
  UNIQUE (ledger_id, invitee_id)
);
CREATE INDEX ledger_invites_invitee ON ledger_invites (invitee_id);

-- Each user's one signup link; making a new one ends the old.
CREATE TABLE signup_links (
  owner_id TEXT PRIMARY KEY REFERENCES users (id),
  token TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  joined INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

-- When the member last opened the room, for the new-record badge.
ALTER TABLE ledger_members ADD COLUMN seen_at TEXT;
