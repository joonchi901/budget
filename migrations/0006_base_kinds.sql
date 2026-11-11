-- 수입 and 지출 are every ledger's base 유형: always there, never archived, names fixed.
-- Ledgers saved before the flag existed get it on the kinds with those names.
UPDATE ledgers
SET kinds = (
  SELECT json_group_array(
    CASE
      WHEN json_extract(value, '$.name') IN ('수입', '지출')
        THEN json_set(json_remove(value, '$.archived'), '$.base', json('true'))
      ELSE json(value)
    END
  )
  FROM json_each(ledgers.kinds)
)
WHERE json_array_length(kinds) > 0;
