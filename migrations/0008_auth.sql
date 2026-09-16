ALTER TABLE sessions ADD COLUMN auth_kind TEXT NOT NULL DEFAULT 'demo' CHECK (auth_kind IN ('demo','oidc'));
ALTER TABLE sessions ADD COLUMN identity_issuer TEXT;
ALTER TABLE sessions ADD COLUMN identity_subject TEXT;
CREATE TABLE auth_identities (
  issuer TEXT NOT NULL,
  subject TEXT NOT NULL,
  user_id TEXT NOT NULL UNIQUE REFERENCES users(id),
  email TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  created_at TEXT NOT NULL,
  PRIMARY KEY (issuer, subject)
);
CREATE TABLE auth_states (
  state_hash TEXT PRIMARY KEY,
  browser_hash TEXT NOT NULL,
  nonce TEXT NOT NULL,
  verifier TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX auth_states_expiry ON auth_states(expires_at);
