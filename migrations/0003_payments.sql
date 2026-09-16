-- Existing methods remain usable. Archiving never deletes historical references.
ALTER TABLE payment_methods ADD COLUMN details_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(details_json) AND json_type(details_json) = 'object');
ALTER TABLE payment_methods ADD COLUMN version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0);
ALTER TABLE payment_methods ADD COLUMN archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1));
CREATE INDEX payment_methods_active ON payment_methods(household_id, archived, type);
