ALTER TABLE ledgers ADD COLUMN period_start_day INTEGER NOT NULL DEFAULT 1 CHECK(period_start_day BETWEEN 1 AND 31);
ALTER TABLE ledgers ADD COLUMN fixed_expense_tag_ids TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(fixed_expense_tag_ids));
ALTER TABLE ledgers ADD COLUMN tag_mappings TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(tag_mappings));
ALTER TABLE tags ADD COLUMN parent_id TEXT REFERENCES tags(id);
CREATE INDEX tags_parent ON tags(household_id,parent_id);
