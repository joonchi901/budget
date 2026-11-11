-- 반복 내역: a ledger's rules, and on each record the rule that wrote it ahead and whether its
-- varying amount still needs checking.
ALTER TABLE ledgers ADD COLUMN recurring TEXT;
ALTER TABLE records ADD COLUMN recurring_id TEXT;
ALTER TABLE records ADD COLUMN unconfirmed INTEGER NOT NULL DEFAULT 0;
