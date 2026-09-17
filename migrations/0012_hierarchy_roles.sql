ALTER TABLE households ADD COLUMN hierarchy_version INTEGER NOT NULL DEFAULT 1 CHECK (hierarchy_version > 0);
ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin','user'));
UPDATE users SET role='admin' WHERE id='u1';
ALTER TABLE ledgers ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;
UPDATE ledgers SET sort_order=(SELECT COUNT(*) FROM ledgers sibling WHERE sibling.household_id=ledgers.household_id AND sibling.parent_id IS ledgers.parent_id AND sibling.rowid<ledgers.rowid);
CREATE INDEX ledgers_sibling_order ON ledgers(household_id,parent_id,sort_order,id);
