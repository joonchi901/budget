-- Fictional data for local development. Remote deployment is not configured.
INSERT OR IGNORE INTO households (id, name) VALUES ('home', '우리의 가계부');
INSERT OR IGNORE INTO users (id, household_id, name, color) VALUES
  ('u1', 'home', '나', '#7972e8'), ('u2', 'home', '와이프', '#d9779b');
INSERT OR IGNORE INTO ledgers (id, household_id, name, icon, kind, parent_id, budget, start_date, end_date) VALUES
  ('main', 'home', '우리의 일상', '🏡', 'main', NULL, 2400000, NULL, NULL),
  ('trip', 'home', '제주에서 보내는 가을', '🍊', 'purpose', 'main', 1200000, '2026-09-20', '2026-09-24');
INSERT OR IGNORE INTO assets (id, household_id, name, kind, opening_balance, color) VALUES
  ('checking', 'home', '생활 통장', 'asset', 2800000, '#7972e8'),
  ('reserve', 'home', '예비금', 'asset', 500000, '#4b9a83'),
  ('investment', 'home', '투자금', 'asset', 4500000, '#e9ac56'),
  ('deposit', 'home', '전세금', 'asset', 100000000, '#6a9fbd'),
  ('loan', 'home', '전세 대출', 'liability', 50000000, '#b591bd');
INSERT OR IGNORE INTO payment_methods (id, household_id, name, type, owner_id, closing_day, payment_day) VALUES
  ('card-j', 'home', '나의 생활 카드', 'card', 'u1', 31, 15),
  ('card-w', 'home', '와이프의 카드', 'card', 'u2', 31, 12),
  ('account', 'home', '생활 통장', 'account', 'shared', NULL, NULL),
  ('cash', 'home', '현금', 'cash', 'shared', NULL, NULL);
INSERT OR IGNORE INTO tag_groups(id,household_id,name,selection_mode,applies_to,role,sort_order) VALUES
 ('group-category-home','home','분류','single','transaction','category',0),
 ('group-detail-home','home','상세 태그','multiple','transaction','regular',1),
 ('group-asset-home','home','자산 목적','multiple','asset','regular',2);
INSERT OR IGNORE INTO tags (id, household_id, name, color, group_id) VALUES
  ('daily', 'home', '일상', '#7972e8', 'group-detail-home'),
  ('together', 'home', '함께', '#d9779b', 'group-detail-home'),
  ('travel', 'home', '여행', '#e9ac56', 'group-detail-home'),
  ('asset-use', 'home', '자산 사용', '#4b9a83', 'group-detail-home'),
  ('asset-in', 'home', '자산 입금', '#6a9fbd', 'group-detail-home'),
  ('save', 'home', '저축', '#70a08e', 'group-detail-home'),
  ('move', 'home', '이체', '#9c91c7', 'group-detail-home');
INSERT OR IGNORE INTO tags(id,household_id,name,color,group_id,sort_order) VALUES
 ('category-home-eab889ec97ac','home','급여','#7972e8','group-category-home',0),
 ('category-home-ec8b9debb984','home','식비','#7972e8','group-category-home',1),
 ('category-home-ecb9b4ed8e98','home','카페','#7972e8','group-category-home',2),
 ('category-home-ec99b8ec8b9d','home','외식','#7972e8','group-category-home',3),
 ('category-home-eab590ed86b5','home','교통','#7972e8','group-category-home',4),
 ('category-home-ec839ded999c','home','생활','#7972e8','group-category-home',5),
 ('category-home-ec87bced9591','home','쇼핑','#7972e8','group-category-home',6),
 ('category-home-eca3bceab1b0','home','주거','#7972e8','group-category-home',7),
 ('category-home-ebacb8ed9994','home','문화','#7972e8','group-category-home',8),
 ('category-home-eab1b4eab095','home','건강','#7972e8','group-category-home',9),
 ('category-home-eab8b0ed8380','home','기타','#7972e8','group-category-home',10);
INSERT OR IGNORE INTO transactions (id, household_id, ledger_id, date, description, amount, type, category, owner_id, payment_method_id, tag_ids, updated_at, updated_by) VALUES
  ('demo-salary', 'home', 'main', '2026-09-01', '9월 월급', 4200000, 'income', '급여', 'u1', 'account', '["category-home-eab889ec97ac"]', '2026-09-01T09:00:00.000Z', 'u1'),
  ('demo-market', 'home', 'main', '2026-09-14', '주말 장보기', 68400, 'expense', '식비', 'shared', 'card-j', '["daily","together","category-home-ec8b9debb984"]', '2026-09-14T09:00:00.000Z', 'u1'),
  ('demo-coffee', 'home', 'main', '2026-09-15', '출근길 커피', 4800, 'expense', '카페', 'u2', 'card-w', '["daily","category-home-ecb9b4ed8e98"]', '2026-09-15T09:00:00.000Z', 'u2'),
  ('demo-dinner', 'home', 'main', '2026-09-15', '둘이서 저녁', 42000, 'expense', '외식', 'shared', 'card-j', '["together","category-home-ec99b8ec8b9d"]', '2026-09-15T11:00:00.000Z', 'u1'),
  ('demo-flight', 'home', 'trip', '2026-09-12', '제주 왕복 항공권', 268000, 'expense', '교통', 'shared', 'card-w', '["travel","category-home-eab590ed86b5"]', '2026-09-12T09:00:00.000Z', 'u2');

-- Explicit baseline for fictional seed balances. Real imports choose their own date.
UPDATE assets SET opening_date='2026-01-01' WHERE household_id='home' AND id IN ('checking','reserve','investment','deposit','loan') AND opening_date IS NULL;
