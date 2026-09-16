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
INSERT OR IGNORE INTO tags (id, household_id, name, color) VALUES
  ('daily', 'home', '일상', '#7972e8'),
  ('together', 'home', '함께', '#d9779b'),
  ('travel', 'home', '여행', '#e9ac56'),
  ('asset-use', 'home', '자산 사용', '#4b9a83'),
  ('asset-in', 'home', '자산 입금', '#6a9fbd'),
  ('save', 'home', '저축', '#70a08e'),
  ('move', 'home', '이체', '#9c91c7');
INSERT OR IGNORE INTO rules (id, household_id, tag_id, name, type) VALUES
  ('rule-expense', 'home', 'asset-use', '선택한 자산에서 지출 차감', 'asset-expense'),
  ('rule-income', 'home', 'asset-in', '선택한 자산에 수입 반영', 'asset-income'),
  ('rule-saving', 'home', 'save', '출금 자산에서 저축 자산으로 이동', 'saving'),
  ('rule-transfer', 'home', 'move', '두 자산 사이 이체', 'transfer');
INSERT OR IGNORE INTO transactions (id, household_id, ledger_id, date, description, amount, type, category, owner_id, payment_method_id, tag_ids, updated_at, updated_by) VALUES
  ('demo-salary', 'home', 'main', '2026-09-01', '9월 월급', 4200000, 'income', '급여', 'u1', 'account', '[]', '2026-09-01T09:00:00.000Z', 'u1'),
  ('demo-market', 'home', 'main', '2026-09-14', '주말 장보기', 68400, 'expense', '식비', 'shared', 'card-j', '["daily","together"]', '2026-09-14T09:00:00.000Z', 'u1'),
  ('demo-coffee', 'home', 'main', '2026-09-15', '출근길 커피', 4800, 'expense', '카페', 'u2', 'card-w', '["daily"]', '2026-09-15T09:00:00.000Z', 'u2'),
  ('demo-dinner', 'home', 'main', '2026-09-15', '둘이서 저녁', 42000, 'expense', '외식', 'shared', 'card-j', '["together"]', '2026-09-15T11:00:00.000Z', 'u1'),
  ('demo-flight', 'home', 'trip', '2026-09-12', '제주 왕복 항공권', 268000, 'expense', '교통', 'shared', 'card-w', '["travel"]', '2026-09-12T09:00:00.000Z', 'u2');
