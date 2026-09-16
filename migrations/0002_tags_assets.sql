-- v1 tables and audit records are retained. All new balances read asset_effects.
CREATE TABLE tag_groups (
 id TEXT PRIMARY KEY, household_id TEXT NOT NULL REFERENCES households(id),
 name TEXT NOT NULL, selection_mode TEXT NOT NULL CHECK(selection_mode IN ('single','multiple')),
 applies_to TEXT NOT NULL CHECK(applies_to IN ('transaction','asset')),
 role TEXT NOT NULL DEFAULT 'regular' CHECK(role IN ('category','regular')),
 ledger_ids TEXT CHECK(ledger_ids IS NULL OR json_valid(ledger_ids)),
 sort_order INTEGER NOT NULL DEFAULT 0, archived INTEGER NOT NULL DEFAULT 0 CHECK(archived IN (0,1)),
 version INTEGER NOT NULL DEFAULT 1, UNIQUE(household_id,id)
);
CREATE UNIQUE INDEX category_group ON tag_groups(household_id) WHERE role='category';
INSERT INTO tag_groups(id,household_id,name,selection_mode,applies_to,role,sort_order)
 SELECT 'group-category-'||id,id,'분류','single','transaction','category',0 FROM households;
INSERT INTO tag_groups(id,household_id,name,selection_mode,applies_to,sort_order)
 SELECT 'group-detail-'||id,id,'상세 태그','multiple','transaction',1 FROM households;
INSERT INTO tag_groups(id,household_id,name,selection_mode,applies_to,sort_order)
 SELECT 'group-asset-'||id,id,'자산 목적','multiple','asset',2 FROM households;
ALTER TABLE tags ADD COLUMN group_id TEXT REFERENCES tag_groups(id);
ALTER TABLE tags ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;
ALTER TABLE tags ADD COLUMN archived INTEGER NOT NULL DEFAULT 0 CHECK(archived IN (0,1));
ALTER TABLE tags ADD COLUMN version INTEGER NOT NULL DEFAULT 1;
UPDATE tags SET group_id='group-detail-'||household_id;
INSERT INTO tags(id,household_id,name,color,group_id)
 SELECT 'category-'||household_id||'-'||lower(hex(category)),household_id,category,'#7972e8','group-category-'||household_id
 FROM transactions WHERE type IN ('income','expense') AND category<>'' GROUP BY household_id,category;
UPDATE transactions SET tag_ids=json_insert(tag_ids,'$[#]','category-'||household_id||'-'||lower(hex(category)))
 WHERE type IN ('income','expense') AND category<>'';
CREATE UNIQUE INDEX tag_name_in_group ON tags(household_id,group_id,name);
ALTER TABLE assets ADD COLUMN tag_ids TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(tag_ids));
ALTER TABLE assets ADD COLUMN track_savings INTEGER NOT NULL DEFAULT 0 CHECK(track_savings IN (0,1));
ALTER TABLE assets ADD COLUMN version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE transactions ADD COLUMN allocations_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(allocations_json));
UPDATE transactions SET allocations_json=COALESCE((SELECT json_group_array(json_object('assetId',asset_id,'amount',abs(amount)))
 FROM asset_movements m WHERE m.transaction_id=transactions.id),'[]') WHERE type IN ('expense','income');
CREATE TABLE asset_operations (
 id TEXT PRIMARY KEY, household_id TEXT NOT NULL REFERENCES households(id), type TEXT NOT NULL CHECK(type IN ('transfer','adjustment')),
 date TEXT NOT NULL, description TEXT NOT NULL, from_asset_id TEXT, to_asset_id TEXT, asset_id TEXT,
 amount INTEGER NOT NULL CHECK(typeof(amount)='integer'), target_balance INTEGER,
 version INTEGER NOT NULL DEFAULT 1, created_by TEXT NOT NULL, created_at TEXT NOT NULL, deleted_at TEXT,
 legacy_transaction_id TEXT UNIQUE, UNIQUE(household_id,id),
 FOREIGN KEY(household_id,from_asset_id) REFERENCES assets(household_id,id),
 FOREIGN KEY(household_id,to_asset_id) REFERENCES assets(household_id,id),
 FOREIGN KEY(household_id,asset_id) REFERENCES assets(household_id,id),
 FOREIGN KEY(household_id,created_by) REFERENCES users(household_id,id)
);
INSERT INTO asset_operations(id,household_id,type,date,description,from_asset_id,to_asset_id,amount,created_by,created_at,deleted_at,legacy_transaction_id)
 SELECT 'legacy-'||id,household_id,'transfer',date,description,asset_id,to_asset_id,amount,updated_by,updated_at,deleted_at,id
 FROM transactions WHERE type IN ('saving','transfer');
CREATE TABLE asset_effects (
 id TEXT PRIMARY KEY, household_id TEXT NOT NULL REFERENCES households(id), transaction_id TEXT, operation_id TEXT,
 asset_id TEXT NOT NULL, amount INTEGER NOT NULL CHECK(typeof(amount)='integer'),
 savings_amount INTEGER NOT NULL DEFAULT 0 CHECK(typeof(savings_amount)='integer'),
 savings_tracking INTEGER NOT NULL DEFAULT 0 CHECK(savings_tracking IN (0,1)),
 date TEXT NOT NULL, description TEXT NOT NULL, actor_id TEXT NOT NULL,
 CHECK((transaction_id IS NULL)!=(operation_id IS NULL)),
 FOREIGN KEY(household_id,transaction_id) REFERENCES transactions(household_id,id),
 FOREIGN KEY(household_id,operation_id) REFERENCES asset_operations(household_id,id),
 FOREIGN KEY(household_id,asset_id) REFERENCES assets(household_id,id),
 FOREIGN KEY(household_id,actor_id) REFERENCES users(household_id,id),
 UNIQUE(transaction_id,asset_id), UNIQUE(operation_id,asset_id)
);
CREATE INDEX effects_asset ON asset_effects(household_id,asset_id);
INSERT INTO asset_effects(id,household_id,transaction_id,operation_id,asset_id,amount,savings_amount,savings_tracking,date,description,actor_id)
 SELECT m.id,m.household_id,CASE WHEN t.type IN ('expense','income') THEN t.id ELSE NULL END,
 CASE WHEN t.type IN ('saving','transfer') THEN 'legacy-'||t.id ELSE NULL END,m.asset_id,m.amount,
 CASE WHEN t.type='saving' AND m.amount>0 THEN m.amount ELSE 0 END,
 CASE WHEN t.type='saving' AND m.amount>0 THEN 1 ELSE 0 END,t.date,t.description,t.updated_by
 FROM asset_movements m JOIN transactions t ON t.id=m.transaction_id;
