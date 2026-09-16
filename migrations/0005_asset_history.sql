-- Existing opening dates are unknown: never invent an effective date for user balances.
ALTER TABLE assets ADD COLUMN opening_date TEXT;
ALTER TABLE assets ADD COLUMN archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0,1));
ALTER TABLE assets ADD COLUMN metadata_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(metadata_json));
CREATE INDEX asset_effects_asset_date ON asset_effects(household_id, asset_id, date);
